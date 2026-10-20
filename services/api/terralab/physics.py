"""Synthetic 2D propagation: geometric LOS and explicitly approximate link budgets."""
from dataclasses import dataclass
import math
import numpy as np
from .lab_models import LabConfig, C

def wrap(a):
    return (a + np.pi) % (2*np.pi) - np.pi

def ns_to_m(ns):
    return C * np.asarray(ns) * 1e-9

def rtt_to_m(total_ns, turnaround_ns, equipment_ns):
    return float(ns_to_m(total_ns - turnaround_ns - equipment_ns) / 2)

def path_position(points, travel, loop):
    p = np.array([[q['x'], q['y']] for q in points], dtype=float)
    if loop: p = np.vstack([p, p[0]])
    lengths = np.linalg.norm(np.diff(p, axis=0), axis=1)
    total = sum(lengths)
    if total <= 0: return p[0]
    d = travel % total if loop else min(travel, total)
    for i, length in enumerate(lengths):
        if length > 0 and d <= length: return p[i] + (p[i+1]-p[i])*d/length
        d -= length
    return p[-1]

def fnv(text):
    h = 2166136261
    for c in text:
        code=ord(c); code=0xd800+((code-0x10000)>>10) if code>0xffff else code
        h = ((h ^ code) * 16777619) & 0xffffffff
    return h

def position(receiver, time, project, speed=None):
    r = receiver
    t = math.floor((max(0, time)+1e-9)/r.get('updateInterval', 1))*r.get('updateInterval', 1)
    start = np.array([r['x'], r['y']], dtype=float)
    mode = r.get('mobility', 'stationary')
    v = r.get('speed', 1) if speed is None else speed
    if mode == 'stationary': return start
    if mode in ['velocity', 'linear']:
        a = math.radians(r.get('heading', 0))
        return start + v*t*np.array([math.cos(a), math.sin(a)])
    if mode == 'circular':
        radius = r.get('radius', 10)
        a = t*v/radius
        return start + radius*np.array([math.cos(a)-1, math.sin(a)])
    if mode == 'waypoints':
        path = next(o for o in project['objects'] if o['id'] == r['trajectoryId'])
        return path_position(path['points'], t*(path['speed'] if speed is None else speed), path.get('loop', False))
    if mode != 'random': raise ValueError('Unknown mobility model')
    # Same FNV/LCG stream and route as the Phase 1 browser mobility engine.
    seed = project.get('settings', {}).get('seed', 42) ^ fnv(r['id'])
    def uniform():
        nonlocal seed
        seed = (1664525*seed + 1013904223) & 0xffffffff
        return (seed+.5)/4294967296
    points = [dict(x=start[0], y=start[1])]
    length = 0
    while length < v*t and len(points) < 100001:
        q = dict(x=start[0]+(uniform()-.5)*100, y=start[1]+(uniform()-.5)*80)
        length += math.hypot(q['x']-points[-1]['x'], q['y']-points[-1]['y'])
        points.append(q)
    return path_position(points, v*t, False)

def polygon(o):
    pts = o.get('vertices', []) if o.get('shape') == 'polygon' else [dict(x=0,y=0),dict(x=o.get('width',20),y=0),dict(x=o.get('width',20),y=o.get('height',10)),dict(x=0,y=o.get('height',10))]
    return np.array([[p['x']+o['x'],p['y']+o['y']] for p in pts])

def cross(a,b,c): return float((b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]))
def on(a,b,p): return abs(cross(a,b,p)) < 1e-9 and np.all(p >= np.minimum(a,b)-1e-9) and np.all(p <= np.maximum(a,b)+1e-9)
def intersect(a,b,c,d):
    return (cross(a,b,c)*cross(a,b,d) < 0 and cross(c,d,a)*cross(c,d,b) < 0) or on(a,b,c) or on(a,b,d) or on(c,d,a) or on(c,d,b)
def inside(p, poly):
    hit = False
    for i, a in enumerate(poly):
        b = poly[(i+1)%len(poly)]
        if on(a,b,p): return True
        if (a[1]>p[1]) != (b[1]>p[1]) and p[0] < (b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0]: hit = not hit
    return hit
