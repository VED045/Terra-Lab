"""Operator-enabled local runner. No model-supplied shell, argv, cwd or environment.

This is a trusted-development fallback, NOT a sandbox for hostile repositories.
Models can only request reviewed catalogue IDs through the authenticated Next adapter.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import signal
import subprocess
import sys
import threading
import time
import uuid
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / '.terralab' / 'ai-tests'
CATALOG = {
    'typecheck': ('node', ['node_modules/typescript/bin/tsc', '--noEmit', '-p', 'apps/web/tsconfig.json'], 180, 'none'),
    'frontend-unit': ('node', ['node_modules/vitest/vitest.mjs', 'run', '--maxWorkers=2'], 180, 'none'),
    'ai-unit': ('node', ['node_modules/vitest/vitest.mjs', 'run', 'apps/web/lib/ai', '--maxWorkers=2'], 180, 'none'),
    'scientific-unit': ('python', ['-m', 'pytest', 'services/api/tests', '-q', '--tb=short', '-p', 'no:cacheprovider'], 180, 'loopback'),
    'browser-regression': ('node', ['node_modules/@playwright/test/cli.js', 'test', '--workers=1'], 420, 'loopback'),
    'ai-workflows': ('node', ['node_modules/@playwright/test/cli.js', 'test', '--config', 'playwright.ai.config.ts', '--workers=1'], 240, 'loopback'),
    'production-build': ('node', ['node_modules/next/dist/bin/next', 'build', 'apps/web', '--webpack'], 300, 'none'),
    'database': ('node', ['scripts/test-database.mjs'], 120, 'none'),
    'collaboration': ('node', ['scripts/test-collaboration.mjs'], 120, 'none'),
    'worker-integration': ('node', ['scripts/test-cloud-worker.mjs'], 240, 'loopback'),
    'combined-worker': ('node', ['scripts/test-cloud-worker.mjs', '--combined'], 240, 'loopback'),
}

def now(): return datetime.now(timezone.utc).isoformat()
def emit(value): print(json.dumps(value, allow_nan=False), flush=True)
def job_path(identity): return DATA / str(uuid.UUID(identity))
def save(directory, value):
    directory.mkdir(parents=True, exist_ok=True)
    temp = directory / ('state-' + str(uuid.uuid4()) + '.tmp')
    temp.write_text(json.dumps(value, allow_nan=False), encoding='utf-8')
    os.replace(temp, directory / 'state.json')
def read(directory): return json.loads((directory / 'state.json').read_text(encoding='utf-8'))
def alive(pid):
    if not pid: return False
    if os.name=='nt':
        import ctypes
        from ctypes import wintypes as w
        kernel=ctypes.WinDLL('kernel32',use_last_error=True)
        kernel.OpenProcess.argtypes=[w.DWORD,w.BOOL,w.DWORD];kernel.OpenProcess.restype=w.HANDLE
        kernel.GetExitCodeProcess.argtypes=[w.HANDLE,ctypes.POINTER(w.DWORD)]
        kernel.CloseHandle.argtypes=[w.HANDLE]
        handle=kernel.OpenProcess(0x1000,False,pid)
        if not handle: return False
        code=w.DWORD()
        try: return bool(kernel.GetExitCodeProcess(handle,ctypes.byref(code))) and code.value==259
        finally: kernel.CloseHandle(handle)
    try: os.kill(pid, 0); return True
    except (OSError, ValueError): return False

def source_manifest():
    files = subprocess.check_output(['git', '-C', str(ROOT), 'ls-files', '-co', '--exclude-standard', '-z'])
    names = sorted(set(files.decode('utf-8').split('\0')) - {''})
    result = []; total = 0
    for name in names:
        parts = Path(name).parts
        if any(p in ('.git', '.terralab', 'node_modules', '.venv', '.next') or p.startswith('.env') and p != '.env.example' for p in parts): continue
        source = ROOT / name
        if source.is_symlink() or ROOT not in source.resolve().parents: raise ValueError('Symlink/outside source is not approved')
        if not source.is_file(): continue
        size = source.stat().st_size
        total += size
        if size > 20_000_000 or total > 150_000_000 or len(result) >= 5000: raise ValueError('Source snapshot exceeds limits')
        result.append((name, hashlib.sha256(source.read_bytes()).hexdigest()))
    digest = hashlib.sha256(json.dumps(result, separators=(',', ':')).encode()).hexdigest()
    try: commit = subprocess.check_output(['git', '-C', str(ROOT), 'rev-parse', 'HEAD'], text=True).strip()
    except subprocess.CalledProcessError: commit = None
    changed = subprocess.check_output(['git', '-C', str(ROOT), 'status', '--porcelain', '-z'], text=True)
    # Paths are data, not commands. Never include a diff body, .env contents or arbitrary logs.
    changes = [v[3:] for v in changed.split('\0') if len(v) > 3 and not any(p.startswith('.env') for p in Path(v[3:]).parts)]
    return {'hash': digest, 'commit': commit, 'files': result, 'changedFiles': changes[:100], 'truncated': len(changes) > 100}

def inspect():
    manifest = source_manifest()
    return {k: v for k, v in manifest.items() if k != 'files'} | {
        'commands': [{'id': key, 'command': ('node' if runtime == 'node' else 'project-python') + ' ' + ' '.join(args), 'timeoutSeconds': seconds, 'network': network} for key, (runtime, args, seconds, network) in CATALOG.items()],
        'isolation': 'approved-local-development; disposable source copy; shared installed dependencies; NOT an adversarial sandbox',
        'limits': {'concurrency': 1, 'outputBytes': 64000, 'nodeHeapMiB': 2048, 'windowsJobMemoryMiB': 6144, 'windowsCPUPercent': 30, 'retainedJobs': 30},
        'notAvailable': ['lint: no lint script/configured runner exists', 'hosted execution: disabled'],
    }

def clean_environment(directory, network):
    env = {key: os.environ[key] for key in ('SYSTEMROOT', 'WINDIR', 'COMSPEC', 'PATHEXT', 'PATH', 'TEMP', 'TMP', 'USERPROFILE', 'LOCALAPPDATA', 'APPDATA', 'PROGRAMFILES') if key in os.environ}
    home = directory / 'home'; home.mkdir(exist_ok=True)
    env.update(HOME=str(home), CI='1', NEXT_TELEMETRY_DISABLED='1', PYTHONUNBUFFERED='1', PYTHONDONTWRITEBYTECODE='1', PYTEST_DISABLE_PLUGIN_AUTOLOAD='1', NODE_ENV='test', OMP_NUM_THREADS='2', OPENBLAS_NUM_THREADS='2', MKL_NUM_THREADS='2', TERRALAB_JOB_MODE='local', TERRALAB_ENV='development', TERRALAB_DATA_DIR=str(directory / 'scientific-data'), TERRALAB_AI_LOCAL_DEV='0', TERRALAB_AI_OLLAMA_ENABLED='0', TERRALAB_AI_TESTING_ENABLED='0', TERRALAB_TEST_NETWORK=network)
    # No inherited Supabase/provider/Vercel/Render credentials or arbitrary NODE_OPTIONS.
    guard = directory / 'workspace' / 'scripts' / 'ai-network-guard.cjs'
    env['NODE_OPTIONS'] = '--max-old-space-size=2048 --require="' + guard.as_posix() + '"'
    env['PYTHONPATH'] = str(directory / 'workspace' / 'scripts' / 'ai-python-guard')
    return env

def windows_limits(process):
    if os.name != 'nt': return None
    import ctypes
    from ctypes import wintypes as w
    class Basic(ctypes.Structure):
        _fields_ = [('processTime', ctypes.c_longlong), ('jobTime', ctypes.c_longlong), ('flags', w.DWORD), ('minWS', ctypes.c_size_t), ('maxWS', ctypes.c_size_t), ('processes', w.DWORD), ('affinity', ctypes.c_size_t), ('priority', w.DWORD), ('scheduling', w.DWORD)]
    class IO(ctypes.Structure): _fields_ = [(name, ctypes.c_ulonglong) for name in ['readOps','writeOps','otherOps','readBytes','writeBytes','otherBytes']]
    class Extended(ctypes.Structure): _fields_ = [('basic', Basic), ('io', IO), ('processMemory', ctypes.c_size_t), ('jobMemory', ctypes.c_size_t), ('peakProcessMemory', ctypes.c_size_t), ('peakJobMemory', ctypes.c_size_t)]
    class CPU(ctypes.Structure): _fields_ = [('flags', w.DWORD), ('rate', w.DWORD)]
    kernel = ctypes.WinDLL('kernel32', use_last_error=True)
    kernel.CreateJobObjectW.restype = w.HANDLE
    kernel.SetInformationJobObject.argtypes = [w.HANDLE, ctypes.c_int, ctypes.c_void_p, w.DWORD]
    kernel.AssignProcessToJobObject.argtypes = [w.HANDLE, w.HANDLE]
    kernel.CloseHandle.argtypes = [w.HANDLE]
    handle = kernel.CreateJobObjectW(None, None)
    limits = Extended(); limits.basic.flags = 0x2000 | 0x100 | 0x200 | 0x8
    limits.basic.processes = 48; limits.processMemory = 3 * 1024**3; limits.jobMemory = 6 * 1024**3
    cpu = CPU(1 | 4, 3000)
    if not handle or not kernel.SetInformationJobObject(handle, 9, ctypes.byref(limits), ctypes.sizeof(limits)) or not kernel.SetInformationJobObject(handle, 15, ctypes.byref(cpu), ctypes.sizeof(cpu)) or not kernel.AssignProcessToJobObject(handle, w.HANDLE(int(process._handle))):
        if handle: kernel.CloseHandle(handle)
        process.kill()
        raise RuntimeError('Windows resource limits unavailable; approved run was not allowed to continue')
    return lambda: kernel.CloseHandle(handle)

def parse_counts(output):
    # Null means not supplied by this runner; never convert absence to zero/passed.
    counts = {'passed': None, 'failed': None, 'skipped': None, 'notRun': None}
    lines = output.splitlines()
    summary = next((line for line in reversed(lines) if re.search(r'^\s*Tests\s+\d', line)), None)
    if summary is None: summary = next((line for line in reversed(lines) if re.search(r'\d+ (?:passed|failed|skipped)', line) and not line.startswith('PASS ')), '')
    for key in ('passed', 'failed', 'skipped'):
        match = re.search(r'(\d+)\s+' + key, summary)
        if match: counts[key] = int(match.group(1))
    return counts

def worker(identity):
    directory = job_path(identity); state = read(directory)
    if state.get('startGate'):
        deadline=time.monotonic()+10
        while not (directory/'start.ready').exists() and time.monotonic()<deadline: time.sleep(.02)
        if not (directory/'start.ready').exists():
            state.update(state='interrupted',endedAt=now(),exitCode=None,message='Runner startup handshake did not complete');save(directory,state);return
        state=read(directory)
    process = None; close_job = None
    started = time.monotonic()
    try:
        if (directory / 'cancel').exists():
            state.update(state='cancelled', endedAt=now(), message='Cancelled before command start'); return
        runtime, args, timeout, network = CATALOG[state['commandId']]
        workspace = directory / 'workspace'
        executable = shutil.which('node') if runtime == 'node' else str(ROOT / ('.venv/Scripts/python.exe' if os.name == 'nt' else '.venv/bin/python'))
        if not executable or not Path(executable).is_file(): raise RuntimeError('Approved runtime is missing')
        state.update(state='running', pid=os.getpid(), startedAt=now()); save(directory, state)
        process = subprocess.Popen([executable, *args], cwd=workspace, env=clean_environment(directory, network), stdout=subprocess.PIPE, stderr=subprocess.STDOUT, shell=False, creationflags=subprocess.CREATE_NEW_PROCESS_GROUP if os.name == 'nt' else 0, start_new_session=os.name != 'nt')
        close_job = windows_limits(process)
        chunks = []; stored = 0; overflow = threading.Event()
        def drain():
            nonlocal stored
            while True:
                chunk = process.stdout.read(1024)
                if not chunk: break
                if stored + len(chunk) > 64000: overflow.set(); continue
                chunks.append(chunk); stored += len(chunk)
        reader = threading.Thread(target=drain, daemon=True); reader.start()
        reason = None
        while process.poll() is None:
            if (directory / 'cancel').exists(): reason = 'cancelled'
            elif time.monotonic() - started > timeout: reason = 'timed_out'
            elif overflow.is_set(): reason = 'output_limit'
            if reason:
                if close_job: close_job(); close_job = None
                elif os.name != 'nt': os.killpg(process.pid, signal.SIGKILL)
                else: process.kill()
                break
            time.sleep(.1)
        code = process.wait(timeout=10); reader.join(timeout=5)
        if overflow.is_set() and reason is None: reason = 'output_limit'
        output = b''.join(chunks).decode('utf-8', errors='replace')
        output = re.sub(r'\x1b\[[0-?]*[ -/]*[@-~]', '', output)
        output = output.replace(str(ROOT), '[source]').replace(str(directory), '[run]')
        output = re.sub(r'(?i)(?:sk-[A-Za-z0-9_-]{12,}|sb_secret_[A-Za-z0-9_-]+|Bearer\s+[A-Za-z0-9._-]+)', '[REDACTED]', output)
        state.update(state=reason or ('completed' if code == 0 else 'failed'), endedAt=now(), exitCode=code, output=output, counts=parse_counts(output), message='Actual approved command result; success requires exit code 0')
    except Exception as error:
        state.update(state='failed', endedAt=now(), exitCode=None, message=str(error)[:300])
    finally:
        if close_job: close_job()
        save(directory, state)
        lock = DATA / 'active.lock'
        if lock.exists() and lock.read_text() == identity: lock.unlink()

def status(identity, project):
    directory = job_path(identity); state = read(directory)
    if state['projectId'] != str(uuid.UUID(project)): raise ValueError('Test result is outside selected project')
    if state['state'] in ('queued','running') and not alive(state.get('pid')) and (state['state'] != 'queued' or time.time() - (directory / 'state.json').stat().st_mtime > 30):
        state.update(state='interrupted', endedAt=now(), exitCode=None, message='Runner stopped. Inspect output and explicitly approve a new run; no success assumed.'); save(directory, state)
    return state

def start(command, identity, expected, project):
    if command not in CATALOG: raise ValueError('Command ID not approved')
    identity = str(uuid.UUID(identity)); project = str(uuid.UUID(project))
    directory = job_path(identity)
    if directory.exists():
        current = status(identity, project)
        if current['commandId'] != command or current['revision']['hash'] != expected: raise ValueError('Idempotency conflict')
        return current
    manifest = source_manifest()
    if manifest['hash'] != expected: raise ValueError('Source changed after review; request a new preview')
    DATA.mkdir(parents=True, exist_ok=True)
    lock = DATA / 'active.lock'
    if lock.exists():
        old = lock.read_text()
        try: previous = read(job_path(old))
        except (FileNotFoundError, ValueError): previous = {}
        if alive(previous.get('pid')) or previous.get('state') == 'queued' and time.time() - lock.stat().st_mtime < 30: raise ValueError('One approved local test job is already active')
        lock.unlink(missing_ok=True)
    with lock.open('x') as handle: handle.write(identity)
    try:
        jobs = sorted((p for p in DATA.iterdir() if p.is_dir()), key=lambda p: p.stat().st_mtime)
        for old in jobs[:-29]:
            # Only runner-owned UUID children inside DATA. Never delete a computed outside path.
            if old.name == str(uuid.UUID(old.name)) and old.resolve().parent == DATA.resolve(): shutil.rmtree(old)
        workspace = directory / 'workspace'; workspace.mkdir(parents=True)
        for name, digest in manifest['files']:
            target = workspace / name; target.parent.mkdir(parents=True, exist_ok=True)
            content = (ROOT / name).read_bytes()
            if hashlib.sha256(content).hexdigest() != digest: raise ValueError('Source changed while taking approved snapshot')
            target.write_bytes(content)
        (workspace/'apps'/'web'/'next-env.d.ts').write_text('/// <reference types="next" />\n/// <reference types="next/image-types/global" />\n',encoding='utf-8')
        # Existing dependencies are shared, not downloaded/copied. This is not filesystem isolation.
        def link(source,target):
            if os.name == 'nt':
                import _winapi
                _winapi.CreateJunction(str(source),str(target))
            else: target.symlink_to(source,target_is_directory=True)
        link(ROOT/'.venv',workspace/'.venv')
        modules=workspace/'node_modules';modules.mkdir()
        for dependency in (ROOT/'node_modules').iterdir():
            if dependency.name=='@terralab': continue
            if dependency.is_dir(): link(dependency,modules/dependency.name)
            elif dependency.is_file(): shutil.copyfile(dependency,modules/dependency.name)
        local_packages=modules/'@terralab';local_packages.mkdir()
        link(workspace/'packages'/'shared',local_packages/'shared')
        link(workspace/'apps'/'web',local_packages/'web')
        state = {'id': identity, 'projectId': project, 'commandId': command, 'command': inspect_command(command), 'state': 'queued', 'createdAt': now(), 'startedAt': None, 'endedAt': None, 'exitCode': None, 'counts': {'passed': None, 'failed': None, 'skipped': None, 'notRun': None}, 'output': '', 'real': True, 'isolation': 'approved-local-development', 'revision': {k: manifest[k] for k in ('hash','commit')}, 'pid': None, 'startGate':True}
        save(directory, state)
        log = (directory / 'worker.log').open('ab')
        options=dict(cwd=ROOT,env=clean_environment(directory,CATALOG[command][3]),stdin=subprocess.DEVNULL,stdout=log,stderr=log,creationflags=(subprocess.DETACHED_PROCESS|subprocess.CREATE_NEW_PROCESS_GROUP) if os.name=='nt' else 0,start_new_session=os.name!='nt')
        child = subprocess.Popen([sys.executable, str(Path(__file__).resolve()), 'worker', identity],**options)
        log.close(); state['pid'] = child.pid; save(directory, state);(directory/'start.ready').touch()
        return state
    except Exception:
        lock.unlink(missing_ok=True)
        if directory.exists():
            save(directory, {'id': identity, 'projectId': project, 'commandId': command, 'revision': {'hash': expected}, 'state': 'failed', 'exitCode': None, 'real': True, 'message': 'Runner infrastructure failed before approved command execution', 'endedAt': now()})
        raise

def inspect_command(command):
    runtime, args, _, _ = CATALOG[command]
    return ('node' if runtime == 'node' else 'project-python') + ' ' + ' '.join(args)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('mode', choices=['inspect','start','status','cancel','worker'])
    parser.add_argument('values', nargs='*'); args = parser.parse_args()
    try:
        if args.mode == 'inspect': emit(inspect())
        elif args.mode == 'start': emit(start(*args.values))
        elif args.mode == 'status': emit(status(*args.values))
        elif args.mode == 'cancel':
            identity, project = args.values
            value = status(identity, project)
            if value['state'] in ('queued','running'): (job_path(identity) / 'cancel').touch()
            emit(value | {'cancellationRequested': value['state'] in ('queued','running')})
        elif args.mode == 'worker': worker(*args.values)
    except Exception as error:
        emit({'error': str(error)[:300]}); sys.exit(1)

if __name__ == '__main__': main()
