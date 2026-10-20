"""Actual bounded CSI example and vector PDF from the committed clean Phase 2 run."""
import argparse,json,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'services/api'))
from terralab.signals import SignalRequest,run_signal
from terralab.reports import Report,pdf
p=argparse.ArgumentParser();p.add_argument('--out',default='.terralab/phase3-example');a=p.parse_args();out=Path(a.out);out.mkdir(parents=True,exist_ok=True)
signal=SignalRequest(paths=[dict(delayNs=100,real=1,imag=0),dict(delayNs=180,real=.5,imag=.2)],snrDb=40,seed=123,maxDelayNs=500,gridPoints=1001)
result=run_signal(signal);(out/'csi-example.result.json').write_text(json.dumps(result,indent=2,allow_nan=False),encoding='utf-8')
r=json.loads(Path('docs/examples/timing-clean.result.json').read_text(encoding='utf-8'))
records=[{k:row[k] for k in ['estimator','time','truth','position','errorM','sweepValue','locationId','trial']} for row in r['records'][::20]]
report=Report(id=r['id'],createdAt=r['createdAt'],softwareVersion=r['softwareVersion'],status=r['status'],request=r['request'],completed=r['completed'],planned=r['planned'],summaries=r['summaries'],records=records,options=dict(title='Clean timing benchmark: sampled error distribution',xLabel='Position error (m)',yLabel='Cumulative probability',legend=True,width=1200,height=750),samplingNote='Every 20th stored estimator epoch is displayed; summaries use all 3,600 recorded epochs.')
(out/'scientific-report.pdf').write_bytes(pdf(report))
print(json.dumps(dict(directory=str(out),csiVersion=result['moduleVersion'],delaysNs={k:v['delaysNs'] for k,v in result['estimators'].items()},runtimeMs=result['elapsedMs'],pdfBytes=(out/'scientific-report.pdf').stat().st_size)))
