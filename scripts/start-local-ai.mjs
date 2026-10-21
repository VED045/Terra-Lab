// Human/operator launcher; deliberately absent from the model's test command catalogue.
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, existsSync, readFileSync, writeFileSync, openSync, closeSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
if (process.platform !== 'win32')
  throw Error(
    'This installed laptop profile is Windows-specific. See PROVIDER_SETUP for other systems.',
  );
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const data = join(root, '.terralab', 'local-ai');
mkdirSync(data, { recursive: true });
const modelRoot = join(homedir(), 'Documents', 'Codex', 'local-ai', 'ollama');
const statePath = join(data, 'processes.json');
let state = existsSync(statePath) ? JSON.parse(readFileSync(statePath, 'utf8')) : {};
function info(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return null;
  try {
    return JSON.parse(
      execFileSync(
        'powershell.exe',
        [
          '-NoProfile',
          '-Command',
          `Get-CimInstance Win32_Process -Filter 'ProcessId=${pid}' | Select-Object ProcessId,ExecutablePath,CommandLine,CreationDate | ConvertTo-Json -Compress`,
        ],
        { windowsHide: true, encoding: 'utf8', timeout: 15000 },
      ),
    );
  } catch {
    return null;
  }
}
function owned(record) {
  const actual = record && info(record.pid);
  return (
    actual && actual.CommandLine === record.commandLine && actual.CreationDate === record.createdAt
  );
}
if (process.argv[2] === '--stop') {
  for (const name of ['web', 'api', 'ollama'])
    if (owned(state[name]))
      execFileSync('taskkill.exe', ['/PID', String(state[name].pid), '/T', '/F'], {
        windowsHide: true,
        stdio: 'ignore',
      });
  writeFileSync(statePath, '{}');
  console.log(
    'Stopped only the verified processes from this local profile. The signed-in Ollama desktop app is separate.',
  );
  process.exit(0);
}
if (process.argv[2] && process.argv[2] !== '--status')
  throw Error('Supported operator options: no argument, --status, --stop');
const common = {};
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
  if (process.env[key]) common[key] = process.env[key];
