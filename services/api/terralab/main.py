from fastapi import FastAPI, HTTPException
from .models import MeasurementSet, Solution
from .engine import solve_ranges, GeometryError

app = FastAPI(title="TerraLab Scientific API", version="0.2.0", description="Reproducible 2D positioning laboratory; Phase 1 calibrated-range endpoint retained.")

@app.get("/health")
def health():
    return {"status": "ok", "phase": 2, "version": "0.2.0", "solver": "scipy QR/SVD, least_squares, EKF/UKF", "measurement": "calibrated_range", "laboratoryModels": ['toa','pseudorange','tdoa','rtt','aoa','rss','hybrid']}

@app.post("/solve", response_model=Solution)
def solve(observations: MeasurementSet):
    try:
        return solve_ranges(observations)
    except GeometryError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

from .lab_models import Request as ExperimentRequest
from .experiments import start_job, read_job, cancel_job

@app.post('/experiments', status_code=202)
def create_experiment(request: ExperimentRequest):
    try: return {'id': start_job(request)}
    except ValueError as exc: raise HTTPException(422, str(exc)) from exc

@app.get('/experiments/{identity}')
def get_experiment(identity: str, detail: bool = False):
    try: return read_job(identity, detail)
    except (KeyError, ValueError) as exc: raise HTTPException(404, 'Experiment not found') from exc

@app.delete('/experiments/{identity}')
def stop_experiment(identity: str):
    try: return cancel_job(identity)
    except (KeyError, ValueError) as exc: raise HTTPException(404, 'Active experiment not found') from exc