def blocked(a,b,obstacles):
    for o in obstacles:
        poly=polygon(o)
        if len(poly) >= 3 and (inside(a,poly) or inside(b,poly) or any(intersect(a,b,c,poly[(i+1)%len(poly)]) for i,c in enumerate(poly))): return True
    return False

@dataclass
class Frame:
    time: float
    truth: np.ndarray
    y: np.ndarray
    covariance: np.ndarray
    observations: list
    anchors: list
    model: str
    reference: dict | None
    config: LabConfig
    nominalGaussian: bool = True

    def predict(self, x):
        values=[]
        for o in self.observations:
            delta = x[:2]-np.array(o['anchor'])
            d=max(np.linalg.norm(delta),1e-9)
            if o['kind'] == 'aoa': values.append(np.arctan2(delta[1],delta[0]))
            elif o['kind'] == 'rss': values.append(o['power']-o['loss']-10*self.config.pathLossExponent*np.log10(max(d,1)))
            elif o['kind'] == 'tdoa': values.append(d - np.linalg.norm(x[:2]-np.array(self.reference['anchor'])))
            else: values.append(d + (x[2] if self.model == 'pseudorange' else 0))
        return np.asarray(values)

    def residual(self, x):
        r=self.predict(x)-self.y
        for i,o in enumerate(self.observations):
            if o['kind']=='aoa': r[i]=wrap(r[i])
        return r

