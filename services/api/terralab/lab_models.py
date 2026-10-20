"""Phase 2 request contract. Units are SI except explicitly named ns, deg, dB fields."""
from typing import Literal, Annotated
from pydantic import BaseModel, ConfigDict, Field, model_validator, TypeAdapter
import math

Number = Annotated[float, Field(allow_inf_nan=False)]
Probability = Annotated[Number, Field(ge=0, le=1)]
Estimator = Literal['ls', 'wls', 'nls', 'huber', 'soft_l1', 'reject', 'ransac', 'mle', 'ekf', 'ukf']
Measurement = Literal['toa', 'pseudorange', 'tdoa', 'rtt', 'aoa', 'rss', 'hybrid']
VERSION = '0.2.0'
C = 299792458.0

class Strict(BaseModel):
    model_config = ConfigDict(extra='forbid')

class NetworkBase(BaseModel):
    model_config = ConfigDict(extra='ignore', strict=True)
    id: str = Field(min_length=1,max_length=100)
    x: Number = Field(ge=-1e6,le=1e6)
    y: Number = Field(ge=-1e6,le=1e6)
    enabled: bool = True
class NetworkPoint(BaseModel):
    model_config = ConfigDict(extra='forbid', strict=True)
    x: Number = Field(ge=-1e6,le=1e6)
    y: Number = Field(ge=-1e6,le=1e6)
class NetworkAnchor(NetworkBase):
    kind: Literal['anchor']
    power: Number = Field(default=20,ge=-100,le=100)
    frequency: Number = Field(default=2400,gt=0,le=100000)
    bandwidth: Number = Field(default=20,gt=0,le=10000)
    timingOffset: Number = 0
    timingUncertainty: Number = Field(default=0,ge=0)
    hardwareDelay: Number = 0
    clockDrift: Number = 0
    noise: Number = Field(default=.15,ge=0,le=1000)
class NetworkReceiver(NetworkBase):
    kind: Literal['receiver']
    mobility: Literal['stationary','velocity','linear','circular','random','waypoints'] = 'stationary'
    speed: Number = Field(default=1,ge=0,le=1000)
    heading: Number = 0
    radius: Number = Field(default=10,gt=0,le=10000)
    clockOffset: Number = 0
    clockDrift: Number = 0
    updateInterval: Number = Field(default=1,ge=.1,le=60)
    trajectoryId: str | None = None
class NetworkObstacle(NetworkBase):
    kind: Literal['obstacle']
    shape: Literal['rectangle','wall','polygon'] = 'rectangle'
    width: Number = Field(default=20,gt=0,le=10000)
    height: Number = Field(default=10,gt=0,le=10000)
    verticalHeight: Number | None = Field(default=None,gt=0,le=10000)
    baseElevation: Number | None = Field(default=None,ge=-1e6,le=1e6)
    vertices: list[NetworkPoint] = Field(default_factory=list,max_length=200)
    @model_validator(mode='after')
    def polygon_count(self):
        if self.shape=='polygon' and len(self.vertices)<3: raise ValueError('Polygon requires three vertices')
        return self
class NetworkTrajectory(NetworkBase):
    kind: Literal['trajectory']
    points: list[NetworkPoint] = Field(min_length=1,max_length=1000)
    speed: Number = Field(default=1,ge=0,le=1000)
    loop: bool = False
network_objects=TypeAdapter(list[Annotated[NetworkAnchor | NetworkReceiver | NetworkObstacle | NetworkTrajectory,Field(discriminator='kind')]])

