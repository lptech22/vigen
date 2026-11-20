import { spawn } from 'node:child_process';
import path from 'node:path';
import crypto from 'node:crypto';
import { ROOT } from '../core/config.mjs';

const BIN = path.join(ROOT, 'bin/vigen.mjs');
const MAX_HISTORY = 12;
const MAX_QUEUE = 3;
const MAX_LOGS = 1500;
const LOG_REPLAY = 250;

export const ACTIONS = {
  still: { label: 'Frame', argv: (project, flags) => ['still', project.slug, ...atFlag(flags)] },
  check: { label: 'Check', argv: (project) => ['check', project.slug] },
  preview: { label: 'Preview', argv: (project) => ['preview', project.slug] },
  audio: { label: 'Audio', argv: (project) => ['audio', project.slug] },
  voice: { label: 'Voice', argv: (project) => ['voice', project.slug] },
  make: { label: 'Make', argv: (project, flags) => ['make', project.slug, ...(flags.force ? ['--force'] : [])] },
  qc: { label: 'QC', argv: (project, flags) => ['qc', project.slug, ...(flags.preview ? ['--preview'] : [])] },
  publish: { label: 'Publish', argv: (project) => ['publish', project.slug] },
};

function atFlag(flags) {
  const at = Number(flags.at);
  return Number.isFinite(at) && at >= 0 ? ['--at', String(at)] : [];
}

const jobs = new Map();
const order = [];
const queue = [];
const latest = new Map();
let running = null;

