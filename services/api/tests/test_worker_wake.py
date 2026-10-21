import threading
from urllib.request import Request, urlopen
from urllib.error import HTTPError
from unittest.mock import Mock
import pytest
from fastapi import HTTPException
from terralab import worker_wake, cloud

def test_private_wake_requires_token_and_binds_only_loopback(monkeypatch):
    token='fixture-private-notification-token'
    monkeypatch.setattr(worker_wake,'configuration',lambda: (0,token))
    event=threading.Event()
    server=worker_wake.listen(event)
    try:
        assert server.server_address[0] == '127.0.0.1'
        port=server.server_address[1]
        for path,auth in [('/wake','wrong'),('/other','Bearer '+token)]:
            with pytest.raises(HTTPError) as denied:
                urlopen(Request(f'http://127.0.0.1:{port}'+path,data=b'',headers={'Authorization':auth}),timeout=2)
            assert denied.value.code == 403
            assert not event.is_set()
        with urlopen(Request(f'http://127.0.0.1:{port}/wake',data=b'',headers={'Authorization':'Bearer '+token}),timeout=2) as response:
            assert response.status == 202
        assert event.wait(1)
    finally:
        server.shutdown(); server.server_close()

def test_submission_commits_before_notifying_and_keeps_idempotency_on_wake_failure(monkeypatch):
    from test_laboratory import network,config
    from terralab.lab_models import Request as ExperimentRequest
    events=[]
    monkeypatch.setattr(cloud,'rpc',lambda *args: events.append(args) or 'existing-job')
    monkeypatch.setattr(worker_wake,'notify',lambda: events.append('wake'))
    request=ExperimentRequest(project=network(),config=config(trials=1,sweep='none').model_dump())
    assert cloud.create(request,'Bearer fixture','key') == {'id':'existing-job'}
    assert events[0][0] == 'enqueue_research_job' and events[0][1]['p_key'] == 'key'
    assert events[1] == 'wake'
    def unavailable(): raise HTTPException(503,'queued; wake unavailable')
    monkeypatch.setattr(worker_wake,'notify',unavailable)
    with pytest.raises(HTTPException): cloud.create(request,'Bearer fixture','key')
    monkeypatch.setattr(worker_wake,'notify',lambda: None)
    assert cloud.create(request,'Bearer fixture','key') == {'id':'existing-job'}
    assert all(e[1]['p_key']=='key' for e in events if isinstance(e,tuple))

def test_unavailable_wake_returns_actionable_503_without_exposing_configuration(monkeypatch):
    monkeypatch.setattr(worker_wake,'configuration',lambda: (_ for _ in ()).throw(ValueError('secret config')))
    with pytest.raises(HTTPException) as error: worker_wake.notify()
    assert error.value.status_code == 503
    assert 'without duplicating' in error.value.detail and 'secret config' not in error.value.detail
