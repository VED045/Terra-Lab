"""Execute a frozen synthetic study plan. No cloud requests, uploads or solver changes."""
import argparse
from copy import deepcopy
import hashlib
import json
from pathlib import Path
import numpy as np
import sys
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'services/api'))
from terralab.lab_models import Request, LabConfig
from terralab.experiments import execute

ROOT=Path(__file__).resolve().parents[1]

def build_request(plan, case, seed):
    project=json.loads((ROOT/'docs/examples/timing-clean.request.json').read_text())['project']
    first=next(o for o in project['objects'] if o['kind']=='receiver')
    project['objects']=[o for o in project['objects'] if o['kind']=='anchor']+[first]
    for index,anchor in enumerate(project['objects'][:-1]):
        anchor.update(noise=0,timingUncertainty=0,timingOffset=0,clockDrift=0,hardwareDelay=0)
        if case.get('geometry')=='near-collinear': anchor.update(x=index*24,y=(index%2)*0.001)
    if 'anchorOffsetNs' in case: project['objects'][0]['timingOffset']=case['anchorOffsetNs']
    first.update(case.get('receiver',{}))
    config=LabConfig(**{**plan['base'],**case['config'],'seed':seed})
    return Request(project=deepcopy(project),config=config)

def covariance_diagnostics(records):
    nees=[]
    for row in records:
        if row.get('position') is None or row.get('covariance') is None: continue
        covariance=np.asarray(row['covariance'],dtype=float)
        if covariance.shape!=(2,2) or not np.all(np.isfinite(covariance)) or np.min(np.linalg.eigvalsh(covariance))<=0: continue
        error=np.asarray(row['position'])-np.asarray(row['truth'])
        value=float(error@np.linalg.solve(covariance,error))
        if np.isfinite(value): nees.append(value)
    return dict(covarianceFixes=len(nees),meanNees=float(np.mean(nees)) if nees else None,ellipse95Coverage=float(np.mean(np.asarray(nees)<=5.991)) if nees else None)

def run(plan):
    rows=[]
    for case in plan['cases']:
        for seed in plan['seeds']:
            request=build_request(plan,case,seed)
            result=execute(request)
            assert result['status']=='completed'
            assert result['completed']==result['planned']==len(result['records'])
            assert all(row['observationHash']==result['frames'][row['frameId']]['observationHash'] for row in result['records'])
            for summary in result['summaries']:
                assert summary['fixes']+summary['failures']==summary['attempted']
                subset=[r for r in result['records'] if r['estimator']==summary['estimator'] and r['sweepValue']==summary['sweepValue']]
                rows.append(dict(case=case['id'],study=case['study'],seed=seed,metrics=summary,covariance=covariance_diagnostics(subset),observationHashesSha256=hashlib.sha256(json.dumps(sorted((key,value['observationHash']) for key,value in result['frames'].items())).encode()).hexdigest()))
    # Independent exact 3-4-5-distance-style planar fixture, distinct from study layouts.
    project=deepcopy(build_request(plan,plan['cases'][0],plan['seeds'][0]).project)
    project['objects']=[dict(id=f'a{i}',kind='anchor',x=x,y=y,enabled=True,noise=0) for i,(x,y) in enumerate([(0,0),(10,0),(0,10),(10,10)])]+[dict(id='rx-independent',kind='receiver',x=3,y=4,enabled=True,mobility='stationary')]
    exact=execute(Request(project=project,config=LabConfig(sweep='none',trials=1,timingNs=0,noiseM=0,estimators=['wls'])))
    assert exact['records'][0]['errorM']<plan['acceptance']['noiselessMaxErrorM']
    sample=build_request(plan,plan['cases'][0],plan['seeds'][0])
    first,second=execute(sample),execute(sample)
    assert [r['observationHash'] for r in first['records']]==[r['observationHash'] for r in second['records']]
    assert [r['position'] for r in first['records']]==[r['position'] for r in second['records']]
    return dict(format='terralab-study-results-1',plan=plan,modelVersion=exact['softwareVersion'],environment=exact.get('environment'),rows=rows,independentNoiselessErrorM=exact['records'][0]['errorM'],exactObservationRepeat=True,limitations='Synthetic horizontal model only. No hardware or vertical validation. No requirement or claim that a robust estimator always improves accuracy. Runtime and finite-sample coverage are descriptive.')

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--output',required=True);args=parser.parse_args()
    plan=json.loads((ROOT/'docs/research/phase5-study-plan.json').read_text())
    result=run(plan);output=Path(args.output);output.parent.mkdir(parents=True,exist_ok=True)
    output.write_text(json.dumps(result,indent=2,allow_nan=False),encoding='utf-8')
    print(f"Controlled studies: {len(plan['cases'])} cases, {len(plan['seeds'])} fixed seeds, {len(result['rows'])} estimator summaries; independent/repeat checks passed.")
