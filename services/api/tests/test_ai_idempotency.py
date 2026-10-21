import json
import uuid
from copy import deepcopy
import pytest
from terralab import experiments
from terralab.lab_models import Request,LabConfig

def test_local_queue_idempotency_survives_cache_eviction_and_rejects_changed_input(tmp_path,monkeypatch):
    monkeypatch.setattr(experiments,'DATA',tmp_path)
    monkeypatch.setattr(experiments,'JOBS',{})
    class Pool:
        def submit(self,run): return None # Only verify admission, not numerical completion here.
    monkeypatch.setattr(experiments,'POOL',Pool())
    project=dict(schemaVersion=1,id=str(uuid.uuid4()),name='Retry verification',settings={'seed':42},objects=[dict(id='a'+str(i),kind='anchor',x=x,y=y) for i,(x,y) in enumerate([(0,0),(100,0),(0,100)])]+[dict(id='rx',kind='receiver',x=30,y=30,mobility='stationary')])
    request=Request(project=project,config=LabConfig(sweep='none',trials=1,duration=0,estimators=['wls']))
    identity=str(uuid.uuid4())
    assert experiments.start_job(request,identity)==identity
    assert experiments.start_job(request,identity)==identity
    assert len(experiments.JOBS)==1
    experiments.JOBS.clear()
    assert experiments.start_job(request,identity)==identity
    assert experiments.JOBS=={}
    changed=request.model_copy(deep=True);changed.config.seed+=1
    with pytest.raises(ValueError,match='Idempotency conflict'):experiments.start_job(changed,identity)
    with pytest.raises(ValueError):experiments.start_job(request,'../not-a-uuid')
