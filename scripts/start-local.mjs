#!/usr/bin/env node
/**
 * One-command local bootstrap: migrate → seed → (optional demo encode) → start API.
 * Usage: npm run start:local
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: root,
      stdio: 'inherit',
      shell: true,
      ...opts,
    });
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} ${args.join(' ')} exited ${code}`));
    });
  });
}

async function main() {
  console.log('[start-local] migrate…');
  await run('npm', ['run', 'db:migrate']);
  console.log('[start-local] seed…');
  await run('npm', ['run', 'db:seed']);
  console.log('[start-local] starting API on :4000…');
  await run('npm', ['run', 'dev:server']);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
