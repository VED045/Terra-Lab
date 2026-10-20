from copy import deepcopy
import json
import numpy as np
import pytest
from fastapi.testclient import TestClient
from terralab.lab_models import LabConfig, Request, C
from terralab.physics import generate, ns_to_m, rtt_to_m, position, blocked
from terralab.estimators import estimate, Tracker, NoFix
from terralab.experiments import execute, metrics
from terralab.main import app

def network():
    coords=[(0,0),(60,-10),(120,0),(120,85),(60,100),(0,85)]
    return dict(schemaVersion=1,id='00000000-0000-4000-8000-000000000001',name='Reference',settings=dict(seed=42),objects=[dict(id=f'a{i}',kind='anchor',x=x,y=y,enabled=True,noise=0,timingOffset=0,timingUncertainty=0,clockDrift=0,hardwareDelay=0,power=20,frequency=2400,bandwidth=20) for i,(x,y) in enumerate(coords)]+[dict(id='rx',kind='receiver',x=43.,y=37.,enabled=True,mobility='stationary',speed=2,heading=20,radius=25,updateInterval=.1,clockOffset=0,clockDrift=0)])

def config(**kw): return LabConfig(**dict(dict(sweep='none',trials=1,timingNs=0,rssNoiseDb=0,bearingSigmaDeg=0,estimators=['wls']),**kw))
def frame(model='toa', **kw):
    project=network(); c=config(measurement=model,**kw)
    return generate(project,project['objects'][-1],0,c,np.random.default_rng(42))

@pytest.mark.parametrize('model',['toa','pseudorange','tdoa','rtt','aoa','rss','hybrid'])
def test_noiseless_recovery(model):
    f=frame(model); fit=estimate(f,'wls')
    assert np.linalg.norm(np.array(fit['position'])-f.truth)<1e-5

@pytest.mark.parametrize('algorithm',['ls','wls','nls','huber','soft_l1','reject','ransac','mle'])
def test_estimators_exact_reference(algorithm):
    f=frame(timingNs=1)
    f.y=np.linalg.norm(f.truth-np.array([o['anchor'] for o in f.observations]),axis=1)
    fit=estimate(f,algorithm,seed=42)
    assert np.linalg.norm(np.array(fit['position'])-f.truth)<1e-5

def test_unknown_clock_is_estimated_not_given_to_solver():
    project=network(); rx=project['objects'][-1]; rx['clockOffset']=150
    f=generate(project,rx,0,config(measurement='pseudorange'),np.random.default_rng(1))
    fit=estimate(f,'mle')
    assert np.linalg.norm(np.array(fit['position'])-f.truth)<1e-5
    assert abs(fit['clockBiasM']-float(ns_to_m(150)))<1e-5

def test_timing_and_rtt_conversion():
    assert float(ns_to_m(1))==pytest.approx(.299792458)
    assert rtt_to_m(2*25/C*1e9+150,100,50)==pytest.approx(25)

def test_tdoa_shared_reference_covariance_and_common_mode_cancellation():
    f=frame('tdoa',timingNs=2,commonTimingNs=100)
    sigma2=float(ns_to_m(2))**2
    assert f.covariance[0,0]==pytest.approx(2*sigma2)
    assert f.covariance[0,1]==pytest.approx(sigma2)
    project=network(); project['objects'][-1]['clockOffset']=100000
    g=generate(project,project['objects'][-1],0,config(measurement='tdoa'),np.random.default_rng(42))
    assert np.max(np.abs(g.y-frame('tdoa').y))<1e-8

def test_missing_tdoa_reference_is_a_failure():
    f=frame('tdoa',referenceId='a0',missingIds=['a0'])
    with pytest.raises(NoFix): estimate(f,'wls')

def test_collinear_and_far_degenerate_geometry():
    f=frame()
    for o in f.observations: o['anchor'][1]=0
    for o in f.anchors: o['anchor'][1]=0
    with pytest.raises(NoFix): estimate(f,'wls')

def test_dropout_and_detection_threshold():
    for args in [dict(dropout=1),dict(availability=0),dict(detectionDbm=0),dict(minSnrDb=50)]:
        f=frame(**args)
        assert len(f.y)==0
        with pytest.raises(NoFix): estimate(f,'wls')

