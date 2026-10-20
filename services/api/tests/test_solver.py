import math
import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError
from terralab.main import app
from terralab.models import MeasurementSet
from terralab.engine import solve_ranges, GeometryError

client = TestClient(app)
SQUARE = [(0,0),(100,0),(100,80),(0,80)]

def payload(anchors=SQUARE, position=(37,28)):
    return dict(type="calibrated_range", units="m", time=0, measurements=[dict(anchorId=str(i),anchor=dict(x=x,y=y),range=math.dist((x,y),position),truth=math.dist((x,y),position),blocked=False,sigma=0) for i,(x,y) in enumerate(anchors)])

@pytest.mark.parametrize("position", [(37,28),(0,0),(100,80),(-10,145),(50,40)])
def test_noiseless_recovery(position):
    result = solve_ranges(MeasurementSet(**payload(position=position)))
    assert math.dist((result.position.x,result.position.y),position) < 1e-10
    assert result.rms < 1e-10 and result.rank == 2

def test_redundant_observations():
    result = solve_ranges(MeasurementSet(**payload(SQUARE+[(50,-20),(50,110)])))
    assert result.rms < 1e-10
    assert len(result.residuals) == 6

def test_large_origin():
    origin = (900000,-900000)
    anchors = [(x+origin[0],y+origin[1]) for x,y in SQUARE]
    pos = (origin[0]+37,origin[1]+28)
    result = solve_ranges(MeasurementSet(**payload(anchors,pos)))
    assert math.dist((result.position.x,result.position.y),pos) < 1e-8

@pytest.mark.parametrize("anchors", [[(0,0),(30,0),(60,0)],[(0,0)]*4,[(0,0),(100,0),(200,1e-7)]])
def test_degeneracy(anchors):
    with pytest.raises(GeometryError):
        solve_ranges(MeasurementSet(**payload(anchors)))

@pytest.mark.parametrize("value", [-1, float('nan'), float('inf')])
def test_invalid_range(value):
    data = payload(); data['measurements'][0]['range'] = value
    with pytest.raises(ValidationError):
        MeasurementSet(**data)

def test_minimum():
    with pytest.raises(ValidationError):
        MeasurementSet(**payload(SQUARE[:2]))
    assert solve_ranges(MeasurementSet(**payload(SQUARE[:3]))).rms < 1e-10

def test_clock_bias_model_is_not_accepted():
    data = payload(); data['type'] = 'pseudorange'
    assert client.post('/solve',json=data).status_code == 422

def test_duplicate_ids():
    data = payload(); data['measurements'][1]['anchorId'] = '0'
    assert client.post('/solve',json=data).status_code == 422

def test_noisy_residuals():
    data = payload(); data['measurements'][0]['range'] += .4
    result = solve_ranges(MeasurementSet(**data))
    assert result.rms > 0
    for residual, measurement in zip(result.residuals,data['measurements']):
        assert residual == pytest.approx(math.dist((result.position.x,result.position.y),(measurement['anchor']['x'],measurement['anchor']['y']))-measurement['range'])

def test_api_contract():
    assert client.get('/health').json()['status'] == 'ok'
    response = client.post('/solve',json=payload())
    assert response.status_code == 200
    assert response.json()['position']['x'] == pytest.approx(37)
    assert client.post('/solve',json=payload([(0,0),(30,0),(60,0)])).status_code == 422

def test_api_rejects_wrong_units():
    data = payload(); data['units'] = 'ns'
    assert client.post('/solve',json=data).status_code == 422

def test_estimate_can_be_outside_anchor_editing_bounds():
    anchors = [(999900,0),(1000000,0),(1000000,100),(999900,100)]
    position = (1000010,50)
    result = solve_ranges(MeasurementSet(**payload(anchors,position)))
    assert result.position.x == pytest.approx(position[0])
