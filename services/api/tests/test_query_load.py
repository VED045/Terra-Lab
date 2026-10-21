from unittest.mock import Mock
import pytest
from terralab import worker, cloud

def test_idle_worker_waits_without_a_timer_or_another_database_request(monkeypatch):
    stop=Mock(); stop.is_set.side_effect=[False,False,False,False,False,True]
    wake=Mock()
    rpc=Mock(side_effect=[None,None])
    monkeypatch.setattr(worker,'STOP',stop)
    monkeypatch.setattr(worker,'WAKE',wake)
    monkeypatch.setattr(worker,'service_rpc',rpc)
    worker.run_queue()
    assert rpc.call_count == 2
    assert [c.args[0] for c in wake.wait.call_args_list] == [None,None]
    assert [c.args[0] for c in rpc.call_args_list] == ['claim_research_job','research_queue_wake_delay']

def test_worker_schedules_only_known_pending_lease_recovery(monkeypatch):
    stop=Mock(); stop.is_set.side_effect=[False,False,False,False,False,True]
    wake=Mock()
    monkeypatch.setattr(worker,'STOP',stop)
    monkeypatch.setattr(worker,'WAKE',wake)
    monkeypatch.setattr(worker,'service_rpc',Mock(side_effect=[None,45]))
    worker.run_queue()
    assert [c.args[0] for c in wake.wait.call_args_list] == [None,45]

def test_stop_interrupts_an_idle_event_wait(monkeypatch):
    stop,wake=Mock(),Mock()
    monkeypatch.setattr(worker,'STOP',stop)
    monkeypatch.setattr(worker,'WAKE',wake)
    worker.request_stop()
    stop.set.assert_called_once()
    wake.set.assert_called_once()

@pytest.mark.parametrize('status', ['queued','running'])
def test_active_status_poll_uses_one_query_and_keeps_the_immutable_request(monkeypatch,status):
    call=Mock(return_value=[dict(id='fixture',status=status,request={'project':{}},created_at='2026-10-21T00:00:00Z')])
    monkeypatch.setattr(cloud, 'call', call)
    result=cloud.read('fixture','Bearer fixture')
    assert result['status'] == status and result['request'] == {'project':{}}
    call.assert_called_once()

def test_terminal_status_still_reads_publication_and_keeps_missing_artifact_feedback(monkeypatch):
    call=Mock(side_effect=[[dict(id='fixture',status='failed',created_at='2026-10-21T00:00:00Z')],[]])
    monkeypatch.setattr(cloud, 'call', call)
    assert cloud.read('fixture','Bearer fixture',detail=True)['artifactUnavailable']
    assert call.call_count == 2

def test_database_failure_retries_are_bounded_and_then_wait_for_notification(monkeypatch):
    import threading
    stop=threading.Event()
    delays=[]
    def wait(delay):
        delays.append(delay)
        if len(delays)==7: stop.set()
        return False
    wake=Mock(); wake.wait.side_effect=wait
    monkeypatch.setattr(worker,'STOP',stop)
    monkeypatch.setattr(worker,'WAKE',wake)
    monkeypatch.setattr(worker,'service_rpc',Mock(side_effect=RuntimeError('unavailable')))
    worker.run_queue()
    assert delays == [None,5,10,20,40,60,None]
