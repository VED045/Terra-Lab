"""Paired Monte Carlo jobs. Immutable observations shared by every estimator."""
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy
from dataclasses import asdict
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import threading
import time
import uuid
import platform
import scipy
import numpy as np
from .lab_models import Request, LabConfig, VERSION
from .physics import generate
from .estimators import estimate, Tracker, NoFix

def utc(): return datetime.now(timezone.utc).isoformat()
def environment(): return dict(python=platform.python_version(),numpy=np.__version__,scipy=scipy.__version__,platform=platform.platform(),randomGenerator='NumPy PCG64 / SeedSequence')
def quantile(values, q): return float(np.quantile(values,q)) if values else None
def metrics(records):
    errors=[r['errorM'] for r in records if r['errorM'] is not None]
    timings=[r['runtimeMs'] for r in records]
    residuals=[r['residualRms'] for r in records if r.get('residualRms') is not None]
    conditions=[r['condition'] for r in records if r.get('condition') is not None]
    normalized=[v for r in records for v in r.get('normalizedResiduals',[])]
    n=len(records); count=len(errors)
    return dict(attempted=n,fixes=count,failures=n-count,failureReasons=dict(Counter(r['failure'] for r in records if r['failure'])),availability=count/n if n else None,failureRate=(n-count)/n if n else None,meanErrorM=float(np.mean(errors)) if errors else None,medianErrorM=quantile(errors,.5),rmseM=float(np.sqrt(np.mean(np.square(errors)))) if errors else None,p95ErrorM=quantile(errors,.95),maxErrorM=max(errors) if errors else None,medianRuntimeMs=quantile(timings,.5),p95RuntimeMs=quantile(timings,.95),meanNormalizedResidualRms=float(np.mean(residuals)) if residuals else None,residualMean=float(np.mean(normalized)) if normalized else None,residualStd=float(np.std(normalized)) if normalized else None,residualAbsP95=quantile([abs(v) for v in normalized],.95),medianCondition=quantile(conditions,.5),p95Condition=quantile(conditions,.95))

def summaries(records):
    groups={}
    for record in records: groups.setdefault((record['estimator'],record['sweepValue']),[]).append(record)
    return [dict(estimator=e,sweepValue=s,**metrics(rows)) for (e,s),rows in groups.items()]

def locations(request):
    objects=request.project['objects']
    receivers=[deepcopy(o) for o in objects if o['kind']=='receiver' and o.get('enabled',True)]
    if request.config.gridSize:
        anchors=[o for o in objects if o['kind']=='anchor' and o.get('enabled',True)]
        xs=np.linspace(min(o['x'] for o in anchors),max(o['x'] for o in anchors),request.config.gridSize+2)[1:-1]
        ys=np.linspace(min(o['y'] for o in anchors),max(o['y'] for o in anchors),request.config.gridSize+2)[1:-1]
        for i,(x,y) in enumerate((x,y) for x in xs for y in ys): receivers.append(dict(receivers[0],id=f'grid-{i}',x=float(x),y=float(y),mobility='stationary',clockOffset=0,clockDrift=0))
    return receivers

def frame_json(frame):
    return dict(time=frame.time,truth=frame.truth.tolist(),values=frame.y.tolist(),covariance=frame.covariance.tolist(),observations=frame.observations,anchors=frame.anchors,reference=frame.reference,model=frame.model,nominalGaussian=frame.nominalGaussian)

def execute(request, cancelled=lambda:False, progress=lambda _:None):
    """Synchronous scientific core; job orchestration and UI rendering are outside this loop."""
    c=request.config; receivers=locations(request)
    steps=int(np.floor(c.duration/c.sampleStep+1e-9))+1
    sweeps=c.sweepValues if c.sweep!='none' else [0]
    total=len(sweeps)*c.trials*len(receivers)*steps*len(c.estimators)
    result=dict(softwareVersion=VERSION,environment=environment(),createdAt=utc(),status='running',request=request.model_dump(),planned=total,completed=0,records=[],frames={},summaries=[],error=None)
    started=time.perf_counter()
    for si,value in enumerate(sweeps):
        effective=c.model_copy(deep=True)
        if c.sweep in ['timingNs','nlosProbability']: setattr(effective,c.sweep,value)
        project=deepcopy(request.project)
        if c.sweep=='anchorCount':
            ids=[o['id'] for o in project['objects'] if o['kind']=='anchor' and o.get('enabled',True)][:int(value)]
            if effective.measurement=='tdoa' and effective.referenceId!='auto' and effective.referenceId not in ids: raise ValueError('Anchor-count sweep removed the explicit TDOA reference')
            for o in project['objects']:
                if o['kind']=='anchor': o['enabled']=o['id'] in ids
        anchor_count=sum(o['kind']=='anchor' and o.get('enabled',True) for o in project['objects'])
        for trial in range(c.trials):
            for li,original_receiver in enumerate(receivers):
                receiver=deepcopy(original_receiver)
                local_project=deepcopy(project)
                if c.sweep=='speed':
                    receiver['speed']=value
                    for o in local_project['objects']:
                        if o['kind']=='trajectory': o['speed']=value
                rng=np.random.default_rng(np.random.SeedSequence([c.seed,si,trial,li,0]))
                offsets=rng.normal(0,c.anchorSigmaM,size=(anchor_count,2))
                shadow=rng.normal(0,c.shadowingDb,size=anchor_count)
                trackers={e:Tracker(e,effective) for e in c.estimators if e in ['ekf','ukf']}
                for tick in range(steps):
                    if cancelled(): result['status']='cancelled'; break
                    rng=np.random.default_rng(np.random.SeedSequence([c.seed,si,trial,li,tick+1]))
                    frame=generate(local_project,receiver,tick*c.sampleStep,effective,rng,offsets,shadow)
                    frameid=f'{si}:{trial}:{li}:{tick}'
                    data=frame_json(frame)
                    data['observationHash']=hashlib.sha256(json.dumps(data,sort_keys=True,allow_nan=False,separators=(',',':')).encode()).hexdigest()
                    result['frames'][frameid]=data
                    for estimator in c.estimators:
                        if cancelled(): result['status']='cancelled'; break
                        record=dict(frameId=frameid,trial=trial,locationId=receiver['id'],time=frame.time,sweepValue=float(value),estimator=estimator,observationHash=data['observationHash'],truth=frame.truth.tolist(),errorM=None,failure=None,position=None,residualRms=None,condition=None)
                        before=time.perf_counter_ns()
                        try:
                            fit=trackers[estimator].step(frame) if estimator in trackers else estimate(frame,estimator,seed=int(np.random.SeedSequence([c.seed,si,trial,li,tick,991]).generate_state(1)[0]))
                            record.update(fit)
                            record['errorM']=float(np.linalg.norm(np.array(fit['position'])-frame.truth))
                        except (ValueError,np.linalg.LinAlgError,FloatingPointError,OverflowError) as error:
                            record['failure']=str(error) or type(error).__name__
                        record['runtimeMs']=(time.perf_counter_ns()-before)/1e6
                        result['records'].append(record); result['completed']+=1
                        if result['completed']%10==0: progress(result)
                    if result['status']=='cancelled': break
                if result['status']=='cancelled': break
            if result['status']=='cancelled': break
        if result['status']=='cancelled': break
    result['elapsedSeconds']=time.perf_counter()-started
    if result['status']=='running': result['status']='completed'
    result['summaries']=summaries(result['records']); result['unattempted']=total-result['completed']
    progress(result)
    return result

