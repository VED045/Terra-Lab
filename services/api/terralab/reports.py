"""Bounded vector PDF reporting from supplied recorded experiment data, never reruns a solver."""
from io import BytesIO
from html import escape
from typing import Annotated
from pydantic import BaseModel, ConfigDict, Field
from .lab_models import Request, Number

class Options(BaseModel):
    model_config=ConfigDict(extra='forbid')
    title:str=Field(max_length=150)
    xLabel:str=Field(max_length=100)
    yLabel:str=Field(max_length=100)
    legend:bool=True
    width:int=Field(ge=600,le=2400)
    height:int=Field(ge=450,le=1600)
class Record(BaseModel):
    model_config=ConfigDict(extra='forbid')
    estimator:str=Field(max_length=20)
    time:Number
    truth:tuple[Number,Number]
    position:tuple[Number,Number]|None
    errorM:Annotated[Number,Field(ge=0)]|None
    sweepValue:Number
    locationId:str=Field(max_length=100)
    trial:int=Field(ge=0,le=100000)
class Summary(BaseModel):
    model_config=ConfigDict(extra='ignore')
    estimator:str=Field(max_length=20)
    sweepValue:Number
    attempted:int=Field(ge=0)
    failures:int=Field(ge=0)
    availability:Number|None
    rmseM:Number|None
    medianErrorM:Number|None
    p95ErrorM:Number|None
    maxErrorM:Number|None
    medianRuntimeMs:Number|None
    p95RuntimeMs:Number|None
class Report(BaseModel):
    model_config=ConfigDict(extra='ignore')
    id:str=Field(max_length=100)
    createdAt:str=Field(max_length=80)
    softwareVersion:str=Field(max_length=40)
    status:str=Field(max_length=20)
    request:Request
    completed:int=Field(ge=0,le=100000)
    planned:int=Field(ge=0,le=100000)
    summaries:list[Summary]=Field(max_length=200)
    records:list[Record]=Field(max_length=2000)
    options:Options
    samplingNote:str=Field(max_length=500)