def generate(project, receiver, time, config, rng, coordinate_offsets=None, shadow=None):
    c=config
    truth=position(receiver,time,project)
    anchors=[o for o in project['objects'] if o['kind']=='anchor' and o.get('enabled',True)]
    obstacles=[o for o in project['objects'] if o['kind']=='obstacle' and o.get('enabled',True)]
    if coordinate_offsets is None: coordinate_offsets=np.zeros((len(anchors),2))
    if shadow is None: shadow=np.zeros(len(anchors))
    common=float(ns_to_m(rng.normal(0,c.commonTimingNs)))
    clock_ns=receiver.get('clockOffset',0)+receiver.get('clockDrift',0)*1000*time
    raw=[]
    for i,a in enumerate(anchors):
        known=np.array([a['x'],a['y']],dtype=float)
        true_anchor=known+coordinate_offsets[i]
        d=max(np.linalg.norm(truth-true_anchor),1e-9)
        obstruction=blocked(true_anchor,truth,obstacles)
        nlos=obstruction or rng.random()<c.nlosProbability
        bias=rng.exponential(c.nlosBiasM) if nlos and c.nlosBiasM>0 else 0
        loss=c.referenceLossDb+20*np.log10(a.get('frequency',2400)/c.referenceFrequencyMHz)
        power=a.get('power',20)-loss-10*c.pathLossExponent*np.log10(max(d,1))+shadow[i]-(c.nlosLossDb if nlos else 0)
        floor=-174+10*np.log10(a.get('bandwidth',20)*1e6)+c.noiseFigureDb
        reason = ('missing' if a['id'] in c.missingIds else 'blocked' if c.excludeBlocked and obstruction else 'signal' if power<c.detectionDbm or power-floor<c.minSnrDb else 'availability' if rng.random()>c.availability else 'dropout' if rng.random()<c.dropout else None)
        timing_sigma=math.hypot(c.timingNs,a.get('timingUncertainty',0))
        range_sigma=math.hypot(c.noiseM,a.get('noise',.15))
        outlier=rng.random()<c.outlierProbability
        tail=rng.standard_t(3)*c.outlierScale if outlier else 0
        tx_ns=a.get('timingOffset',0)+a.get('clockDrift',0)*1000*time
        hardware=a.get('hardwareDelay',0)
        base=dict(id=a['id'],anchor=known.tolist(),trueAnchor=true_anchor.tolist(),blocked=obstruction,nlos=nlos,available=reason is None,reason=reason,power=a.get('power',20),loss=float(loss),signalDbm=float(power),outlier=outlier)
        raw.append((base,d,bias,timing_sigma,range_sigma,tail,tx_ns,hardware))
    rows=[]; variances=[]; common_coeff=[]
    kinds=c.hybrid if c.measurement=='hybrid' else [c.measurement]
    for kind in kinds:
        for base,d,bias,timing_sigma,range_sigma,tail,tx_ns,hardware in raw:
            if not base['available']: continue
            if kind=='aoa':
                if d<1e-6: continue  # Bearing is undefined at a coincident anchor.
                sig=math.hypot(math.radians(c.bearingSigmaDeg),c.anchorSigmaM/max(d,1))
                delta=truth-np.array(base['trueAnchor'])
                angle=np.arctan2(delta[1],delta[0])
                value=float(wrap(angle+rng.normal(0,math.radians(c.bearingSigmaDeg))+tail*max(math.radians(c.bearingSigmaDeg),1e-6)+(rng.choice([-1,1])*math.atan2(bias,max(d,1)) if base['nlos'] else 0)))
                variance=max(sig**2,1e-12); coeff=0
            elif kind=='rss':
                value=float(base['signalDbm']+rng.normal(0,c.rssNoiseDb)+tail*max(c.rssNoiseDb,1e-6))
                variance=max(c.rssNoiseDb**2+c.shadowingDb**2+(10*c.pathLossExponent/math.log(10)*c.anchorSigmaM/max(d,1))**2,1e-12); coeff=0
            else:
                factor=.5 if kind=='rtt' else 1
                sig=math.hypot(float(ns_to_m(timing_sigma))*factor,range_sigma)
                noise=rng.normal(0,sig)+tail*max(sig,1e-6)+common*factor
                if kind=='rtt':
                    total=2*(d+bias)/C*1e9+c.turnaroundNs+hardware
                    total *= 1+receiver.get('clockDrift',0)*1e-6
                    value=rtt_to_m(total,c.turnaroundCalibrationNs,c.equipmentCalibrationNs)+noise
                else: value=d+bias+float(ns_to_m(clock_ns+tx_ns+hardware))+noise
                variance=max(sig**2+c.anchorSigmaM**2,1e-12); coeff=factor
            rows.append(dict(base,kind=kind,value=float(value),sigma=math.sqrt(variance)))
            variances.append(variance); common_coeff.append(coeff)
    covariance=np.diag(variances)+float(ns_to_m(c.commonTimingNs))**2*np.outer(common_coeff,common_coeff)
    reference=None
    if c.measurement=='tdoa' and rows:
        reference=next((o for o in rows if c.referenceId=='auto' or o['id']==c.referenceId),None)
        if reference is None: rows=[]; covariance=np.empty((0,0))
        else:
            ref=rows.index(reference)
            indices=[i for i in range(len(rows)) if i!=ref]
            difference=np.zeros((len(indices),len(rows)))
            for j,i in enumerate(indices): difference[j,i]=1; difference[j,ref]=-1
            values=difference@np.array([o['value'] for o in rows])
            # Difference independent/common factors separately to avoid cancellation of tiny
            # diagonal variances against a much larger exactly common timing component.
            common_difference=difference@np.asarray(common_coeff)
            covariance=difference@np.diag(variances)@difference.T+float(ns_to_m(c.commonTimingNs))**2*np.outer(common_difference,common_difference)
            rows=[dict(rows[i],value=float(values[j]),sigma=math.sqrt(covariance[j,j])) for j,i in enumerate(indices)]
    covariance*=c.covarianceScale
    calibration_ok = True
    if c.measurement in ['toa','pseudorange','tdoa','hybrid']:
        calibration_ok = all(abs(a.get('timingOffset',0)+a.get('hardwareDelay',0)+a.get('clockDrift',0)*1000*time)<1e-10 for a in anchors)
        if c.measurement in ['toa','hybrid']: calibration_ok = calibration_ok and abs(clock_ns)<1e-10
    if c.measurement == 'rtt': calibration_ok = receiver.get('clockDrift',0)==0 and all(abs(c.turnaroundNs+a.get('hardwareDelay',0)-c.turnaroundCalibrationNs-c.equipmentCalibrationNs)<1e-10 for a in anchors)
    nominal = calibration_ok and not c.outlierProbability and not any(o['nlos'] for o in rows)
    return Frame(time,truth,np.array([o['value'] for o in rows]),covariance,rows,[b for b,*_ in raw],c.measurement,reference,c,nominal)