const ANSI = /\x1b\[[0-9;]*m/g;
const PROGRESS = /frame\s+(\d+)\/(\d+)\s+\(([\d.]+)%\)\s+([\d.]+)\s+fps/;

function publicJob(job, { logs = false } = {}) {
  return {
    id: job.id,
    action: job.action,
    label: ACTIONS[job.action]?.label || job.action,
    project: job.project.slug,
    projectName: job.project.name,
    status: job.status,
    queuePosition: job.status === 'queued' ? queue.indexOf(job.id) + 1 : 0,
    createdAt: job.createdAt,
    startedAt: job.startedAt,
    endedAt: job.endedAt,
    code: job.code,
    error: job.error,
    progress: job.progress,
    logCount: job.logs.length,
    ...(logs ? { logs: job.logs.slice(-LOG_REPLAY) } : {}),
  };
}

function emit(job, event) {
  for (const fn of job.listeners) {
    try { fn(event); } catch { /* klien putus */ }
  }
}

function pushLog(job, line) {
  const text = line.replace(ANSI, '').trimEnd();
  if (!text) return;
  const entry = { at: Date.now(), text };
  job.logs.push(entry);
  if (job.logs.length > MAX_LOGS) job.logs.splice(0, job.logs.length - MAX_LOGS);
  emit(job, { type: 'log', line: text, at: entry.at });
}

function pushProgress(job, match) {
  job.progress = {
    produced: Number(match[1]),
    total: Number(match[2]),
    pct: Number(match[3]),
    fps: Number(match[4]),
  };
  emit(job, { type: 'progress', ...job.progress });
}

function feed(job, chunk) {
  job.buffer += chunk.toString('utf8');
  let idx = job.buffer.search(/[\r\n]/);
  while (idx >= 0) {
    const line = job.buffer.slice(0, idx);
    job.buffer = job.buffer.slice(idx + 1);
    if (line.trim()) {
      const match = line.match(PROGRESS);
      if (match) pushProgress(job, match);
      else pushLog(job, line);
    }
    idx = job.buffer.search(/[\r\n]/);
  }
}

function finish(job, status, code, error) {
  if (job.status === 'done' || job.status === 'failed' || job.status === 'cancelled') return;
  job.status = status;
  job.code = code;
  job.error = error || null;
  job.endedAt = Date.now();
  delete job.child;
  clearTimeout(job.killTimer);
  emit(job, { type: 'status', status, code: job.code, error: job.error });
  if (running === job) running = null;
  prune();
  pump();
}

function prune() {
  while (order.length > MAX_HISTORY) {
    const id = order.shift();
    if (id === running?.id) { order.unshift(id); break; }
    const job = jobs.get(id);
    if (job && job.status === 'running') { order.unshift(id); break; }
    jobs.delete(id);
    for (const [slug, jobId] of latest) {
      if (jobId === id) latest.delete(slug);
    }
  }
}

function start(job) {
  job.status = 'running';
  job.startedAt = Date.now();
  job.buffer = '';
  running = job;
  emit(job, { type: 'status', status: 'running' });

  let child;
  try {
    child = spawn(process.execPath, [BIN, ...job.argv], {
      cwd: ROOT,
      env: { ...process.env, NO_COLOR: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: true,
    });
  } catch (err) {
    finish(job, 'failed', 1, err.message);
    return;
  }

  job.child = child;
  child.stdout.on('data', (c) => feed(job, c));
  child.stderr.on('data', (c) => feed(job, c));

  child.on('error', (err) => finish(job, 'failed', 1, err.message));
  child.on('close', (code, signal) => {
    if (job.cancelRequested) {
      finish(job, 'cancelled', code ?? 1, 'dibatalkan');
      return;
    }
    if (code === 0) {
      finish(job, 'done', 0);
    } else {
      const last = job.logs.length ? job.logs[job.logs.length - 1].text : '';
      finish(job, 'failed', code ?? 1, signal ? `berhenti (${signal})` : (last || `kode ${code}`));
    }
  });
}

function pump() {
  if (running) return;
  while (queue.length) {
    const id = queue.shift();
    const job = jobs.get(id);
    if (!job || job.status !== 'queued') continue;
    start(job);
    return;
  }
}

export function createJob({ project, action, flags = {} }) {
  const spec = ACTIONS[action];
  if (!spec) {
    const err = new Error(`aksi tidak dikenal: ${action}`);
    err.status = 400;
    throw err;
  }
  if (queue.length >= MAX_QUEUE) {
    const err = new Error('antrean penuh — tunggu job yang berjalan selesai');
    err.status = 409;
    throw err;
  }

  const job = {
    id: crypto.randomBytes(8).toString('hex'),
    action,
    argv: spec.argv(project, flags),
    project: { name: project.name, slug: project.slug },
    status: 'queued',
    createdAt: Date.now(),
    startedAt: null,
    endedAt: null,
    code: null,
    error: null,
    progress: null,
    logs: [],
    buffer: '',
    listeners: new Set(),
    cancelRequested: false,
    child: null,
    killTimer: null,
  };

  jobs.set(job.id, job);
  order.push(job.id);
  latest.set(project.slug, job.id);
  if (running) {
    queue.push(job.id);
    emit(job, { type: 'status', status: 'queued' });
  } else {
    start(job);
  }
  return job;
}

export function getJob(id) {
  return jobs.get(id) || null;
}

export function latestJobFor(slug) {
  const id = latest.get(slug);
  return id ? jobs.get(id) || null : null;
}

export function snapshot(job, { logs = false } = {}) {
  return publicJob(job, { logs });
}

export function subscribe(job, fn) {
  job.listeners.add(fn);
  return () => job.listeners.delete(fn);
}

export function cancelJob(id) {
  const job = jobs.get(id);
  if (!job) return null;
  if (job.status === 'queued') {
    const at = queue.indexOf(id);
    if (at >= 0) queue.splice(at, 1);
    finish(job, 'cancelled', 1, 'dibatalkan sebelum mulai');
    return job;
  }
  if (job.status !== 'running' || job.cancelRequested) return job;

  job.cancelRequested = true;
  pushLog(job, 'membatalkan job…');

  const pid = job.child?.pid;
  if (pid) {
    const kill = (signal) => {
      try { process.kill(-pid, signal); }
      catch { try { process.kill(pid, signal); } catch { /* sudah mati */ } }
    };
    kill('SIGTERM');
    job.killTimer = setTimeout(() => kill('SIGKILL'), 4000);
    job.killTimer.unref?.();
  }
  return job;
}

export function shutdownJobs() {
  for (const job of jobs.values()) {
    if (job.status === 'running' && job.child?.pid) {
      job.cancelRequested = true;
      try { process.kill(-job.child.pid, 'SIGKILL'); }
      catch { try { job.child.kill('SIGKILL'); } catch { /* noop */ } }
    }
  }
}

export function listJobs() {
  return order
    .map((id) => jobs.get(id))
    .filter(Boolean)
    .reverse()
    .map((job) => publicJob(job));
}
