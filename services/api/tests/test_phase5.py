from copy import deepcopy
import pytest
from terralab.lab_models import Request,LabConfig
from terralab.experiments import execute
from test_laboratory import network,config

def obstacle(**extra):
    return dict(id='building',kind='obstacle',x=1000,y=1000,width=10,height=5,shape='rectangle',**extra)

def test_legacy_obstacles_keep_absent_vertical_fields():
    p=network();p['objects'].append(obstacle());request=Request(project=p,config=config())
    assert 'verticalHeight' not in request.project['objects'][-1]
    assert 'baseElevation' not in request.project['objects'][-1]
    assert request.project['objects'][-2]['trajectoryId'] is None

@pytest.mark.parametrize('field,value',[('verticalHeight',0),('verticalHeight',-1),('verticalHeight',10001),('verticalHeight',float('inf')),('verticalHeight',None),('baseElevation',1e7),('baseElevation',None)])
def test_invalid_physical_dimensions_rejected(field,value):
    p=network();p['schemaVersion']=2;p['objects'].append(obstacle(**{field:value}))
    with pytest.raises(ValueError):Request(project=p,config=config())

def test_dimensions_require_version_two():
    p=network();p['objects'].append(obstacle(verticalHeight=30))
    with pytest.raises(ValueError):Request(project=p,config=config())

def test_new_dimensions_preserved_without_changing_horizontal_science():
    p=network();p['objects'].append(obstacle());a=execute(Request(project=deepcopy(p),config=config()))
    p['schemaVersion']=2;p['objects'][-1].update(verticalHeight=30,baseElevation=6)
    request=Request(project=p,config=config());b=execute(request)
    assert request.project['objects'][-1]['height']==5
    assert request.project['objects'][-1]['verticalHeight']==30
    for x,y in zip(a['records'],b['records']):
        assert x['position']==y['position'] and x['observationHash']==y['observationHash']

def test_laboratory_120_seconds_stays_within_existing_budgets():
    p=network();c=config(duration=120,sampleStep=10);result=execute(Request(project=p,config=c))
    assert result['planned']==13 and result['completed']==13
    assert result['records'][0]['time']==0 and result['records'][-1]['time']==120
    with pytest.raises(ValueError):Request(project=p,config=LabConfig(duration=300,sampleStep=.1,trials=1000))
