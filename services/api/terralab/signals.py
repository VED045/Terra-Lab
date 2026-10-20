"""Experimental synthetic CSI laboratory. This is NOT Kazaz MBWDE.

Matched-filter delay scan is the conventional baseline. MUSIC assumes independent
complex gains across snapshots; ESPRIT uses one uniformly spaced band with Hankel
smoothing. No weighted subspace fitting / data-extension MBWDE claim is made.
"""
from typing import Annotated, Literal
from pydantic import BaseModel, Field, ConfigDict, model_validator
import numpy as np
from scipy.signal import find_peaks
import time
from .lab_models import Number

class Path(BaseModel):
    model_config=ConfigDict(extra='forbid')
    delayNs: Number=Field(ge=0,le=5000)
    real: Number=Field(ge=-10,le=10)
    imag: Number=Field(ge=-10,le=10)
class SignalRequest(BaseModel):
    model_config=ConfigDict(extra='forbid')
    paths:list[Path]=Field(min_length=1,max_length=4)
    bandsMHz:list[Annotated[Number,Field(ge=100,le=10000)]]=Field(default_factory=lambda:[2400,2480],min_length=1,max_length=4)
    bandwidthMHz:Number=Field(default=20,ge=.01,le=160)
    spacingKHz:Number=Field(default=625,ge=10,le=10000)
    snapshots:int=Field(default=32,ge=1,le=64)
    snrDb:Number=Field(default=30,ge=-20,le=120)
    seed:int=Field(default=123,ge=0,le=2147483647)
    maxDelayNs:Number=Field(default=500,gt=0,le=5000)
    gridPoints:int=Field(default=1024,ge=128,le=2048)
    calibrationPhaseDeg:Number=Field(default=0,ge=0,le=180)
    calibrationGainDb:Number=Field(default=0,ge=0,le=12)
    calibrationDelayNs:Number=Field(default=0,ge=0,le=50)
    gainMode:Literal['independent','coherent']='independent'
    algorithms:list[Literal['matched','weighted','music','esprit']]=Field(default_factory=lambda:['matched','weighted','music'],min_length=1,max_length=4)
    bandNoiseDb:list[Annotated[Number,Field(ge=-20,le=20)]]=Field(default_factory=list,max_length=4)
    @model_validator(mode='after')
    def valid(self):
        tones=int(np.floor(self.bandwidthMHz*1000/self.spacingKHz))+1
        if tones<4 or tones*len(self.bandsMHz)>128: raise ValueError('Choose 4–128 total CSI tones; increase spacing or reduce bands/bandwidth')
        bands=sorted(self.bandsMHz)
        if any(b-a<=self.bandwidthMHz for a,b in zip(bands,bands[1:])): raise ValueError('Frequency bands must not overlap or touch')
        if max(p.delayNs for p in self.paths)>self.maxDelayNs: raise ValueError('All path delays must fit the scan window')
        if sum(p.real*p.real+p.imag*p.imag for p in self.paths)<1e-12: raise ValueError('At least one path must have nonzero amplitude')
        if len({p.delayNs for p in self.paths})!=len(self.paths): raise ValueError('Distinct path delays required')
        if self.bandNoiseDb and len(self.bandNoiseDb)!=len(self.bandsMHz): raise ValueError('One noise power offset is required per band')
        if self.maxDelayNs>=1e6/self.spacingKHz: raise ValueError('Scan must be below the per-band alias period 1/subcarrier spacing')
        return self

def peaks(score,grid,k):
    candidates=list(find_peaks(score)[0])
    # Endpoints are local candidates only if at least as large as their one neighbour.
    if score[0]>=score[1]: candidates.append(0)
    if score[-1]>=score[-2]: candidates.append(len(score)-1)
    chosen=sorted(candidates,key=lambda i:score[i],reverse=True)[:k]
    return sorted(float(grid[i]) for i in chosen)

