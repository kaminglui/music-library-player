import { spawnSync } from 'node:child_process';

const typecheck = spawnSync('npm', ['run', 'typecheck'], {
  stdio: 'inherit',
  shell: true,
});

if (typecheck.status !== 0) {
  process.exit(typecheck.status ?? 1);
}

// Use npx so we reliably pick up the local binary on all platforms
const vitest = spawnSync('npx', ['vitest', 'run'], {
  stdio: 'inherit',
  shell: true,
});

process.exit(vitest.status ?? 0);