class LabConfig(Strict):
    measurement: Measurement = 'toa'
    estimators: list[Estimator] = Field(default_factory=lambda: ['ls', 'wls', 'huber'], min_length=1, max_length=10)
    hybrid: list[Literal['toa', 'aoa', 'rss']] = Field(default_factory=lambda: ['toa', 'aoa'], min_length=2, max_length=3)
    referenceId: str = Field(default='auto', max_length=100)
    trials: int = Field(default=20, ge=1, le=1000)
    duration: Number = Field(default=0, ge=0, le=300)
    sampleStep: Number = Field(default=1, ge=.1, le=10)
    seed: int = Field(default=42, ge=0, le=2147483647)
    sweep: Literal['none', 'timingNs', 'nlosProbability', 'speed', 'anchorCount'] = 'timingNs'
    sweepValues: list[Number] = Field(default_factory=lambda: [.1, 1, 3, 10], min_length=1, max_length=20)
    timingNs: Number = Field(default=1, ge=0, le=1000)
    noiseM: Number = Field(default=0, ge=0, le=100)
    commonTimingNs: Number = Field(default=0, ge=0, le=1000)
    anchorSigmaM: Number = Field(default=0, ge=0, le=20)
    dropout: Probability = 0
    availability: Probability = 1
    missingIds: list[str] = Field(default_factory=list, max_length=100)
    nlosProbability: Probability = 0
    nlosBiasM: Number = Field(default=5, ge=0, le=1000)
    nlosLossDb: Number = Field(default=10, ge=0, le=100)
    outlierProbability: Probability = 0
    outlierScale: Number = Field(default=20, ge=0, le=1000)
    bearingSigmaDeg: Number = Field(default=1, ge=0, le=45)
    referenceLossDb: Number = Field(default=40, ge=0, le=150)
    pathLossExponent: Number = Field(default=2, ge=1, le=6)
    referenceFrequencyMHz: Number = Field(default=2400, ge=1, le=100000)
    shadowingDb: Number = Field(default=0, ge=0, le=30)
    rssNoiseDb: Number = Field(default=1, ge=0, le=30)
    detectionDbm: Number = Field(default=-120, ge=-200, le=0)
    minSnrDb: Number = Field(default=-20, ge=-50, le=50)
    noiseFigureDb: Number = Field(default=5, ge=0, le=40)
    turnaroundNs: Number = Field(default=100, ge=0, le=1000000)
    turnaroundCalibrationNs: Number = Field(default=100, ge=0, le=1000000)
    equipmentCalibrationNs: Number = Field(default=0, ge=-100000, le=100000)
    robustScale: Number = Field(default=1.5, ge=.1, le=20)
    rejectionSigma: Number = Field(default=4, ge=1, le=20)
    ransacIterations: int = Field(default=50, ge=5, le=500)
    maxIterations: int = Field(default=150, ge=20, le=1000)
    processNoise: Number = Field(default=.5, ge=.000001, le=100)
    clockProcessNoise: Number = Field(default=.01, ge=.000001, le=100)
    covarianceScale: Number = Field(default=1, ge=.01, le=100)
    excludeBlocked: bool = False
    gridSize: int = Field(default=0, ge=0, le=12)

    @model_validator(mode='after')
    def compatible(self):
        if len(set(self.estimators)) != len(self.estimators) or len(set(self.hybrid)) != len(self.hybrid):
            raise ValueError('Estimator and hybrid component lists must be unique')
        if any(e in ['ls', 'ransac'] for e in self.estimators) and self.measurement not in ['toa', 'rtt', 'rss']:
            raise ValueError('Linear LS and range RANSAC support calibrated TOA, RTT and RSS only')
        bounds = {'timingNs': (0, 1000), 'nlosProbability': (0, 1), 'speed': (0, 1000), 'anchorCount': (3, 100)}
        if self.sweep != 'none':
            lo, hi = bounds[self.sweep]
            if any(v < lo or v > hi or (self.sweep == 'anchorCount' and v != int(v)) for v in self.sweepValues):
                raise ValueError('Sweep value is outside the selected parameter bounds')
        if self.measurement == 'aoa' and self.bearingSigmaDeg == 0:
            pass  # A tiny numerical covariance floor permits exact noiseless tests.
        return self