def run_signal(c:SignalRequest):
    before=time.perf_counter();rng=np.random.default_rng(c.seed)
    tones=int(np.floor(c.bandwidthMHz*1000/c.spacingKHz))+1
    f=np.concatenate([center*1e6+(np.arange(tones)-(tones-1)/2)*c.spacingKHz*1000 for center in c.bandsMHz])
    # Reference-frequency shift is absorbed by the unknown complex path gains.
    f=f-f.min();tau=np.array([p.delayNs for p in c.paths])*1e-9
    gains=np.array([complex(p.real,p.imag) for p in c.paths])[:,None]
    if c.gainMode=='independent': gains=gains*np.exp(1j*rng.uniform(-np.pi,np.pi,(len(tau),c.snapshots)))
    else: gains=np.repeat(gains,c.snapshots,axis=1)
    a=np.exp(-2j*np.pi*f[:,None]*tau)
    clean=a@gains;power=float(np.sum(np.abs(gains[:,0])**2))
    variances=power*10**(-c.snrDb/10)*np.repeat(10**(np.array(c.bandNoiseDb or [0]*len(c.bandsMHz))/10),tones)
    calibration=np.repeat(10**(rng.normal(0,c.calibrationGainDb,len(c.bandsMHz))/20)*np.exp(1j*np.deg2rad(rng.normal(0,c.calibrationPhaseDeg,len(c.bandsMHz)))),tones)
    # Residual hardware group delay per band is referenced to the same frequency origin.
    delays=np.repeat(rng.normal(0,c.calibrationDelayNs,len(c.bandsMHz)),tones)*1e-9
    observed=clean*calibration[:,None]*np.exp(-2j*np.pi*f*delays)[:,None]
    observed+=np.sqrt(variances[:,None]/2)*(rng.normal(size=observed.shape)+1j*rng.normal(size=observed.shape))
    grid=np.linspace(0,c.maxDelayNs,c.gridPoints);dictionary=np.exp(-2j*np.pi*f[:,None]*grid*1e-9)
    outputs={};warnings=[];k=len(c.paths)
    for algorithm in c.algorithms:
        tick=time.perf_counter()
        try:
            if algorithm in ('matched','weighted'):
                weights=np.ones(len(f)) if algorithm=='matched' else 1/variances
                score=np.mean(np.abs((dictionary.conj().T*weights)@observed)**2,axis=1)/(np.sum(weights)**2)
                delays_found=peaks(score,grid,k)
                note='Strongest K local profile peaks; no guarantee these identify the earliest path under multipath.'
            elif algorithm=='music':
                if c.gainMode!='independent' and k>1: raise ValueError('Coherent multipath violates full covariance-rank assumption; use ESPRIT smoothing in one band')
                if c.snapshots<max(k+1,8): raise ValueError('MUSIC requires at least max(K+1,8) snapshots')
                # Known diagonal noise powers are whitened in both data and steering vectors.
                x=observed/np.sqrt(variances[:,None]);d=dictionary/np.sqrt(variances[:,None]);d=d/np.linalg.norm(d,axis=0)
                eigenvalues,u=np.linalg.eigh(x@x.conj().T/c.snapshots)
                noise=u[:,:len(f)-k]
                score=1/np.maximum(np.sum(np.abs(noise.conj().T@d)**2,axis=0),1e-15)
                delays_found=peaks(score,grid,k);note='Experimental grid MUSIC; known K, diagonal noise powers and independent snapshot gains; not MBWDE.'
            else:
                if len(c.bandsMHz)!=1: raise ValueError('ESPRIT supports one uniformly spaced contiguous band only; gaps cannot be treated as uniform samples')
                length=tones//2
                if length<=k or tones-length+1<k: raise ValueError('Insufficient tones for Hankel subspace rank')
                hankel=np.concatenate([np.column_stack([observed[j:j+length,s] for j in range(tones-length+1)]) for s in range(c.snapshots)],axis=1)
                u,singular,_=np.linalg.svd(hankel,full_matrices=False)
                if singular[k-1]<singular[0]*1e-10: raise ValueError('Signal subspace is rank deficient')
                sub=u[:,:k];rotation=np.linalg.lstsq(sub[:-1],sub[1:],rcond=None)[0]
                delay_values=np.mod(-np.angle(np.linalg.eigvals(rotation))/(2*np.pi*c.spacingKHz*1000),1/(c.spacingKHz*1000))*1e9
                delays_found=sorted(float(v) for v in delay_values if v<=c.maxDelayNs)
                score=np.zeros_like(grid);note='Experimental single-band LS ESPRIT with Hankel smoothing; no multiband phase unwrapping or optimal weighting.'
            peak=float(max(score))
            outputs[algorithm]=dict(delaysNs=delays_found,spectrum=(score/peak if peak>0 else score).tolist(),runtimeMs=(time.perf_counter()-tick)*1000,note=note,error=None)
        except (ValueError,np.linalg.LinAlgError) as exc:
            outputs[algorithm]=dict(delaysNs=[],spectrum=[],runtimeMs=(time.perf_counter()-tick)*1000,note='',error=str(exc))
    if any([c.calibrationDelayNs,c.calibrationPhaseDeg,c.calibrationGainDb]): warnings.append('Residual calibration violates nominal phase/gain assumptions; estimator bias is expected.')
    warnings+=['Synthetic fixed delays with frequency-invariant path amplitudes. Earliest path is not guaranteed LOS. Known path count K is supplied.','Separated bands can create strong ambiguity lobes. The finest grid spacing is not a resolution or accuracy guarantee.','Full Kazaz MBWDE weighted subspace fitting/data extension/CRB and real CSI validation are not implemented.']
    return dict(moduleVersion='signal-experimental-0.1',validation='synthetic fixtures only; not MBWDE reproduction',request=c.model_dump(),seed=c.seed,frequenciesOffsetHz=f.tolist(),csiReal=observed.real.tolist(),csiImag=observed.imag.tolist(),noiseVariance=variances.tolist(),gridNs=grid.tolist(),truthDelaysNs=(tau*1e9).tolist(),estimators=outputs,warnings=warnings,elapsedMs=(time.perf_counter()-before)*1000)
