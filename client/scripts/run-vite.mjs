import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
const result = spawnSync('vite', args, {
  stdio: 'inherit',
  shell: true,
});

process.exit(result.status ?? 0);
