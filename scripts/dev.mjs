#!/usr/bin/env node
/**
 * Run API (:4000) + Web (:5173) together for local development.
 * Usage: npm run dev
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const children = [
  spawn('npm', ['run', 'dev:server'], {
    cwd: root,
    stdio: 'inherit',
    shell: true,
  }),
  spawn('npm', ['run', 'dev:web'], {
    cwd: root,
    stdio: 'inherit',
    shell: true,
  }),
];

function shutdown(code = 0) {
  for (const child of children) {
    if (!child.killed) child.kill();
  }
  process.exit(code);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

for (const child of children) {
  child.on('exit', (code) => {
    if (code && code !== 0) shutdown(code);
  });
}