def test_obstacle_blocks_segment_and_positive_nlos_delay():
    project=network(); project['objects'].append(dict(id='wall',kind='obstacle',enabled=True,x=10,y=0,width=2,height=60,shape='rectangle'))
    c=config(nlosBiasM=20); f=generate(project,project['objects'][-2],0,c,np.random.default_rng(2))
    assert any(o['blocked'] for o in f.observations)
    assert all(o['value']>=np.linalg.norm(np.array(o['anchor'])-f.truth)-1e-8 for o in f.observations)

def test_hardware_clock_and_rtt_calibration_sensitivity():
    project=network(); rx=project['objects'][-1]
    project['objects'][0]['hardwareDelay']=10
    f=generate(project,rx,0,config(),np.random.default_rng(42))
    assert f.y[0]-frame().y[0]==pytest.approx(float(ns_to_m(10)))
    r=frame('rtt',turnaroundNs=200,turnaroundCalibrationNs=100)
    assert r.y[0]-frame('rtt').y[0]==pytest.approx(float(ns_to_m(100))/2)
    rx['clockDrift']=.001
    g=generate(project,rx,2,config(measurement='pseudorange'),np.random.default_rng(42))
    fit=estimate(g,'wls')
    assert fit['clockBiasM']>0

def test_robust_rejection_ransac_and_weighting_handle_a_bad_anchor():
    f=frame(timingNs=1)
    f.y=np.linalg.norm(f.truth-np.array([o['anchor'] for o in f.observations]),axis=1); f.y[2]+=40
    ordinary=estimate(f,'nls')
    for method in ['huber','soft_l1','reject','ransac']:
        fit=estimate(f,method,seed=2)
        assert np.linalg.norm(np.array(fit['position'])-f.truth)<np.linalg.norm(np.array(ordinary['position'])-f.truth)/3
        if method in ['reject','ransac']: assert 2 in fit['rejected']
    f.covariance[2,2]=10000
    assert np.linalg.norm(np.array(estimate(f,'wls')['position'])-f.truth)<.1

def deterministic(result):
    result=deepcopy(result)
    result.pop('createdAt'); result.pop('elapsedSeconds')
    for r in result['records']: r.pop('runtimeMs')
    for s in result['summaries']: s.pop('medianRuntimeMs'); s.pop('p95RuntimeMs')
    return result

def test_paired_comparisons_and_reproducibility():
    request=Request(project=network(),config=config(trials=3,timingNs=2,estimators=['ls','wls','huber']))
    a=execute(request); b=execute(request)
    assert deterministic(a)==deterministic(b)
    for key in a['frames']:
        rows=[r for r in a['records'] if r['frameId']==key]
        assert len({r['observationHash'] for r in rows})==1
        assert len(rows)==3
    assert all(r['runtimeMs']>=0 for r in a['records'])
    request.project['objects'][-1]['x']=999
    assert a['request']['project']['objects'][-1]['x']==43

def test_parameter_sweep_noise_sensitivity():
    result=execute(Request(project=network(),config=config(trials=40,estimators=['wls'],sweep='timingNs',sweepValues=[.1,10])))
    assert result['summaries'][1]['rmseM']>20*result['summaries'][0]['rmseM']

@pytest.mark.parametrize('algorithm',['ekf','ukf'])
def test_filter_known_velocity_and_missing_epoch(algorithm):
    project=network(); rx=project['objects'][-1]; rx.update(mobility='velocity',speed=2,heading=15)
    c=config(timingNs=1,processNoise=.1)
    tracker=Tracker(algorithm,c); errors=[]
    for tick in range(15):
        f=generate(project,rx,tick,c,np.random.default_rng(tick))
        if tick==8:
            f.y=np.array([]); f.observations=[]; f.covariance=np.empty((0,0))
            with pytest.raises(NoFix): tracker.step(f)
            continue
        fit=tracker.step(f); errors.append(np.linalg.norm(np.array(fit['position'])-f.truth))
    assert np.mean(errors)<.6
    assert np.linalg.norm(tracker.x[2:4]-[2*np.cos(np.deg2rad(15)),2*np.sin(np.deg2rad(15))])<.4

