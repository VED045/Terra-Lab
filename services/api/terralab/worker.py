"""Render background worker: leased PostgreSQL queue, immutable Storage artifacts.

At-least-once calculation, lease-fenced exactly-once publication. Expired attempts
restart deterministically from the immutable request; they never append duplicate epochs.
"""
import hashlib
import json
import os
import signal
import threading
import time
from . import cloud
from .lab_models import Request, VERSION
from .experiments import execute, utc, summaries

STOP=threading.Event()
def service_rpc(name, data=None): return cloud.rpc(name,data,service=True)

def upload(result, identity, lease):
    payload=json.dumps(result,allow_nan=False,separators=(',',':')).encode('utf-8')
    if len(payload)>20_000_000: raise ValueError('Result exceeds 20 MB cloud artifact limit; reduce the experiment')
    paths=[]
    for i,start in enumerate(range(0,len(payload),750000)):
        path=f'{identity}/{lease}/part-{i}.json'
        # Chunks use a JSON byte array? Store UTF-8-safe JSON strings, split by characters.
        # Base64 keeps byte boundaries independent of Unicode; 750k bytes -> <=1.01MB JSON.
        import base64
        data=json.dumps({'base64':base64.b64encode(payload[start:start+750000]).decode()}).encode()
        cloud.call('/storage/v1/object/research-results/'+path,None,'POST',data,service=True)
        paths.append(path)
    return dict(format='terralab-result-1',bucket='research-results',paths=paths,bytes=len(payload),sha256=hashlib.sha256(payload).hexdigest())

def process(job):
    identity=job['id']; lease=job['lease_token']; done=threading.Event(); cancel=threading.Event(); lost=threading.Event()
    progress={'completed':0,'planned':0}; logs=[dict(at=utc(),event='attempt_started',attempt=job['attempts'])]
    started=time.monotonic(); result=None
    if job.get('cancel_requested'): cancel.set()
    def heartbeat():
        while not done.wait(5):
            try:
                if service_rpc('heartbeat_research_job',dict(p_id=identity,p_lease=lease,p_completed=progress['completed'],p_planned=progress['planned'])): cancel.set()
            except Exception:
                lost.set(); cancel.set(); return
            if STOP.is_set() or time.monotonic()-started>120: cancel.set()
    thread=threading.Thread(target=heartbeat,daemon=True); thread.start()
    def update(value):
        progress.update(completed=value['completed'],planned=value['planned'])
        if time.monotonic()-started>120: cancel.set()
    try:
        request=Request.model_validate(job['request'])
        # Repeat limits in the worker because authenticated callers may invoke the enqueue RPC directly.
        cloud.validate_limits(request)
        result=execute(request,lambda:cancel.is_set() or STOP.is_set(),update)
        result['id']=identity
        if STOP.is_set(): result.update(status='interrupted',error='Worker shutdown; partial output retained')
        elif time.monotonic()-started>120: result.update(status='interrupted',error='120 second compute limit reached; partial output retained')
        logs.append(dict(at=utc(),event=result['status'],completed=result['completed']))
        result['logs']=logs
        if lost.is_set(): return
        manifest=upload(result,identity,lease)
        service_rpc('finish_research_job',dict(p_id=identity,p_lease=lease,p_status=result['status'],p_manifest=manifest,p_metrics=result['summaries'],p_logs=logs,p_version=VERSION,p_completed=result['completed'],p_planned=result['planned'],p_error=result.get('error')))
    except Exception as exc:
        # Preserve safe, bounded diagnostic text; HTTP errors may include secrets in URLs, so do not repr them.
        error=str(exc)[:1000] if isinstance(exc,ValueError) else 'Worker calculation or persistence failed'
        logs.append(dict(at=utc(),event='failed',message=error))
        if not lost.is_set():
            try:
                service_rpc('finish_research_job',dict(p_id=identity,p_lease=lease,p_status='failed',p_manifest=None,p_metrics=[],p_logs=logs,p_version=VERSION,p_completed=progress['completed'],p_planned=progress['planned'],p_error=error))
            except Exception: pass  # Lease expiry recovery owns this case; never falsely acknowledge publication.
    finally:
        done.set(); thread.join(timeout=2)

def main():
    if cloud.mode()!='supabase' or not os.environ.get('SUPABASE_SERVICE_ROLE_KEY'): raise SystemExit('Worker requires supabase mode and a server-only service credential')
    for sig in (signal.SIGINT,signal.SIGTERM): signal.signal(sig,lambda *_:STOP.set())
    while not STOP.is_set():
        try:
            job=service_rpc('claim_research_job')
            if job: process(job)
            else: STOP.wait(2)
        except Exception:
            print('Queue temporarily unavailable; retrying',flush=True); STOP.wait(5)
if __name__=='__main__': main()
