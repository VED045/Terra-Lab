from typing import Literal, Annotated
from pydantic import BaseModel, ConfigDict, Field, model_validator

Finite = Annotated[float, Field(allow_inf_nan=False)]
Coordinate = Annotated[Finite, Field(ge=-1_000_000, le=1_000_000)]

class Model(BaseModel):
    model_config = ConfigDict(extra="forbid")

class Point(Model):
    x: Coordinate
    y: Coordinate

class Measurement(Model):
    anchorId: str = Field(min_length=1)
    anchor: Point
    range: Finite = Field(ge=0)
    truth: Finite = Field(ge=0)
    blocked: bool
    sigma: Finite = Field(ge=0)

class MeasurementSet(Model):
    type: Literal["calibrated_range"]
    units: Literal["m"]
    time: Finite = Field(ge=0)
    measurements: list[Measurement] = Field(min_length=3, max_length=500)

    @model_validator(mode="after")
    def unique_anchors(self):
        if len({m.anchorId for m in self.measurements}) != len(self.measurements):
            raise ValueError("Anchor IDs must be unique")
        return self

class EstimatedPoint(Model):
    x: Finite
    y: Finite

class Solution(Model):
    position: EstimatedPoint
    condition: Finite
    rank: int
    residuals: list[Finite]
    rms: Finite