Object.assign(common, {
  NEXT_TELEMETRY_DISABLED: '1',
  TERRALAB_ENV: 'development',
  TERRALAB_JOB_MODE: 'local',
  TERRALAB_DATA_DIR: join(data, 'experiments'),
  TERRALAB_AI_LOCAL_DEV: '1',
  TERRALAB_AI_OLLAMA_ENABLED: '1',
  TERRALAB_AI_TESTING_ENABLED: '1',
  TERRALAB_AI_FREE_LOCAL_ONLY: '1',
  TERRALAB_AI_OLLAMA_MODEL: 'qwen3:4b-instruct-2507-q4_K_M',
  TERRALAB_AI_OLLAMA_ANALYSIS_MODEL: 'deepseek-r1:8b',
  TERRALAB_AI_OLLAMA_AGENT_MODEL: 'qwen3:4b-instruct-2507-q4_K_M',
  TERRALAB_AI_OLLAMA_URL: 'http://127.0.0.1:11435',
  SIMULATION_API_URL: 'http://127.0.0.1:18040',
  TERRALAB_AI_DEV_DEEPSEEK_KEY: '',
  TERRALAB_AI_COOKIE_KEY: '',
  NEXT_PUBLIC_SUPABASE_URL: '',
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: '',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: '',
  SUPABASE_URL: '',
  SUPABASE_SECRET_KEY: '',
  SUPABASE_SERVICE_ROLE_KEY: '',
});
const services = {
  ollama: {
    exe: join(process.env.LOCALAPPDATA, 'Programs', 'Ollama', 'ollama.exe'),
    args: ['serve'],
    health: 'http://127.0.0.1:11435/api/version',
    env: {
      ...common,
      OLLAMA_HOST: '127.0.0.1:11435',
      OLLAMA_MODELS: join(modelRoot, 'models'),
      OLLAMA_NO_CLOUD: '1',
      OLLAMA_NUM_PARALLEL: '1',
      OLLAMA_MAX_LOADED_MODELS: '1',
      OLLAMA_MAX_QUEUE: '4',
      OLLAMA_KEEP_ALIVE: '2m',
      CUDA_VISIBLE_DEVICES: '-1',
      GGML_VK_VISIBLE_DEVICES: '1',
      OLLAMA_VULKAN: '1',
      OLLAMA_GO_TEMPLATE: '0',
      OLLAMA_DEBUG_LOG_REQUESTS: '0',
    },
  },
  api: {
    exe: join(root, '.venv', 'Scripts', 'python.exe'),
    args: [
      '-m',
      'uvicorn',
      'terralab.main:app',
      '--app-dir',
      'services/api',
      '--host',
      '127.0.0.1',
      '--port',
      '18040',
    ],
    health: 'http://127.0.0.1:18040/health',
    env: common,
  },
  web: {
    exe: process.execPath,
    args: [
      join(root, 'node_modules', 'next', 'dist', 'bin', 'next'),
      'dev',
      'apps/web',
      '--webpack',
      '-H',
      '127.0.0.1',
      '--port',
      '13040',
    ],
    health: 'http://127.0.0.1:13040/ai',
    env: { ...common, NODE_ENV: 'development' },
  },
};
async function reachable(url) {
  try {
    return (await fetch(url, { signal: AbortSignal.timeout(2000) })).ok;
  } catch {
    return false;
  }
}
for (const [name, service] of Object.entries(services)) {
  if (process.argv[2] === '--status') {
    console.log(
      JSON.stringify({
        service: name,
        owned: Boolean(owned(state[name])),
        reachable: await reachable(service.health),
      }),
    );
    continue;
  }
  if (await reachable(service.health)) {
    if (!owned(state[name])) {
      // Adopt only the exact earlier TerraLab serve process registered during setup.
      const oldPidPath = join(modelRoot, 'terralab-serve.pid');
      const oldPid =
        name === 'ollama' && existsSync(oldPidPath)
          ? Number(readFileSync(oldPidPath, 'utf8').trim())
          : 0;
      const previous = info(oldPid);
      if (
        name !== 'ollama' ||
        !previous ||
        previous.ExecutablePath?.toLowerCase() !== service.exe.toLowerCase() ||
        !previous.CommandLine?.includes('serve')
      )
        throw Error(`${name} port is in use by an unowned process. It was left unchanged.`);
      state[name] = {
        pid: oldPid,
        commandLine: previous.CommandLine,
        createdAt: previous.CreationDate,
      };
    }
    console.log(`${name}: existing verified local profile`);
    continue;
  }
  if (!existsSync(service.exe))
    throw Error(
      `Missing installed ${name} runtime. No package/model download is performed by this launcher.`,
    );
  const out = openSync(join(data, name + '.out.log'), 'a'),
    err = openSync(join(data, name + '.err.log'), 'a');
  const child = spawn(service.exe, service.args, {
    cwd: root,
    env: service.env,
    detached: true,
    windowsHide: true,
    stdio: ['ignore', out, err],
  });
  await new Promise((res, rej) => {
    child.once('spawn', res);
    child.once('error', rej);
  });
  child.unref();
  closeSync(out);
  closeSync(err);
  await new Promise((r) => setTimeout(r, 250));
  const actual = info(child.pid);
  if (!actual)
    throw Error(`${name} exited before startup. Inspect its local log; no success is assumed.`);
  state[name] = { pid: child.pid, commandLine: actual.CommandLine, createdAt: actual.CreationDate };
  writeFileSync(statePath, JSON.stringify(state, null, 2));
  let ready = false;
  for (let i = 0; i < 60; i++) {
    if (await reachable(service.health)) {
      ready = true;
      break;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  if (!ready)
    throw Error(`${name} did not become healthy. Inspect .terralab/local-ai/${name}.err.log.`);
  console.log(`${name}: healthy on loopback`);
}
writeFileSync(statePath, JSON.stringify(state, null, 2));
console.log('TerraLab free local profile: http://127.0.0.1:13040/ai');
console.log(
  'No hosted provider key is used. Existing model weights are required; no downloads occur at app startup.',
);