class Request(Strict):
    project: dict
    config: LabConfig = Field(default_factory=LabConfig)

    @model_validator(mode='after')
    def network(self):
        objects = self.project.get('objects', [])
        if not isinstance(objects, list) or len(objects) > 100:
            raise ValueError('Laboratory supports at most 100 network objects')
        if self.project.get('schemaVersion',1) not in (1,2): raise ValueError('Unsupported project schema')
        if self.project.get('schemaVersion',1)==1 and any(isinstance(o,dict) and ('verticalHeight' in o or 'baseElevation' in o) for o in objects): raise ValueError('Physical dimensions require schema 2')
        if any(isinstance(o,dict) and any(k in o and o[k] is None for k in ('verticalHeight','baseElevation')) for o in objects): raise ValueError('Physical dimensions must be finite numbers when present')
        validated=network_objects.validate_python(objects)
        self.project={**self.project,'objects':[{**original,**value.model_dump(exclude={'verticalHeight','baseElevation'}-set(original))} for original,value in zip(objects,validated)]}
        objects=self.project['objects']
        ids = [o.get('id') for o in objects if isinstance(o, dict)]
        if len(ids) != len(objects) or len(set(ids)) != len(ids):
            raise ValueError('Network object IDs must be present and unique')
        anchors = [o for o in objects if o.get('kind') == 'anchor' and o.get('enabled', True)]
        receivers = [o for o in objects if o.get('kind') == 'receiver' and o.get('enabled', True)]
        if len(anchors) < 3 or not receivers:
            raise ValueError('At least three enabled anchors and one enabled receiver are required')
        if self.config.referenceId != 'auto' and self.config.referenceId not in [a['id'] for a in anchors]:
            raise ValueError('TDOA reference must be an enabled anchor')
        if not set(self.config.missingIds).issubset({o['id'] for o in objects if o['kind']=='anchor'}):
            raise ValueError('Missing observation IDs must identify anchors')
        for o in objects:
            if o.get('kind') not in ['anchor', 'receiver', 'trajectory', 'obstacle']:
                raise ValueError('Unknown network object kind')
            for k, v in o.items():
                if isinstance(v, (int, float)) and (not math.isfinite(v) or abs(v) > 1e9):
                    raise ValueError(f'Invalid numeric object field {k}')
            if not all(isinstance(o.get(k), (int, float)) for k in ['x', 'y']):
                raise ValueError('Every object needs finite x/y coordinates')
            for point in o.get('points', []) + o.get('vertices', []):
                if not all(isinstance(point.get(k), (int, float)) and math.isfinite(point[k]) and abs(point[k]) <= 1e6 for k in ['x','y']):
                    raise ValueError('Invalid path or polygon point')
            if o['kind'] == 'anchor':
                if o.get('frequency', 2400) <= 0 or o.get('bandwidth', 20) <= 0 or o.get('noise', .15) < 0 or o.get('timingUncertainty', 0) < 0:
                    raise ValueError('Invalid anchor RF/noise parameters')
            if o['kind'] == 'receiver':
                if o.get('updateInterval', 1) <= 0 or o.get('radius', 10) <= 0 or o.get('speed', 1) < 0:
                    raise ValueError('Invalid mobility parameters')
                if o.get('mobility') == 'waypoints' and not any(t['id'] == o.get('trajectoryId') and t['kind'] == 'trajectory' and t.get('enabled', True) and t.get('points') for t in objects):
                    raise ValueError('Waypoint receiver requires an enabled nonempty trajectory')
        locations = len(receivers) + self.config.gridSize ** 2
        steps = math.floor(self.config.duration / self.config.sampleStep + 1e-9) + 1
        sweeps = len(self.config.sweepValues) if self.config.sweep != 'none' else 1
        work = locations * steps * sweeps * self.config.trials * len(self.config.estimators)
        if work > 100000:
            raise ValueError('Experiment exceeds 100,000 estimator epochs; reduce trials, time, grid or sweep')
        if locations * steps * sweeps * self.config.trials * len(anchors) > 500000:
            raise ValueError('Experiment exceeds 500,000 stored anchor observations; reduce experiment size')
        if self.config.sweep == 'anchorCount' and max(self.config.sweepValues) > len(anchors):
            raise ValueError('Anchor-count sweep exceeds the enabled network anchors')
        if self.config.measurement=='tdoa' and self.config.sweep=='anchorCount' and self.config.referenceId!='auto' and self.config.referenceId not in [a['id'] for a in anchors[:int(min(self.config.sweepValues))]]:
            raise ValueError('Anchor-count sweep would remove the explicit TDOA reference')
        if self.config.sweep=='speed' and not any(r.get('mobility','stationary')!='stationary' for r in receivers):
            raise ValueError('Speed sweep requires at least one moving receiver')
        return self
