"""Private loopback notification between API and worker; no Supabase credentials in API."""
import hmac
import os
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.request import Request, urlopen
from fastapi import HTTPException

def configuration():
    port=int(os.environ.get('TERRALAB_WORKER_WAKE_PORT','0'))
    token=os.environ.get('TERRALAB_WORKER_WAKE_TOKEN','')
    if not 1 <= port <= 65535 or len(token) < 32:
        raise ValueError('Worker wake configuration is missing; use the combined runtime')
    return port,token

def notify():
    try:
        port,token=configuration()
        # Retry only startup connection failures within this submission, never a recurring timer.
        for attempt in range(3):
            try:
                request=Request(f'http://127.0.0.1:{port}/wake',data=b'',method='POST',headers={'Authorization':'Bearer '+token})
                with urlopen(request,timeout=2) as response:
                    if response.status != 202: raise ValueError('Wake rejected')
                return
            except OSError:
                if attempt == 2: raise
                time.sleep(.2*(attempt+1))
    except (OSError,ValueError) as exc:
        # Enqueue already committed. The caller retains its idempotency key and can retry safely.
        raise HTTPException(503,'Experiment queued, but the worker could not be notified. Retry the submission to wake it without duplicating the job.') from exc

def listen(event):
    port,token=configuration()
    class Handler(BaseHTTPRequestHandler):
        def do_POST(self):
            authorized=hmac.compare_digest(self.headers.get('Authorization',''),'Bearer '+token)
            if self.path != '/wake' or not authorized:
                self.send_response(403); self.end_headers(); return
            event.set()
            self.send_response(202); self.end_headers()
        def log_message(self,*_): pass
    server=ThreadingHTTPServer(('127.0.0.1',port),Handler)
    thread=threading.Thread(target=server.serve_forever,daemon=True)
    thread.start()
    return server
