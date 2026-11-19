#!/usr/bin/env node
import { main } from '../src/cli/index.mjs';

main(process.argv.slice(2)).then((code) => {
  process.exitCode = code ?? 0;
}).catch((err) => {
  const msg = err && err.message ? err.message : String(err);
  process.stderr.write(`\n\x1b[31m✗ ${msg}\x1b[0m\n`);
  if (process.env.VIGEN_DEBUG) process.stderr.write((err && err.stack) + '\n');
  process.exitCode = 1;
});