# Local single-user API jobs. Checkpoints are atomic JSON under an ignored data directory.
DATA=Path(os.environ.get('TERRALAB_DATA_DIR',Path(__file__).resolve().parents[3]/'.terralab/experiments'))
POOL=ThreadPoolExecutor(max_workers=1,thread_name_prefix='terralab-science')
JOBS={}; LOCK=threading.RLock()

def save_job(job):
    DATA.mkdir(parents=True,exist_ok=True)
    path=DATA/(job['id']+'.json'); temporary=path.with_suffix('.tmp')
    temporary.write_text(json.dumps(job['result'],allow_nan=False),encoding='utf-8'); temporary.replace(path)

def start_job(request):
    with LOCK:
        finished=[key for key,job in JOBS.items() if job['result']['status'] not in ['queued','running']]
        for key in finished[:-2]: del JOBS[key]  # Terminal snapshots remain on disk.
        if sum(j['result']['status'] in ['queued','running'] for j in JOBS.values())>=4: raise ValueError('Four experiments are already queued/running')
        identity=str(uuid.uuid4()); event=threading.Event()
        c=request.config
        planned=len(locations(request))*(int(np.floor(c.duration/c.sampleStep+1e-9))+1)*(len(c.sweepValues) if c.sweep!='none' else 1)*c.trials*len(c.estimators)
        job=dict(id=identity,cancel=event,result=dict(id=identity,status='queued',request=request.model_dump(),completed=0,planned=planned,records=[],frames={},summaries=[],createdAt=utc(),softwareVersion=VERSION,environment=environment(),error=None))
        JOBS[identity]=job
        save_job(job)
    def run():
        def update(result):
            with LOCK:
                # execute publishes its terminal snapshot before returning. A second
                # callback must not rewrite that durable result after it was observed.
                if job['result']['status'] not in ['queued','running']: return
                if result['status']=='running' and time.monotonic()-job.get('publishedAt',0)<.5: return
                job['publishedAt']=time.monotonic()
                job['result']=dict(deepcopy(result),id=identity)
                # Checkpoint every second, and always at terminal states.
                if time.monotonic()-job.get('savedAt',0)>1 or result['status']!='running':
                    job['savedAt']=time.monotonic(); save_job(job)
        try:
            result=execute(request,event.is_set,update)
            update(result)
        except Exception as exc:
            with LOCK:
                job['result'].update(status='failed',error=str(exc),summaries=summaries(job['result']['records']))
                save_job(job)
    POOL.submit(run)
    return identity

def read_job(identity, detail=False):
    # UUID validation prevents path traversal even for direct API callers.
    identity=str(uuid.UUID(identity))
    with LOCK:
        if identity in JOBS:
            source=JOBS[identity]['result']
            if detail: result=deepcopy(source)
            else:
                result={key:deepcopy(value) for key,value in source.items() if key not in ['records','frames']}
                result['summaries']=summaries(source['records'])
                return result
        else:
            path=DATA/(identity+'.json')
            if not path.exists(): raise KeyError(identity)
            result=json.loads(path.read_text(encoding='utf-8'))
            if result['status'] in ['queued','running']:
                result.update(status='interrupted',error='API restarted before completion; stored partial results are retained')
        if not detail:
            result['summaries']=summaries(result['records']); result.pop('records',None); result.pop('frames',None)
        return result

def cancel_job(identity):
    identity=str(uuid.UUID(identity))
    with LOCK:
        if identity not in JOBS: raise KeyError(identity)
        job=JOBS[identity]
        if job['result']['status'] in ['running','queued']: job['cancel'].set()
        return read_job(identity)
