"""Isolated integration-test service: real science, with one explicit worker-failure injection."""
import os
import sys
from pathlib import Path

if os.environ.get('TERRALAB_AI_TEST_FIXTURE') != '1' or os.environ.get('TERRALAB_JOB_MODE') != 'local' or os.environ.get('TERRALAB_ENV') != 'development':
    raise RuntimeError('This test fixture is development/local-only and requires explicit opt-in')
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'services' / 'api'))
from terralab import experiments
from terralab.main import app
import uvicorn

real_execute = experiments.execute

def execute_with_test_fault(request, *args, **kwargs):
    if request.project.get('name') == 'AI fault injection fixture':
        raise RuntimeError('Injected worker exception for failure-workflow verification; no successful result was produced')
    return real_execute(request, *args, **kwargs)

experiments.execute = execute_with_test_fault
if __name__ == '__main__':
    uvicorn.run(app, host='127.0.0.1', port=18042)