def test_failed_fixes_and_cancellation_are_not_silently_excluded():
    result=execute(Request(project=network(),config=config(dropout=1,trials=3)))
    m=result['summaries'][0]
    assert m['failureRate']==1 and m['availability']==0 and m['rmseM'] is None
    counter=[0]
    def cancel(): counter[0]+=1; return counter[0]>5
    result=execute(Request(project=network(),config=config(trials=20)),cancel)
    assert result['status']=='cancelled' and result['completed']<result['planned'] and result['unattempted']>0

def test_rss_pathloss_and_bearing_uncertainty_affect_observations():
    a=frame('rss',pathLossExponent=2); b=frame('rss',pathLossExponent=4)
    assert np.mean(b.y)<np.mean(a.y)
    assert frame('aoa',bearingSigmaDeg=10).covariance[0,0]>frame('aoa',bearingSigmaDeg=1).covariance[0,0]

def test_large_translated_network_numerical_stability():
    project=network()
    for o in project['objects']: o['x']+=900000; o['y']-=800000
    f=generate(project,project['objects'][-1],0,config(),np.random.default_rng(2))
    assert np.linalg.norm(np.array(estimate(f,'wls')['position'])-f.truth)<1e-5

@pytest.mark.parametrize('measurement',['tdoa','aoa','pseudorange','hybrid'])
def test_incompatible_combinations_are_rejected(measurement):
    with pytest.raises(ValueError): LabConfig(measurement=measurement,estimators=['ls'])

def test_api_validation_and_resource_bounds():
    client=TestClient(app)
    response=client.post('/experiments',json=dict(project=network(),config=dict(measurement='aoa',estimators=['ls'])))
    assert response.status_code==422
    assert client.get('/experiments/not-a-uuid').status_code==404
    with pytest.raises(ValueError): Request(project=network(),config=config(trials=1000,duration=300,sampleStep=.1))

@pytest.mark.parametrize('model',['toa','pseudorange','tdoa','aoa','rss','hybrid'])
@pytest.mark.parametrize('algorithm',['ekf','ukf'])
def test_filters_support_declared_observation_models(model,algorithm):
    project=network();rx=project['objects'][-1];rx.update(mobility='velocity',speed=1,heading=30,clockOffset=50 if model=='pseudorange' else 0,clockDrift=.00001 if model=='pseudorange' else 0)
    c=config(measurement=model,timingNs=.5,rssNoiseDb=.05,bearingSigmaDeg=.1,processNoise=.2)
    tracker=Tracker(algorithm,c);errors=[]
    for tick in range(12):
        f=generate(project,rx,tick,c,np.random.default_rng(tick));fit=tracker.step(f)
        errors.append(np.linalg.norm(np.array(fit['position'])-f.truth))
    assert np.mean(errors)<.5

@pytest.mark.parametrize('mode',['stationary','velocity','circular','random','waypoints'])
def test_mobility_is_used_at_each_measurement_epoch(mode):
    project=network();rx=project['objects'][-1];rx['mobility']=mode
    if mode=='waypoints':
        rx['trajectoryId']='path';project['objects'].append(dict(kind='trajectory',id='path',enabled=True,x=0,y=0,points=[dict(x=43,y=37),dict(x=63,y=37)],speed=2,loop=False))
    f=generate(project,rx,0,config(),np.random.default_rng(1));g=generate(project,rx,5,config(),np.random.default_rng(1))
    assert np.allclose(f.truth,g.truth)==(mode=='stationary')
    assert position(rx,5,project).tolist()==g.truth.tolist()
    assert np.linalg.norm(np.array(estimate(g,'wls')['position'])-g.truth)<1e-5

@pytest.mark.parametrize('parameter,value',[('timingNs',10),('noiseM',2),('commonTimingNs',10),('anchorSigmaM',1),('covarianceScale',2)])
def test_range_covariance_parameter_sensitivity(parameter,value):
    a=frame(timingNs=1);b=frame(**dict(dict(timingNs=1),**{parameter:value}))
    assert np.trace(b.covariance)>np.trace(a.covariance)
    if parameter=='commonTimingNs': assert b.covariance[0,1]>0

