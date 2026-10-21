import subprocess
from unittest.mock import Mock, patch
import pytest
from terralab import runtime, cloud

def test_api_environment_never_receives_either_worker_key():
    env = dict(PORT='10000', TERRALAB_RUN_WORKER='1', TERRALAB_JOB_MODE='supabase', SUPABASE_URL='https://fixture.invalid', SUPABASE_SECRET_KEY='sb_secret_fixture', SUPABASE_SERVICE_ROLE_KEY='legacy-fixture', SUPABASE_PUBLISHABLE_KEY='public-fixture')
    api, worker = runtime.commands(env)
    assert api[1]['SUPABASE_PUBLISHABLE_KEY'] == 'public-fixture'
    assert not any(k in api[1] for k in runtime.SERVICE_KEYS)
    assert worker[1]['SUPABASE_SECRET_KEY'] == 'sb_secret_fixture'
    assert api[1]['TERRALAB_WORKER_WAKE_TOKEN'] == worker[1]['TERRALAB_WORKER_WAKE_TOKEN']
    assert len(api[1]['TERRALAB_WORKER_WAKE_TOKEN']) >= 32
    assert api[1]['TERRALAB_WORKER_WAKE_PORT'] == worker[1]['TERRALAB_WORKER_WAKE_PORT']
    assert '10000' in api[0] and api[0][api[0].index('--workers')+1] == '1'
    assert len(runtime.commands({})) == 1

@pytest.mark.parametrize('env', [dict(TERRALAB_RUN_WORKER='1'), dict(PORT='0'), dict(PORT='70000')])
def test_invalid_runtime_config_fails_before_starting_children(env):
    with pytest.raises(ValueError): runtime.commands(env)

def test_unexpected_child_exit_stops_sibling(monkeypatch):
    children = [Mock(), Mock()]
    children[0].poll.return_value = 0
    children[1].poll.return_value = None
    monkeypatch.setattr(runtime, 'commands', lambda _: [(['api'], {}), (['worker'], {})])
    with patch.object(runtime.subprocess, 'Popen', side_effect=children):
        assert runtime.main([]) == 1
    children[1].terminate.assert_called_once()
    children[1].wait.assert_called_once()

def test_shutdown_kills_a_child_that_exceeds_grace():
    child = Mock()
    child.poll.return_value = None
    child.wait.side_effect = [subprocess.TimeoutExpired('worker', 0), 0]
    runtime.shutdown([child], grace=0)
    child.terminate.assert_called_once()
    child.kill.assert_called_once()

@pytest.mark.parametrize('modern', [True, False])
def test_service_credentials_use_correct_supabase_protocol(monkeypatch, modern):
    monkeypatch.setenv('SUPABASE_URL', 'https://fixture.invalid')
    monkeypatch.setenv('SUPABASE_SECRET_KEY', 'sb_secret_fixture' if modern else '')
    monkeypatch.setenv('SUPABASE_SERVICE_ROLE_KEY', 'legacy-fixture')
    monkeypatch.setenv('SUPABASE_PUBLISHABLE_KEY', 'public-fixture')
    with patch.object(cloud, 'urlopen') as transport:
        transport.return_value.__enter__.return_value.read.return_value = b'{}'
        cloud.call('/rest/v1/rpc/claim_research_job', None, service=True)
        request = transport.call_args.args[0]
        assert request.get_header('Apikey') == ('sb_secret_fixture' if modern else 'legacy-fixture')
        assert request.get_header('Authorization') == (None if modern else 'Bearer legacy-fixture')
        cloud.call('/rest/v1/projects', 'Bearer caller-fixture')
        request = transport.call_args.args[0]
        assert request.get_header('Apikey') == 'public-fixture'
        assert request.get_header('Authorization') == 'Bearer caller-fixture'
