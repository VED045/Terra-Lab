import { execFile } from 'node:child_process';
import { existsSync, realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { z } from 'zod';
import type { AIIdentity } from './access';
import { AIError } from './contracts';

export const commandIds = [
  'typecheck',
  'frontend-unit',
  'ai-unit',
  'scientific-unit',
  'browser-regression',
  'ai-workflows',
  'production-build',
  'database',
  'collaboration',
  'worker-integration',
  'combined-worker',
] as const;
export const commandIdSchema = z.enum(commandIds);
export function testingAvailable(identity: AIIdentity) {
  return (
    identity.local &&
    process.env.NODE_ENV === 'development' &&
    process.env.TERRALAB_AI_TESTING_ENABLED === '1'
  );
}
function repository() {
  let value = realpathSync(process.cwd());
  for (let i = 0; i < 5; i++) {
    if (existsSync(join(value, 'scripts', 'ai-test-runner.py')) && existsSync(join(value, '.git')))
      return value;
    value = dirname(value);
  }
  throw new AIError('runner_unavailable', 'The fixed local repository runner is unavailable.', 503);
}
async function invoke(identity: AIIdentity, args: string[]) {
  if (!testingAvailable(identity))
    throw new AIError(
      'testing_disabled',
      'Test execution requires an explicitly enabled local development checkout. Hosted execution is disabled.',
      403,
    );
  const root = repository();
  const python = join(
    root,
    process.platform === 'win32' ? '.venv/Scripts/python.exe' : '.venv/bin/python',
  );
  const env: NodeJS.ProcessEnv = { NODE_ENV: 'development' };
  for (const key of [
    'SYSTEMROOT',
    'WINDIR',
    'COMSPEC',
    'PATH',
    'PATHEXT',
    'TEMP',
    'TMP',
    'USERPROFILE',
    'LOCALAPPDATA',
    'APPDATA',
    'PROGRAMFILES',
  ])
    if (process.env[key]) env[key] = process.env[key];
  env.PYTHONUNBUFFERED = '1';
  return new Promise<unknown>((resolve, reject) => {
    execFile(
      python,
      [join(root, 'scripts', 'ai-test-runner.py'), ...args],
      { cwd: root, env, shell: false, windowsHide: true, timeout: 30000, maxBuffer: 180000 },
      (error, stdout) => {
        let result;
        try {
          result = JSON.parse(stdout);
        } catch {
          reject(
            new AIError(
              'runner_infrastructure',
              'The approved runner did not return a valid result. No pass is assumed.',
              503,
            ),
          );
          return;
        }
        if (error || result.error) {
          reject(
            new AIError(
              'runner_rejected',
              typeof result.error === 'string'
                ? result.error.slice(0, 300)
                : 'Runner infrastructure failed. Inspect the task and request a fresh preview.',
              409,
            ),
          );
          return;
        }
        resolve(result);
      },
    );
  });
}
export async function inspectTesting(identity: AIIdentity) {
  return z
    .object({
      hash: z.string().length(64),
      commit: z.string().nullable(),
      changedFiles: z.array(z.string()).max(100),
      commands: z.array(
        z.object({
          id: commandIdSchema,
          command: z.string(),
          timeoutSeconds: z.number(),
          network: z.string(),
        }),
      ),
      isolation: z.string(),
      limits: z.record(z.string(), z.number()),
      notAvailable: z.array(z.string()),
      truncated: z.boolean(),
    })
    .parse(await invoke(identity, ['inspect']));
}
export async function submitTest(
  identity: AIIdentity,
  projectId: string,
  commandId: unknown,
  revision: unknown,
  id: string,
) {
  const command = commandIdSchema.parse(commandId);
  const hash = z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .parse(revision);
  return invoke(identity, [
    'start',
    command,
    z.string().uuid().parse(id),
    hash,
    z.string().uuid().parse(projectId),
  ]);
}
export async function inspectTest(
  identity: AIIdentity,
  projectId: string,
  testId: string,
  cancel = false,
) {
  return invoke(identity, [
    cancel ? 'cancel' : 'status',
    z.string().uuid().parse(testId),
    z.string().uuid().parse(projectId),
  ]);
}
