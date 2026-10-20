import json
import hashlib
import uuid
from unittest.mock import patch
import numpy as np
import pytest
from fastapi.testclient import TestClient
from terralab.main import app
from terralab.signals import SignalRequest,run_signal
from terralab import cloud,worker
from terralab.reports import Report,pdf
from pathlib import Path

def signal(**kwargs):
    return SignalRequest(paths=[dict(delayNs=100,real=1,imag=0)],bandsMHz=[2400],snrDb=120,maxDelayNs=300,gridPoints=601,**kwargs)

def test_signal_replays_exact_csi_and_correct_single_path_peak():
    c=signal(algorithms=['matched','weighted','music','esprit'])
    a=run_signal(c);b=run_signal(c)
    assert a['csiReal']==b['csiReal'] and a['csiImag']==b['csiImag']
    for e in a['estimators'].values():assert not e['error'] and abs(e['delaysNs'][0]-100)<.001
    assert 'not MBWDE' in a['validation']

def test_signal_complex_model_matches_analytic_channel():
    c=signal(algorithms=['matched'],gainMode='coherent')
    r=run_signal(c);f=np.array(r['frequenciesOffsetHz']);observed=np.array(r['csiReal'])+1j*np.array(r['csiImag'])
    expected=np.exp(-2j*np.pi*f*100e-9)
    assert np.max(abs(observed[:,0]-expected))<1e-5

def test_esprit_recovers_coherent_multipath_and_rejects_gapped_bands():
    c=SignalRequest(paths=[dict(delayNs=100,real=1,imag=0),dict(delayNs=180,real=.5,imag=.2)],bandsMHz=[2400],gainMode='coherent',snrDb=120,algorithms=['music','esprit'])
    r=run_signal(c)
    assert 'Coherent' in r['estimators']['music']['error']
    assert np.max(abs(np.array(r['estimators']['esprit']['delaysNs'])-[100,180]))<.001
    c.bandsMHz=[2400,2480]
    assert 'one uniformly' in run_signal(c)['estimators']['esprit']['error']

def test_music_independent_multipath_and_heteroscedastic_noise():
    c=SignalRequest(paths=[dict(delayNs=100,real=1,imag=0),dict(delayNs=180,real=.5,imag=.2)],bandsMHz=[2400,2480],snrDb=80,bandNoiseDb=[0,10],algorithms=['music'],gridPoints=1001,maxDelayNs=500)
    r=run_signal(c)
    assert np.max(abs(np.array(r['estimators']['music']['delaysNs'])-[100,180]))<.51
    assert max(r['noiseVariance'])/min(r['noiseVariance'])==pytest.approx(10)

@pytest.mark.parametrize('patches',[dict(spacingKHz=10),dict(bandsMHz=[2400,2401]),dict(maxDelayNs=10000),dict(paths=[dict(delayNs=float('nan'),real=1,imag=0)]),dict(snapshots=1000),dict(bandNoiseDb=[0,1])])
def test_signal_invalid_and_oversized_inputs_rejected(patches):
    data=signal().model_dump();data.update(patches)
    with pytest.raises(ValueError):SignalRequest.model_validate(data)

def test_calibration_and_seed_change_csi_without_fabricating_validation():
    a=run_signal(signal());b=run_signal(signal(calibrationPhaseDeg=10,calibrationGainDb=1,calibrationDelayNs=2))
    assert a['csiReal']!=b['csiReal']
    assert any('calibration' in w for w in b['warnings'])

def test_cloud_never_uses_worker_key_for_user_request(monkeypatch):
    monkeypatch.setenv('SUPABASE_URL','https://example.supabase.co');monkeypatch.setenv('SUPABASE_PUBLISHABLE_KEY','test-public')
    with patch('terralab.cloud.urlopen') as transport:
        with pytest.raises(Exception) as e:cloud.call('/rest/v1/projects',None)
        assert e.value.status_code==401
        transport.assert_not_called()

def test_cloud_api_denies_missing_session_and_path_traversal(monkeypatch):
    monkeypatch.setenv('TERRALAB_JOB_MODE','supabase');monkeypatch.setenv('SUPABASE_URL','https://example.supabase.co');monkeypatch.setenv('SUPABASE_PUBLISHABLE_KEY','test-public')
    client=TestClient(app)
    with patch('terralab.cloud.urlopen') as transport:
        assert client.get('/experiments/'+str(uuid.uuid4())).status_code==401
        assert client.delete('/experiments/'+str(uuid.uuid4())).status_code==401
        assert client.get('/experiments/not-a-uuid').status_code==404
        transport.assert_not_called()

def test_streaming_body_limit_and_health():
    client=TestClient(app)
    assert client.post('/signals',content=b'x'*2_000_001).status_code==413
    assert client.get('/health').json()['phase']==3
    assert client.post('/signals',json=signal().model_dump()).status_code==200

def test_worker_artifact_chunks_are_immutable_and_integrity_checked_by_manifest():
    result={'id':str(uuid.uuid4()),'text':'Ω'*800000};uploads=[]
    with patch('terralab.cloud.call',side_effect=lambda *args,**kw:uploads.append((args,kw))):manifest=worker.upload(result,result['id'],str(uuid.uuid4()))
    import base64
    raw=b''.join(base64.b64decode(json.loads(args[3])['base64']) for args,kw in uploads)
    assert manifest['sha256']==hashlib.sha256(raw).hexdigest();assert manifest['bytes']==len(raw)
    assert json.loads(raw)==result
    assert all(args[2]=='POST' and kw['service'] for args,kw in uploads)
    assert all(len(args[3])<2097152 for args,kw in uploads)

def test_worker_preserves_partial_result_and_publishes_fenced_manifest(monkeypatch):
    from test_laboratory import network,config
    job=dict(id=str(uuid.uuid4()),lease_token=str(uuid.uuid4()),attempts=1,cancel_requested=True,request=dict(project=network(),config=config(trials=1,sweep='none').model_dump()))
    calls=[]
    monkeypatch.setattr(worker,'service_rpc',lambda name,data=None:calls.append((name,data)))
    monkeypatch.setattr(worker,'upload',lambda *args:dict(format='test'))
    worker.process(job)
    terminal=calls[-1][1]
    assert terminal['p_status']=='cancelled';assert terminal['p_completed']==0;assert terminal['p_lease']==job['lease_token']

def report_fixture():
    result=json.loads(Path('docs/examples/timing-clean.result.json').read_text(encoding='utf-8'))
    return dict(id=result['id'],createdAt=result['createdAt'],softwareVersion=result['softwareVersion'],status=result['status'],request=result['request'],completed=result['completed'],planned=result['planned'],summaries=result['summaries'],records=[{k:r[k] for k in ['estimator','time','truth','position','errorM','sweepValue','locationId','trial']} for r in result['records'][::20]],options=dict(title='Position error distribution',xLabel='Error (m)',yLabel='Cumulative probability',legend=True,width=1200,height=750),samplingNote='Every 20th epoch; metrics use the complete run.')

def test_pdf_is_real_vector_pdf_with_actual_metrics_and_escaped_config():
    value=report_fixture();value['request']['project']['name']='Research <unsafe> & test'
    result=pdf(Report.model_validate(value))
    assert result.startswith(b'%PDF-') and len(result)>10000
    # No screenshot/placeholder payload and no arbitrary supplied XML are accepted.
    assert b'/Type /Page' in result

def test_pdf_api_rejects_forged_nan_and_excess_trace_counts():
    value=report_fixture();value['records']=value['records']*20
    assert TestClient(app).post('/reports/pdf',json=value).status_code==422
