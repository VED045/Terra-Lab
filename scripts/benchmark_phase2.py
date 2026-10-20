"""Reproduce the Phase 2 timing benchmark. Outputs contain observations, failures and timings."""
import argparse
from pathlib import Path
import sys
import json
import uuid
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'services/api'))
from terralab.lab_models import Request, LabConfig
from terralab.experiments import execute

def benchmark(trials=100,clean=False):
    objects=[]
    for i,(x,y) in enumerate([(0,0),(60,-10),(120,0),(120,85),(60,100),(0,85)]):
        objects.append(dict(id=f'tx-{i+1}',name=f'TX-{i+1}',kind='anchor',x=x,y=y,enabled=True,power=20,frequency=3960,bandwidth=160,timingOffset=0,timingUncertainty=i*.2,clockDrift=0,hardwareDelay=0,noise=0))
    for i,(x,y) in enumerate([(45,38),(25,25),(90,60)]):
        objects.append(dict(id=f'rx-{i+1}',name=f'Location {i+1}',kind='receiver',x=x,y=y,enabled=True,altitude=0,deviceType='rover',clockOffset=0,clockDrift=0,mobility='stationary',speed=2,heading=0,updateInterval=.1,radius=15,trajectoryId=None))
    config=LabConfig(trials=trials,seed=20261020,sweep='timingNs',sweepValues=[.1,1,3,10],estimators=['ls','wls','huber'],nlosProbability=.1,nlosBiasM=5,nlosLossDb=0,outlierProbability=.02,outlierScale=20)
    if clean: config.nlosProbability=0;config.outlierProbability=0
    project=dict(schemaVersion=1,id='00000000-0000-4000-8000-000000000202',name='Phase 2 timing benchmark',description='Synthetic uncertainty and contamination. No claim about hardware.',updatedAt='2026-10-20T00:00:00.000Z',archived=False,objects=objects,settings=dict(duration=60,step=.1,seed=42,excludeBlocked=False,engine='browser',measurement='calibrated_range',speedMultiplier=1),canvas=dict(grid=True,labels=True,snap=True,links=True,obstacles=True,trajectories=True,estimates=True,zoom=4.5,pan=dict(x=-270,y=190),theme='dark'),laboratory=config.model_dump())
    return Request(project=project,config=config)

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--trials',type=int,default=100);parser.add_argument('--out',default='docs/examples/timing-benchmark');parser.add_argument('--clean',action='store_true');parser.add_argument('--quiet',action='store_true')
    args=parser.parse_args();request=benchmark(args.trials,args.clean)
    output=Path(args.out);output.parent.mkdir(parents=True,exist_ok=True)
    output.with_suffix('.request.json').write_text(request.model_dump_json(indent=2),encoding='utf-8')
    result=execute(request);result['id']=str(uuid.uuid5(uuid.NAMESPACE_URL,f'terralab-phase2-timing-20261020-{args.trials}-{args.clean}'))
    output.with_suffix('.result.json').write_text(json.dumps(result,allow_nan=False,separators=(',',':')),encoding='utf-8')
    output.with_suffix('.summary.json').write_text(json.dumps({key:result[key] for key in ['id','softwareVersion','environment','createdAt','status','planned','completed','unattempted','elapsedSeconds','summaries']},indent=2,allow_nan=False),encoding='utf-8')
    print(json.dumps({key:result[key] for key in (['status','planned','completed','elapsedSeconds'] if args.quiet else ['status','planned','completed','elapsedSeconds','summaries'])},indent=2,allow_nan=False))
