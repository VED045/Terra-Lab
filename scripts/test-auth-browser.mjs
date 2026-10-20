// Isolated public protocol fixture; never reads or requires hosted credentials.
import { spawn } from 'node:child_process';
const child = spawn(process.execPath, ['node_modules/@playwright/test/cli.js', 'test'], {
  env: { ...process.env, TERRALAB_E2E_AUTH_FIXTURE: '1' },
  stdio: 'inherit',
  windowsHide: true,
});
child.on('error', () => {
  console.error('Could not start authenticated browser fixture');
  process.exitCode = 1;
});
child.on('exit', (code) => {
  process.exitCode = code ?? 1;
});
