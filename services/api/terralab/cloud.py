"""PostgREST transport. Web requests use only the caller JWT; service keys stay in the worker."""
import json
import os
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError
from fastapi import HTTPException

def mode(): return os.environ.get('TERRALAB_JOB_MODE', 'local')

def service_key():
    return os.environ.get('SUPABASE_SECRET_KEY') or os.environ.get('SUPABASE_SERVICE_ROLE_KEY', '')

def call(path, token, method='GET', data=None, service=False):
    url = os.environ.get('SUPABASE_URL', '').rstrip('/')
    key = service_key() if service else os.environ.get('SUPABASE_PUBLISHABLE_KEY', '')
    if not url or not key: raise HTTPException(503, 'Cloud job configuration is incomplete')
    if not service and (not token or not token.startswith('Bearer ') or len(token)>8192):
        raise HTTPException(401, 'Sign in to use cloud experiments')
    headers={'apikey':key,'Content-Type':'application/json'}
    # Modern Supabase secret keys authenticate via apikey, never as a JWT.
    if not service: headers['Authorization']=token
    elif not key.startswith('sb_secret_'): headers['Authorization']=f'Bearer {key}'
    if isinstance(data, bytes): body=data
    else: body=json.dumps(data,allow_nan=False).encode() if data is not None else None
    try:
        with urlopen(Request(url+path,data=body,headers=headers,method=method),timeout=20) as response:
            raw=response.read(25_000_001)
            if len(raw)>25_000_000: raise HTTPException(502,'Cloud response exceeds resource limit')
            return json.loads(raw) if raw else None
    except HTTPError as exc:
        # Never forward upstream URLs, credentials, SQL details, or stack traces.
        code=exc.code if exc.code in (400,401,403,404,409,413,422,429) else 502
        raise HTTPException(code,'Cloud operation denied or unavailable') from exc
    except (URLError,TimeoutError,ValueError) as exc: raise HTTPException(503,'Cloud storage unavailable') from exc

def rpc(name, params=None, token=None, service=False):
    return call('/rest/v1/rpc/'+name,token,'POST',params or {},service)

def validate_limits(request):
    # A deliberately smaller bound for the initial production worker plan.
    from .experiments import locations
    c=request.config
    count=len(locations(request))*(int(c.duration/c.sampleStep+1e-9)+1)*c.trials*len(c.estimators)*(len(c.sweepValues) if c.sweep!='none' else 1)
    anchors=sum(o['kind']=='anchor' and o.get('enabled',True) for o in request.project['objects'])
    if count>20000 or count//len(c.estimators)*anchors>100000:
        raise HTTPException(422,'Cloud limit: 20,000 estimator epochs and 100,000 anchor observations')
    channels=anchors*(len(c.hybrid) if c.measurement=='hybrid' else 1)
    frames=count//len(c.estimators)
    budget=frames*(channels*channels*24+anchors*1500+len(c.estimators)*4000)
    if budget>15_000_000: raise HTTPException(422,'Conservative cloud output budget exceeded; reduce trials, duration, anchors or grid')

def create(request, token, key):
    validate_limits(request)
    from .worker_wake import notify
    identity=rpc('enqueue_research_job',{'p_request':request.model_dump(),'p_key':key},token)
    notify()
    return {'id':identity}

def read(identity, token, detail=False):
    rows=call('/rest/v1/research_jobs?id=eq.'+identity+'&select=id,status,request,completed,planned,error,logs,created_at,updated_at',token)
    if not rows: raise HTTPException(404,'Experiment not found')
    job=rows[0]
    job['createdAt']=job.pop('created_at'); job.pop('updated_at',None)
    job.update(records=[],frames={},summaries=[],softwareVersion='0.2.0')
    # Publication is atomic with the terminal job transition. Active polls need no run lookup.
    runs=[] if job['status'] in ('queued','running') else call('/rest/v1/experiment_runs?id=eq.'+identity+'&select=manifest,metrics,software_version,logs',token)
    if runs:
        job['summaries']=runs[0]['metrics']; job['softwareVersion']=runs[0]['software_version']
        if detail: job['manifest']=runs[0]['manifest']; job['logs']=runs[0]['logs']
    elif detail and job['status'] not in ('queued','running'):
        job['artifactUnavailable']=True
    return job

def cancel(identity, token):
    rpc('cancel_research_job',{'p_id':identity},token)
    return read(identity,token)