def pdf(report:Report):
    from reportlab.platypus import SimpleDocTemplate,Paragraph,Spacer,Table,TableStyle,PageBreak,KeepTogether
    from reportlab.lib.styles import getSampleStyleSheet
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.graphics.shapes import Drawing,Line,Circle,String,PolyLine,Rect
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont
    import reportlab
    from pathlib import Path
    import json
    fontdir=Path(reportlab.__file__).parent/'fonts'
    pdfmetrics.registerFont(TTFont('TerraSans',str(fontdir/'Vera.ttf')))
    pdfmetrics.registerFont(TTFont('TerraSans-Bold',str(fontdir/'VeraBd.ttf')))
    styles=getSampleStyleSheet()
    for style in styles.byName.values():
        if style.name!='Code':style.fontName='TerraSans-Bold' if style.name in ('Title','Heading1','Heading2','Heading3') else 'TerraSans'
    output=BytesIO();story=[]
    width=A4[0]-72
    def para(text,style='BodyText'):return Paragraph(escape(str(text)),styles[style])
    def add(text,style='BodyText'):
        story.append(para(text,style))
        if not style.startswith('Heading'):story.append(Spacer(1,8))
    def label(*args,**kwargs):return String(*args,fontName='TerraSans',**kwargs)
    def table(rows,widths=None):
        t=Table([[para(v) for v in row] for row in rows],colWidths=widths,repeatRows=1,hAlign='LEFT');t.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),colors.HexColor('#edf2f7')),('GRID',(0,0),(-1,-1),.3,colors.HexColor('#bcc5d0')),('VALIGN',(0,0),(-1,-1),'TOP'),('LEFTPADDING',(0,0),(-1,-1),5),('RIGHTPADDING',(0,0),(-1,-1),5),('TOPPADDING',(0,0),(-1,-1),5),('BOTTOMPADDING',(0,0),(-1,-1),5)]));story.append(t);story.append(Spacer(1,12))
    def fmt(v):return 'unavailable' if v is None else f'{v:.5g}'
    add(report.request.project.get('name','Experiment'),'Title')
    add('TerraLab scientific research report','Heading2')
    add(f'Experiment {report.id} | {report.createdAt} | software {report.softwareVersion} | {report.status}')
    add(f'Measurement {report.request.config.measurement} | seed {report.request.config.seed} | {report.completed}/{report.planned} recorded estimator epochs')
    add('Research methodology','Heading2')
    add('Synthetic horizontal positioning with paired observation frames. Every estimator receives the same generated observations for each trial/location/epoch. Accuracy statistics are conditional on successful numerical fixes; failures are counted and retained, never replaced by zero error. Runtime includes estimator initialization and diagnostics, excluding observation generation, rendering and storage. See PHASE_2_METHODS.md for equations and assumptions.')
    add('Actual full-run summary metrics','Heading2')
    table([['Estimator / sweep','Attempts / failures','RMSE / median (m)','P95 / max (m)','Median / P95 (ms)']]+[[f'{s.estimator} / {s.sweepValue:g}',f'{s.attempted} / {s.failures}',f'{fmt(s.rmseM)} / {fmt(s.medianErrorM)}',f'{fmt(s.p95ErrorM)} / {fmt(s.maxErrorM)}',f'{fmt(s.medianRuntimeMs)} / {fmt(s.p95RuntimeMs)}'] for s in report.summaries],[width*.2]*5)
    story.append(PageBreak());add('Anchor layout and sampled receiver trajectories','Heading2')
    anchors=[o for o in report.request.project['objects'] if o['kind']=='anchor' and o.get('enabled',True)]
    points=[(a['x'],a['y']) for a in anchors]+[r.truth for r in report.records]+[r.position for r in report.records if r.position]
    if points:
        import numpy as np
        coords=np.array(points);lo=coords.min(axis=0);hi=coords.max(axis=0);span=np.maximum(hi-lo,1);scale=min((width-85)/span[0],220/span[1])
        def xy(p):return (55+(p[0]-lo[0])*scale,45+(p[1]-lo[1])*scale)
        drawing=Drawing(width,310);drawing.add(Rect(45,35,width-65,250,fillColor=None,strokeColor=colors.lightgrey))
        drawing.add(label(width/2,12,'Horizontal X (m)',textAnchor='middle',fontSize=10));drawing.add(label(0,295,'Horizontal Y (m)',fontSize=10))
        for a in anchors:
            x,y=xy((a['x'],a['y']));drawing.add(Circle(x,y,3,fillColor=colors.HexColor('#164e63')));drawing.add(label(x+5,y+5,str(a.get('name',a['id']))[:22],fontSize=7))
        groups={}
        for r in report.records:groups.setdefault((r.estimator,r.sweepValue,r.trial,r.locationId),[]).append(r)
        palette=['#a21caf','#166534','#b45309','#1d4ed8','#be123c']
        for i,(key,rows) in enumerate(list(groups.items())[:12]):
            rows=sorted(rows,key=lambda r:r.time)
            for name,color in [('truth','#111827'),('position',palette[i%len(palette)])]:
                segment=[]
                for r in rows:
                    p=getattr(r,name)
                    if p is None:
                        if len(segment)>=4:drawing.add(PolyLine(segment,strokeColor=colors.HexColor(color),strokeWidth=.7));segment=[]
                    else:segment.extend(xy(p))
                if len(segment)>=4:drawing.add(PolyLine(segment,strokeColor=colors.HexColor(color),strokeWidth=.7))
                elif len(segment)==2:drawing.add(Circle(*segment,1.7,fillColor=colors.HexColor(color)))
        for i in range(5):
            drawing.add(label(55+i*(width-85)/4,28,f'{lo[0]+i*(width-85)/scale/4:.3g}',fontSize=7,textAnchor='middle'))
            drawing.add(label(39,45+i*55,f'{lo[1]+i*55/scale:.3g}',fontSize=7,textAnchor='end'))
        story.append(drawing)
        add('Anchor markers use the exact saved network. Truth is black; estimates use coloured traces, grouped by estimator/sweep/trial/location. At most the first 12 sampled groups are drawn; disconnected failures are not joined. '+report.samplingNote)
    story.append(PageBreak());add(report.options.title,'Heading2')
    drawing=Drawing(width,330);left=50;bottom=45;w=width-75;h=230
    groups={}
    for r in report.records:
        if r.errorM is not None:groups.setdefault(r.estimator,[]).append(r.errorM)
    largest=max([max(v) for v in groups.values()] or [1]);largest=max(largest,1e-9)
    for i in range(6):
        x=left+w*i/5;y=bottom+h*i/5;drawing.add(Line(x,bottom,x,bottom+h,strokeColor=colors.lightgrey,strokeWidth=.4));drawing.add(Line(left,y,left+w,y,strokeColor=colors.lightgrey,strokeWidth=.4));drawing.add(label(x,bottom-14,f'{largest*i/5:.3g}',textAnchor='middle',fontSize=8));drawing.add(label(left-8,y-3,f'{i/5:.1f}',textAnchor='end',fontSize=8))
    palette=['#164e63','#a21caf','#166534','#b45309','#1d4ed8','#be123c','#6d28d9','#3f6212','#0f766e','#9a3412']
    for i,(estimator,errors) in enumerate(groups.items()):
        errors.sort();points=[left,bottom]
        for j,error in enumerate(errors):points.extend([left+error/largest*w,bottom+(j+1)/len(errors)*h])
        drawing.add(PolyLine(points,strokeColor=colors.HexColor(palette[i%len(palette)]),strokeWidth=1.3))
        if report.options.legend:drawing.add(label(left+(i%5)*90,310-(i//5)*14,estimator,fontSize=8,fillColor=colors.HexColor(palette[i%len(palette)])))
    x_text=report.options.xLabel;y_text=report.options.yLabel
    x_size=min(10,(width-40)/max(pdfmetrics.stringWidth(x_text,'TerraSans',1),1));y_size=min(10,(width-75)/max(pdfmetrics.stringWidth(y_text,'TerraSans',1),1))
    drawing.add(label(width/2,12,x_text,textAnchor='middle',fontSize=x_size));drawing.add(label(left,287,y_text,fontSize=y_size));story.append(drawing)
    add('Sampled empirical CDF, pooled over sweep values, trials and locations within each estimator. Full-data vector SVG is exported separately. '+report.samplingNote)
    add('Scientific assumptions and known limitations','Heading2')
    add('Calibrated TOA, unknown-clock pseudorange, reference TDOA with differenced covariance, calibrated RTT, wrapped AOA, empirical RSS or an explicitly selected hybrid. No ray tracing or hardware validation. NLOS, calibration biases, survey/shadowing correlation and heavy-tailed noise can violate the nominal likelihood. Robustness and weighting do not always improve accuracy. Linear LS vs nonlinear WLS changes both linearization and weighting. EKF/UKF assume constant velocity. Local covariance ellipses are approximations. Cancelled/interrupted runs are partial. Strong numerical fixes can still have large errors. Advanced CSI algorithms are experimental and do not reproduce full Kazaz MBWDE.')
    add('Parameter values and units','Heading2')
    # Units are inferred only from explicit field suffixes; the full metadata catalog lives in the manifest/UI.
    unit_map={'timingNs':'ns','noiseM':'m','bearingSigmaDeg':'deg','shadowingDb':'dB','referenceLossDb':'dB','rssNoiseDb':'dB','detectionDbm':'dBm','minSnrDb':'dB','noiseFigureDb':'dB','nlosLossDb':'dB','commonTimingNs':'ns','referenceFrequencyMHz':'MHz','sampleStep':'s','duration':'s','nlosBiasM':'m','processNoise':'m/s^2','clockProcessNoise':'m/s^2 (range clock)','anchorSigmaM':'m','turnaroundNs':'ns','turnaroundCalibrationNs':'ns','equipmentCalibrationNs':'ns'}
    unit_map.update(measurement='model tag',estimators='estimator tags',hybrid='model tags',referenceId='anchor ID',trials='trials',seed='integer seed',sweep='parameter tag',missingIds='anchor IDs',gridSize='interior points/axis',maxIterations='iterations',ransacIterations='iterations',outlierScale='nominal sigma multiplier',robustScale='normalized sigma',rejectionSigma='normalized sigma',covarianceScale='variance multiplier',excludeBlocked='boolean')
    unit_map['sweepValues']={'timingNs':'ns','nlosProbability':'probability','speed':'m/s','anchorCount':'anchors','none':'unused'}[report.request.config.sweep]
    table([['Configuration field','Recorded value','Unit']]+[[key,json.dumps(value,ensure_ascii=True)[:500],unit_map.get(key,'dimensionless')] for key,value in report.request.config.model_dump().items()],[width*.34,width*.4,width*.26])
    add('Exact structured network and experiment configuration','Heading2')
    # Paragraph wrapping avoids clipped long JSON lines; XML escaping prevents report injection.
    text=json.dumps(report.request.model_dump(),ensure_ascii=True)
    story.append(Paragraph(escape(text),styles['Code']))
    def footer(canvas,doc):
        canvas.drawImage(str(Path(__file__).parent/'assets'/'network-tower.png'),36,17,width=18,height=18,mask='auto')
        canvas.setFont('Helvetica',8)
        canvas.drawString(60,22,'TerraLab | simulated research data | configuration-linked report')
        canvas.drawRightString(A4[0]-36,22,str(doc.page))
    SimpleDocTemplate(output,pagesize=A4,rightMargin=36,leftMargin=36,topMargin=36,bottomMargin=36,title=report.request.project.get('name','TerraLab experiment'),author='TerraLab').build(story,onFirstPage=footer,onLaterPages=footer)
    return output.getvalue()
