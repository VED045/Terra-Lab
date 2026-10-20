"""Linearized calibrated-range 2D multilateration. No pseudorange assumption."""
import numpy as np
from scipy.linalg import lstsq
from .models import MeasurementSet, EstimatedPoint, Solution

class GeometryError(ValueError):
    pass

def solve_ranges(observations: MeasurementSet) -> Solution:
    anchors = np.array([[m.anchor.x, m.anchor.y] for m in observations.measurements], dtype=np.float64)
    ranges = np.array([m.range for m in observations.measurements], dtype=np.float64)
    # Translate first: makes the squared coordinate terms safe at large world offsets.
    delta = anchors[1:] - anchors[0]
    matrix = 2 * delta
    rhs = np.sum(delta * delta, axis=1) + (ranges[0] - ranges[1:]) * (ranges[0] + ranges[1:])
    try:
        position, _, rank, singular = lstsq(matrix, rhs, cond=1e-12, lapack_driver="gelsd", check_finite=True)
    except (ValueError, np.linalg.LinAlgError) as exc:
        raise GeometryError("Numerical least-squares failure") from exc
    if rank < 2:
        raise GeometryError("Degenerate geometry: at least three non-collinear anchors are required")
    condition = float(singular[0] / singular[-1])
    if not np.isfinite(condition) or condition > 1e8:
        raise GeometryError("Ill-conditioned geometry (condition > 1e8)")
    position += anchors[0]
    if not np.all(np.isfinite(position)):
        raise GeometryError("Numerical solution is not finite")
    residuals = np.linalg.norm(position - anchors, axis=1) - ranges
    return Solution(position=EstimatedPoint(x=float(position[0]), y=float(position[1])), condition=condition, rank=int(rank), residuals=residuals.tolist(), rms=float(np.sqrt(np.mean(residuals**2))))
