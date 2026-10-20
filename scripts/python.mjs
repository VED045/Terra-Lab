import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';

// Prefer the project's isolated environment without requiring shell activation.
const executable = resolve(
  process.platform === 'win32' ? '.venv/Scripts/python.exe' : '.venv/bin/python',
);
if (!existsSync(executable)) {
  console.error(
    'Python environment missing. Create .venv and install services/api/requirements-dev.txt (see README).',
  );
  process.exit(1);
}
const child = spawn(executable, process.argv.slice(2), { stdio: 'inherit' });
child.on('error', (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
child.on('exit', (code) => {
  process.exitCode = code ?? 1;
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
