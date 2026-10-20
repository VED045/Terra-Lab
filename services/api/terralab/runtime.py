"""Supervise the public API and optional queue worker in one Render Web Service."""
import argparse
import os
import signal
import subprocess
import sys
import threading
import time

SERVICE_KEYS = ('SUPABASE_SECRET_KEY', 'SUPABASE_SERVICE_ROLE_KEY')

def commands(environ):
    """Prepare isolated child environments without logging credentials."""
    api_env = dict(environ)
    for key in SERVICE_KEYS:
        api_env.pop(key, None)
    port = int(environ.get('PORT', '8000'))
    if not 1 <= port <= 65535:
        raise ValueError('PORT must be between 1 and 65535')
    api = [sys.executable, '-m', 'uvicorn', 'terralab.main:app', '--host', '0.0.0.0',
           '--port', str(port), '--workers', '1', '--limit-concurrency', '32',
           '--timeout-keep-alive', '5']
    children = [(api, api_env)]
    if environ.get('TERRALAB_RUN_WORKER', '0').lower() in ('1', 'true'):
        if environ.get('TERRALAB_JOB_MODE') != 'supabase' or not any(environ.get(k) for k in SERVICE_KEYS) or not environ.get('SUPABASE_URL'):
            raise ValueError('Combined runtime requires supabase mode, URL and a server-only service credential')
        children.append(([sys.executable, '-m', 'terralab.worker'], dict(environ)))
    return children

def shutdown(children, grace=20):
    # Signal both first, then give the worker bounded time to publish partial output.
    for child in children:
        if child.poll() is None:
            try: child.terminate()
            except ProcessLookupError: pass
    deadline = time.monotonic() + grace
    for child in children:
        try: child.wait(timeout=max(0, deadline-time.monotonic()))
        except subprocess.TimeoutExpired:
            child.kill()
            child.wait()

def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--stop-on-stdin', action='store_true', help='Stop children on stdin EOF (for local process hosts)')
    args = parser.parse_args(argv)
    try: specs = commands(os.environ)
    except (ValueError, TypeError) as exc:
        print(str(exc), file=sys.stderr, flush=True)
        return 1
    stopping = threading.Event()
    for sig in (signal.SIGINT, signal.SIGTERM):
        signal.signal(sig, lambda *_: stopping.set())
    if args.stop_on_stdin:
        def watch_stdin():
            sys.stdin.buffer.read()
            stopping.set()
        threading.Thread(target=watch_stdin, daemon=True).start()
    children = []
    try:
        for command, env in specs:
            children.append(subprocess.Popen(command, env=env, stdin=subprocess.DEVNULL, creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0))
        print('TerraLab runtime started: API' + (' + queue worker' if len(children)>1 else ''), flush=True)
        while not stopping.wait(.25):
            for index, child in enumerate(children):
                code = child.poll()
                if code is not None:
                    print(('API' if index == 0 else 'Worker') + ' exited; stopping service', file=sys.stderr, flush=True)
                    return code if code else 1
        return 0
    finally:
        shutdown(children)

if __name__ == '__main__':
    sys.exit(main())

