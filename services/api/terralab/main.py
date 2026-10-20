from fastapi import FastAPI, HTTPException
from .models import MeasurementSet, Solution
from .engine import solve_ranges, GeometryError

app = FastAPI(title="TerraLab Scientific API", version="0.1.0", description="Phase 1: calibrated horizontal ranges only. No unknown clock bias is estimated.")

@app.get("/health")
def health():
    return {"status": "ok", "phase": 1, "solver": "scipy.linalg.lstsq/gelsd", "measurement": "calibrated_range"}

@app.post("/solve", response_model=Solution)
def solve(observations: MeasurementSet):
    try:
        return solve_ranges(observations)
    except GeometryError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
