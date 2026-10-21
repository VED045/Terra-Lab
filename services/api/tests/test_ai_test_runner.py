"""Actual disposable child-process outcomes, separate from inference fixtures."""
import importlib.util
import json
from pathlib import Path
import shutil
import sys
import subprocess
import threading
import time
import uuid
import pytest

RUNNER=Path(__file__).resolve().parents[3]/'scripts'/'ai-test-runner.py'
spec=importlib.util.spec_from_file_location('ai_test_runner',RUNNER)
runner=importlib.util.module_from_spec(spec);spec.loader.exec_module(runner)

def test_counts_unknown_is_not_pass():
    assert runner.parse_counts('no summary')==dict(passed=None,failed=None,skipped=None,notRun=None)
    assert runner.parse_counts('Tests  6 passed | 2 failed | 1 skipped (9)')['failed']==2
    assert runner.parse_counts('212 passed, 1 warning in 4.84s')['passed']==212

def test_process_liveness_check_does_not_signal_or_terminate_child():
    process=subprocess.Popen([sys.executable,'-c','import time;time.sleep(3)'])
    try:
        assert runner.alive(process.pid)
        time.sleep(.1)
        assert process.poll() is None
    finally: process.terminate();process.wait(timeout=5)

def test_environment_excludes_credentials(tmp_path,monkeypatch):
    monkeypatch.setenv('SUPABASE_SECRET_KEY','never-include-secret')
    monkeypatch.setenv('DEEPSEEK_API_KEY','never-include-provider')
    monkeypatch.setenv('NODE_OPTIONS','malicious preload')
    env=runner.clean_environment(tmp_path,'none')
    assert 'SUPABASE_SECRET_KEY' not in env and 'DEEPSEEK_API_KEY' not in env
    assert 'malicious' not in env['NODE_OPTIONS']
    assert env['TERRALAB_AI_TESTING_ENABLED']=='0'

@pytest.mark.parametrize('case,program,timeout,expected,code',[
    ('pass','print("3 passed");',5,'completed',0),
    ('fail','print("1 failed");raise SystemExit(7)',5,'failed',7),
    ('timeout','import time;time.sleep(3)',.2,'timed_out',None),
    ('cancel','import time;time.sleep(3)',5,'cancelled',None),
    ('output','print("x"*100000)',5,'output_limit',None),
])
def test_real_child_results(tmp_path,monkeypatch,case,program,timeout,expected,code):
    monkeypatch.setattr(runner,'DATA',tmp_path/'jobs')
    # Only the test harness injects a tiny fixed fixture command. It is NOT a production command ID.
    monkeypatch.setitem(runner.CATALOG,'fixture',('python',['-c',program],timeout,'none'))
    identity=str(uuid.uuid4());project=str(uuid.uuid4());directory=runner.job_path(identity)
    (directory/'workspace'/'scripts'/'ai-python-guard').mkdir(parents=True)
    shutil.copy(RUNNER.parent/'ai-python-guard'/'sitecustomize.py',directory/'workspace'/'scripts'/'ai-python-guard'/'sitecustomize.py')
    runner.save(directory,dict(id=identity,projectId=project,commandId='fixture',state='queued',pid=None,exitCode=None,counts=None,real=True))
    if case=='cancel': threading.Thread(target=lambda:(time.sleep(.25),(directory/'cancel').touch()),daemon=True).start()
    runner.worker(identity)
    result=runner.read(directory)
    assert result['state']==expected,result
    assert result['real'] is True
    assert result['endedAt']
    if code is not None: assert result['exitCode']==code
    if case=='fail': assert result['counts']['failed']==1
    if case=='output': assert len(result['output'])<=64000
    with pytest.raises(ValueError): runner.status(identity,str(uuid.uuid4()))

def test_runner_rejects_arbitrary_command_and_non_uuid():
    with pytest.raises(ValueError): runner.start('shell',str(uuid.uuid4()),'a'*64,str(uuid.uuid4()))
    with pytest.raises(ValueError): runner.job_path('../../elsewhere')
