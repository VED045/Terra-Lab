import json
import uuid
from pathlib import Path

import pytest
from terralab import experiments
from terralab.main import app
from fastapi.testclient import TestClient


def snapshot(project_id, identity=None):
    return dict(id=identity or str(uuid.uuid4()), status='completed', createdAt='2026-10-21T00:00:00Z',
                completed=3, planned=3, request={'project': {'id': project_id, 'name': 'Private prose is not returned'}},
                records=[], frames={}, error=None)


def test_ai_history_is_project_scoped_and_metadata_only(monkeypatch, tmp_path):
    monkeypatch.setattr(experiments, 'DATA', tmp_path)
    first, other = str(uuid.uuid4()), str(uuid.uuid4())
    a, b = snapshot(first), snapshot(other)
    monkeypatch.setattr(experiments, 'JOBS', {a['id']: {'result': a}, b['id']: {'result': b}})
    rows = experiments.list_jobs(first)
    assert len(rows) == 1 and rows[0]['id'] == a['id']
    assert set(rows[0]) == {'id', 'projectId', 'status', 'createdAt', 'completed', 'planned'}
    assert 'Private prose' not in json.dumps(rows)


def test_ai_history_reads_real_persisted_snapshots_and_ignores_bad_files(monkeypatch, tmp_path):
    monkeypatch.setattr(experiments, 'DATA', tmp_path)
    monkeypatch.setattr(experiments, 'JOBS', {})
    project_id = str(uuid.uuid4())
    run = snapshot(project_id)
    (tmp_path / (run['id'] + '.json')).write_text(json.dumps(run), encoding='utf-8')
    (tmp_path / 'corrupt.json').write_text('not-json', encoding='utf-8')
    assert experiments.list_jobs(project_id)[0]['id'] == run['id']
    with pytest.raises(ValueError):
        experiments.list_jobs('../arbitrary-path')


def test_ai_history_http_requires_a_valid_project_id(monkeypatch, tmp_path):
    monkeypatch.setenv('TERRALAB_JOB_MODE', 'local')
    monkeypatch.setattr(experiments, 'DATA', tmp_path)
    monkeypatch.setattr(experiments, 'JOBS', {})
    client = TestClient(app)
    assert client.get('/experiments', params={'project_id': '../secret'}).status_code == 422
    assert client.get('/experiments', params={'project_id': str(uuid.uuid4())}).json() == []


def test_ai_history_limits_retained_metadata(monkeypatch, tmp_path):
    monkeypatch.setattr(experiments, 'DATA', tmp_path)
    project_id = str(uuid.uuid4())
    runs = [snapshot(project_id) for _ in range(70)]
    monkeypatch.setattr(experiments, 'JOBS', {r['id']: {'result': r} for r in runs})
    assert len(experiments.list_jobs(project_id)) == 50
