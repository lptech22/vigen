import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { ensureDir, exists } from '../core/util.mjs';
import { ENGINE_VERSION, readJson, writeJson } from '../core/config.mjs';
import { openEncoder } from './encode.mjs';

function segName(i) {
  return `seg_${String(i).padStart(3, '0')}.mp4`;
}

export function emptyState(meta) {
  return { meta, segments: {}, hashes: {} };
}

export function loadState(workDir, meta) {
  const file = path.join(workDir, 'state.json');
  const state = readJson(file, null);
  if (!state || !state.meta) return { state: emptyState(meta), fresh: true, file };
  const same = ['width', 'height', 'fps', 'totalFrames', 'chunk', 'crf', 'preset', 'capture']
    .every((k) => state.meta[k] === meta[k]);
  if (!same || state.meta.engine !== meta.engine) {
    return { state: emptyState(meta), fresh: true, file, invalidated: true };
  }
  return { state, fresh: false, file };
}

export function saveState(file, state) {
  writeJson(file, state);
}

export function orderedSegmentFiles(workDir, state) {
  return Object.keys(state.segments)
    .map(Number)
    .sort((a, b) => a - b)
    .map((i) => path.join(workDir, 'segments', state.segments[i].file));
}

/**
 * Render frame ke segmen mp4 dengan dukungan resume.
 * Frame dikirim dari halaman via POST biner (host), bukan base64 lewat CDP.
 */
export async function renderVideo({ cfg, session, host, workDir, outDir, totalFrames, options = {} }) {
  const { width, height, fps } = cfg.output;
  const chunk = Number(options.chunk || cfg.render.chunk || 300);
  const stopAt = options.stopAt ? Math.min(Number(options.stopAt), totalFrames) : null;
  const hashEvery = options.hashEvery ? Math.max(1, Number(options.hashEvery)) : 0;
  const quiet = Boolean(options.quiet);
  const capture = String(options.capture || 'png');
  const kind = capture.split(':')[0];
  const input = kind === 'raw' ? 'raw' : 'image';

  const meta = {
    engine: ENGINE_VERSION,
    width, height, fps,
    totalFrames,
    chunk,
    crf: cfg.output.crf,
    preset: cfg.output.preset,
    capture,
  };

  ensureDir(workDir);
  ensureDir(outDir);
  const segDir = ensureDir(path.join(workDir, 'segments'));

  let { state, fresh, file: stateFile, invalidated } = loadState(workDir, meta);
  if (options.force) {
    state = emptyState(meta);
    fresh = true;
    invalidated = false;
  }
  if (fresh) {
    for (const f of fs.readdirSync(segDir)) {
      if (f.endsWith('.mp4')) fs.rmSync(path.join(segDir, f), { force: true });
    }
  } else {
    const known = new Set(Object.values(state.segments).map((s) => s.file));
    for (const f of fs.readdirSync(segDir)) {
      if (f.endsWith('.mp4') && !known.has(f)) fs.rmSync(path.join(segDir, f), { force: true });
    }
  }
  if (options.force || fresh) saveState(stateFile, state);

  if (invalidated && !quiet) {
    process.stdout.write('! konfigurasi render berbeda dari render sebelumnya — mulai dari awal\n');
  }

  const startedAt = Date.now();
  let framesRendered = 0;
  let framesSkipped = 0;
  let produced = 0;
  let stopped = false;
  let totalBytes = 0;
  let lastFrameBytes = 0;
  const segCount = Math.ceil(totalFrames / chunk);

  for (let i = 0; i < segCount; i++) {
    const start = i * chunk;
    const count = Math.min(chunk, totalFrames - start);
    const name = segName(i);
    const target = path.join(segDir, name);

    const recorded = state.segments[String(i)];
    if (!options.force && recorded && recorded.frames === count && exists(target)) {
      framesSkipped += count;
      produced += count;
      if (!quiet) process.stdout.write(`\r  segmen ${i + 1}/${segCount} dilewati (sudah ada)            `);
      continue;
    }

    fs.rmSync(target, { force: true });
    const enc = openEncoder(cfg, target, { fps, width, height, input });

    let written = 0;
    let currentFrame = -1;

    host.setHandler(async (buf) => {
      await enc.write(buf);
      totalBytes += buf.length;
      lastFrameBytes = buf.length;
      if (hashEvery && currentFrame >= 0 && currentFrame % hashEvery === 0) {
        state.hashes[String(currentFrame)] = crypto.createHash('sha256').update(buf).digest('hex');
      }
    });

    try {
      for (let f = 0; f < count; f++) {
        if (stopAt !== null && produced >= stopAt) {
          stopped = true;
          break;
        }
        const frameIndex = start + f;
        const t = frameIndex / fps;
        currentFrame = frameIndex;

        const t0 = Date.now();
        const res = await session.send('Runtime.evaluate', {
          expression: `window.__sendFrame(${Number(t.toFixed(6))}, '${capture}')`,
          awaitPromise: true,
          returnByValue: true,
        }, 60000);
        if (res.exceptionDetails) {
          throw new Error(`render frame ${frameIndex} gagal: ${res.exceptionDetails.text || 'unknown'}`);
        }
        const captureMs = Date.now() - t0;

        framesRendered++;
        produced++;
        written++;

        if (!quiet) {
          const elapsed = (Date.now() - startedAt) / 1000;
          const rate = framesRendered / Math.max(elapsed, 0.001);
          const pct = ((produced / (stopAt ?? totalFrames)) * 100).toFixed(1);
          process.stdout.write(
            `\r  frame ${String(produced).padStart(4)}/${stopAt ?? totalFrames} ` +
            `(${pct}%)  ${rate.toFixed(1)} fps  ${String(captureMs).padStart(3)} ms/frame  ` +
            `${String(Math.round(lastFrameBytes / 1024)).padStart(4)} KB   `
          );
        }
      }

      if (stopped) {
        await enc.abort();
        fs.rmSync(target, { force: true });
        saveState(stateFile, state);
        break;
      }

      await enc.finish();
      state.segments[String(i)] = { file: name, start, frames: written };
      saveState(stateFile, state);
    } catch (err) {
      await enc.abort();
      fs.rmSync(target, { force: true });
      throw err;
    }
  }

  if (!quiet) process.stdout.write('\n');

  const elapsedMs = Date.now() - startedAt;
  if (options.hashFile) writeJson(options.hashFile, state.hashes);

  return {
    framesRendered,
    framesSkipped,
    elapsedMs,
    stopped,
    hashes: state.hashes,
    produced,
    totalBytes,
    segmentFiles: orderedSegmentFiles(workDir, state),
  };
}
