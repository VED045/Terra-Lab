"""Phase 4A acceptance additions; numerical tolerances remain unchanged."""
import json
import uuid
from urllib.error import HTTPError
from unittest.mock import patch

import numpy as np
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from terralab import cloud, worker
from terralab.main import app
from terralab.lab_models import Request
from terralab.experiments import execute, metrics
from test_laboratory import network, config

MODELS = ['toa', 'pseudorange', 'tdoa', 'rtt', 'aoa', 'rss', 'hybrid']
METHODS = ['ls', 'wls', 'nls', 'huber', 'soft_l1', 'reject', 'ransac', 'mle', 'ekf', 'ukf']
PAIRS = [(m, e) for m in MODELS for e in METHODS
         if e not in ['ls', 'ransac'] or m in ['toa', 'rtt', 'rss']]


@pytest.mark.parametrize('model,estimator', PAIRS)
def test_every_supported_pair_recovers_known_noiseless_first_fix(model, estimator):
    result = execute(Request(project=network(), config=config(measurement=model, estimators=[estimator])))
    assert result['status'] == 'completed'
    assert result['completed'] == result['planned'] == 1
    row = result['records'][0]
    assert row['failure'] is None
    assert row['errorM'] < 1e-5
    assert np.linalg.norm(np.array(row['position']) - [43, 37]) < 1e-5
    assert json.loads(json.dumps(result, allow_nan=False)) == result


def test_full_metrics_retain_bad_finite_estimates_and_failed_attempts():
    rows = [dict(errorM=error, runtimeMs=i+1, failure='no fix' if error is None else None)
            for i, error in enumerate([1.0, 1e9, None])]
    result = metrics(rows)
    assert result['attempted'] == 3 and result['fixes'] == 2 and result['failures'] == 1
    assert result['availability'] == pytest.approx(2/3)
    assert result['maxErrorM'] == 1e9
    assert result['rmseM'] == pytest.approx(np.sqrt((1 + 1e18)/2))
    assert result['medianRuntimeMs'] == 2


@pytest.mark.parametrize('status', [400, 401, 403, 404, 409, 429, 500])
def test_upstream_cloud_errors_do_not_disclose_secrets_or_sql(monkeypatch, status):
    monkeypatch.setenv('SUPABASE_URL', 'https://fixture.supabase.co')
    monkeypatch.setenv('SUPABASE_PUBLISHABLE_KEY', 'fixture-public')
    with patch('terralab.cloud.urlopen', side_effect=HTTPError(
            'https://fixture/secret-token', status, 'private SQL secret-token', {}, None)):
        with pytest.raises(HTTPException) as caught:
            cloud.call('/rest/v1/research_jobs', 'Bearer fixture-user')
    assert 'secret-token' not in caught.value.detail
    assert 'SQL' not in caught.value.detail
    assert caught.value.status_code == (502 if status == 500 else status)


def test_cloud_signal_requires_validated_user_session(monkeypatch):
    from test_platform import signal
    monkeypatch.setenv('TERRALAB_JOB_MODE', 'supabase')
    monkeypatch.setenv('SUPABASE_URL', 'https://fixture.supabase.co')
    monkeypatch.setenv('SUPABASE_PUBLISHABLE_KEY', 'fixture-public')
    with patch('terralab.cloud.urlopen') as transport:
        assert TestClient(app).post('/signals', json=signal().model_dump()).status_code == 401
        transport.assert_not_called()


def test_cors_rejects_unapproved_origin():
    response = TestClient(app).options('/experiments', headers={
        'Origin': 'https://outsider.invalid', 'Access-Control-Request-Method': 'POST'})
    assert response.status_code == 400
    assert 'access-control-allow-origin' not in response.headers


def test_failed_chunk_upload_never_publishes_success_or_partial_manifest(monkeypatch):
    job = dict(id=str(uuid.uuid4()), lease_token=str(uuid.uuid4()), attempts=1,
               request=dict(project=network(), config=config().model_dump()))
    calls = []
    monkeypatch.setattr(worker, 'service_rpc', lambda name, data=None: calls.append((name, data)))
    def unavailable(*args):
        raise HTTPException(503, 'secret-token should not be logged')
    monkeypatch.setattr(worker, 'upload', unavailable)
    worker.process(job)
    name, terminal = calls[-1]
    assert name == 'finish_research_job'
    assert terminal['p_status'] == 'failed' and terminal['p_manifest'] is None
    assert terminal['p_lease'] == job['lease_token']
    assert 'secret-token' not in json.dumps(terminal)
    assert terminal['p_completed'] == 1


@pytest.mark.parametrize('mode,origins,message', [
    ('local', 'https://frontend.invalid', 'Production requires Supabase'),
    ('supabase', '*', 'Use explicit CORS origins'),
])
def test_production_refuses_unsafe_startup(mode, origins, message):
    import os
    import subprocess
    import sys
    environment = {**os.environ, 'PYTHONPATH': 'services/api', 'TERRALAB_ENV': 'production',
                   'TERRALAB_JOB_MODE': mode, 'TERRALAB_CORS_ORIGINS': origins}
    result = subprocess.run([sys.executable, '-c', 'import terralab.main'],
                            env=environment, capture_output=True, text=True, timeout=20)
    assert result.returncode != 0
    assert message in result.stderr
