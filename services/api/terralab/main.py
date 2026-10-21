from fastapi import FastAPI, HTTPException, Header, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import os
import uuid
import threading
from . import cloud
from .models import MeasurementSet, Solution
from .engine import solve_ranges, GeometryError

app = FastAPI(title="TerraLab Scientific API", version="0.3.0", description="Research workspace and reproducible positioning laboratory; scientific model 0.2.0 retained.")
if os.environ.get('TERRALAB_ENV')=='production' and cloud.mode()!='supabase':
    raise RuntimeError('Production requires Supabase durable jobs; local filesystem mode is development only')
origins=[value.strip() for value in os.environ.get('TERRALAB_CORS_ORIGINS','http://localhost:3000,http://127.0.0.1:3000').split(',') if value.strip()]
if '*' in origins: raise RuntimeError('Use explicit CORS origins')
app.add_middleware(CORSMiddleware,allow_origins=origins,allow_methods=['GET','POST','DELETE'],allow_headers=['Authorization','Content-Type','Idempotency-Key'])

class BodyLimit:
    def __init__(self,app): self.app=app
    async def __call__(self,scope,receive,send):
        if scope['type']!='http' or scope['method'] not in ('POST','PUT','PATCH'):
            return await self.app(scope,receive,send)
        size=0;chunks=[]
        while True:
            message=await receive()
            if message['type']=='http.disconnect': return
            chunk=message.get('body',b'');size+=len(chunk)
            if size>2_000_000:
                return await JSONResponse({'detail':'Request exceeds 2 MB'},status_code=413)(scope,receive,send)
            chunks.append(chunk)
            if not message.get('more_body'): break
        pending=True
        async def replay():
            nonlocal pending
            if pending: pending=False; return {'type':'http.request','body':b''.join(chunks),'more_body':False}
            return await receive()
        return await self.app(scope,replay,send)
app.add_middleware(BodyLimit)

@app.get("/health")
def health():
    return {"status": "ok", "phase": 3, "version": "0.3.0", "scientificVersion":"0.2.0", "jobMode":cloud.mode(), "solver": "scipy QR/SVD, least_squares, EKF/UKF", "measurement": "calibrated_range", "laboratoryModels": ['toa','pseudorange','tdoa','rtt','aoa','rss','hybrid']}

@app.post("/solve", response_model=Solution)
def solve(observations: MeasurementSet):
    try:
        return solve_ranges(observations)
    except GeometryError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

from .lab_models import Request as ExperimentRequest
from .experiments import start_job, read_job, cancel_job
from .experiments import list_jobs
from .signals import SignalRequest, run_signal
from .reports import Report, pdf
from fastapi.responses import Response
SMALL_WORK=threading.BoundedSemaphore(2)

def verify_cloud_user(authorization):
    if cloud.mode()=='supabase': cloud.call('/auth/v1/user',authorization)

@app.post('/signals')
def signal_demonstration(request: SignalRequest, authorization: str | None=Header(default=None)):
    verify_cloud_user(authorization)
    if not SMALL_WORK.acquire(blocking=False): raise HTTPException(429,'Two bounded exports/signal examples are already running; retry shortly')
    try: return run_signal(request)
    finally: SMALL_WORK.release()

@app.post('/reports/pdf')
def export_pdf(request: Report, authorization: str | None=Header(default=None)):
    verify_cloud_user(authorization)
    if not SMALL_WORK.acquire(blocking=False): raise HTTPException(429,'Two bounded exports/signal examples are already running; retry shortly')
    try: return Response(pdf(request),media_type='application/pdf',headers={'Content-Disposition':'attachment; filename="terralab-report.pdf"','Cache-Control':'no-store'})
    finally: SMALL_WORK.release()

@app.post('/experiments', status_code=202)
def create_experiment(request: ExperimentRequest, authorization: str | None = Header(default=None), idempotency_key: str | None = Header(default=None)):
    if cloud.mode()=='supabase':
        try: key=str(uuid.UUID(idempotency_key or ''))
        except ValueError as exc: raise HTTPException(422,'A UUID Idempotency-Key is required') from exc
        return cloud.create(request,authorization,key)
    try: return {'id': start_job(request,idempotency_key)}
    except ValueError as exc: raise HTTPException(422, str(exc)) from exc

@app.get('/experiments/{identity}')
def get_experiment(identity: str, detail: bool = False, authorization: str | None = Header(default=None)):
    try: identity=str(uuid.UUID(identity))
    except ValueError as exc: raise HTTPException(404,'Experiment not found') from exc
    if cloud.mode()=='supabase': return cloud.read(identity,authorization,detail)
    try: return read_job(identity, detail)
    except (KeyError, ValueError) as exc: raise HTTPException(404, 'Experiment not found') from exc

@app.get('/experiments')
def list_experiments(project_id: str, authorization: str | None = Header(default=None)):
    try: project_id=str(uuid.UUID(project_id))
    except ValueError as exc: raise HTTPException(422, 'A project UUID is required') from exc
    if cloud.mode()=='supabase':
        rows=cloud.call('/rest/v1/research_jobs?project_id=eq.'+project_id+'&select=id,status,created_at,completed,planned&order=created_at.desc&limit=50',authorization)
        return [dict(id=row['id'],projectId=project_id,status=row['status'],createdAt=row['created_at'],completed=row['completed'],planned=row['planned']) for row in rows]
    return list_jobs(project_id)

@app.delete('/experiments/{identity}')
def stop_experiment(identity: str, authorization: str | None = Header(default=None)):
    try: identity=str(uuid.UUID(identity))
    except ValueError as exc: raise HTTPException(404,'Experiment not found') from exc
    if cloud.mode()=='supabase': return cloud.cancel(identity,authorization)
    try: return cancel_job(identity)
    except (KeyError, ValueError) as exc: raise HTTPException(404, 'Active experiment not found') from exc