def test_signal_power_frequency_and_bandwidth_affect_detection():
    project=network();rx=project['objects'][-1];c=config(minSnrDb=0)
    baseline=generate(project,rx,0,c,np.random.default_rng(1))
    project['objects'][0]['power']=-100
    weak=generate(project,rx,0,c,np.random.default_rng(1))
    assert len(weak.y)==len(baseline.y)-1
    project=network();project['objects'][0]['frequency']=10000
    high=generate(project,project['objects'][-1],0,c,np.random.default_rng(1))
    assert high.anchors[0]['signalDbm']<baseline.anchors[0]['signalDbm']
    project['objects'][0].update(bandwidth=10000,power=-30)
    wide=generate(project,project['objects'][-1],0,c,np.random.default_rng(1))
    assert not wide.anchors[0]['available']

def test_shadowing_coordinate_uncertainty_and_outliers_are_generated():
    c=config(anchorSigmaM=1,shadowingDb=5,outlierProbability=1,outlierScale=20,timingNs=1)
    result=execute(Request(project=network(),config=c));f=result['frames']['0:0:0:0']
    assert any(o['trueAnchor']!=o['anchor'] for o in f['anchors'])
    assert all(o['outlier'] for o in f['observations'])
    assert f['nominalGaussian'] is False
    assert frame('rss',rssNoiseDb=1,shadowingDb=5).covariance[0,0]>frame('rss',rssNoiseDb=1).covariance[0,0]

def test_bearing_wrap_and_nominal_ellipse_policy():
    f=frame('aoa');f.y[0]+=2*np.pi
    assert np.linalg.norm(np.array(estimate(f,'wls')['position'])-f.truth)<1e-5
    assert estimate(frame(timingNs=1),'wls')['ellipse'] is not None
    project=network();project['objects'][0]['hardwareDelay']=1
    f=generate(project,project['objects'][-1],0,config(timingNs=1),np.random.default_rng(1))
    assert estimate(f,'wls')['ellipse'] is None

def test_common_mode_tdoa_cancellation_remains_stable_at_zero_independent_noise():
    f=frame('tdoa',commonTimingNs=1000)
    assert np.linalg.eigvalsh(f.covariance).min()>0
    assert np.linalg.norm(np.array(estimate(f,'wls')['position'])-f.truth)<1e-5

def test_aoa_omits_undefined_coincident_anchor_bearing():
    project=network();rx=project['objects'][-1];rx.update(x=0,y=0)
    f=generate(project,rx,0,config(measurement='aoa'),np.random.default_rng(1))
    assert len(f.y)==5
    assert np.linalg.norm(np.array(estimate(f,'wls')['position'])-f.truth)<1e-5

def test_jobs_persist_terminal_outputs_and_detect_interruption(tmp_path,monkeypatch):
    import time
    from terralab import experiments as jobs
    monkeypatch.setattr(jobs,'DATA',tmp_path)
    identity=jobs.start_job(Request(project=network(),config=config(trials=2)))
    for _ in range(200):
        status=jobs.read_job(identity)
        if status['status'] not in ['running','queued']: break
        time.sleep(.01)
    result=jobs.read_job(identity,True)
    assert result['status']=='completed' and len(result['records'])==2
    del jobs.JOBS[identity]
    assert jobs.read_job(identity,True)['records']==result['records']
    interrupted=dict(result,status='running')
    (tmp_path/(identity+'.json')).write_text(json.dumps(interrupted))
    assert jobs.read_job(identity)['status']=='interrupted'

def test_job_cancellation_and_execution_failure(tmp_path,monkeypatch):
    import time, threading
    from terralab import experiments as jobs
    monkeypatch.setattr(jobs,'DATA',tmp_path)
    original=jobs.execute;gate=threading.Event()
    def delayed(*args): gate.wait(2);return original(*args)
    monkeypatch.setattr(jobs,'execute',delayed)
    identity=jobs.start_job(Request(project=network(),config=config(trials=10)))
    jobs.cancel_job(identity);gate.set()
    for _ in range(200):
        status=jobs.read_job(identity)
        if status['status'] not in ['queued','running']: break
        time.sleep(.01)
    assert status['status']=='cancelled' and status['completed']<status['planned']
    def broken(*args): raise RuntimeError('Injected job failure')
    monkeypatch.setattr(jobs,'execute',broken)
    identity=jobs.start_job(Request(project=network(),config=config()))
    for _ in range(200):
        status=jobs.read_job(identity)
        if status['status']=='failed':break
        time.sleep(.01)
    assert status['status']=='failed' and status['error']=='Injected job failure'
