"""Estimator/measurement separation. No optimizer receives receiver ground truth."""
from dataclasses import replace
import numpy as np
from scipy.linalg import solve_triangular, lstsq
from scipy.optimize import least_squares
from .physics import Frame, wrap

class NoFix(ValueError): pass

def jacobian(frame, x):
    rows=[]
    for o in frame.observations:
        delta=x[:2]-o['anchor']; d=max(np.linalg.norm(delta),1e-9)
        row=delta/d
        if o['kind']=='aoa': row=np.array([-delta[1],delta[0]])/d**2
        elif o['kind']=='rss': row=-10*frame.config.pathLossExponent/np.log(10)*delta/d**2 if d>1 else np.zeros(2)
        elif o['kind']=='tdoa':
            ref=x[:2]-frame.reference['anchor']; row=row-ref/max(np.linalg.norm(ref),1e-9)
        if frame.model=='pseudorange': row=np.r_[row,1.]
        rows.append(row)
    return np.array(rows)

def subset(frame, indices):
    return replace(frame,y=frame.y[indices],covariance=frame.covariance[np.ix_(indices,indices)],observations=[frame.observations[i] for i in indices])

def range_values(frame):
    if frame.model=='rss':
        return np.array([10**np.clip((o['power']-o['loss']-o['value'])/(10*frame.config.pathLossExponent),-10,10) for o in frame.observations])
    return frame.y

def linear(frame):
    a=np.array([o['anchor'] for o in frame.observations]); ranges=range_values(frame)
    if len(a)<3: raise NoFix('At least three available range anchors are required')
    delta=a[1:]-a[0]; A=2*delta
    b=np.sum(delta**2,axis=1)+(ranges[0]-ranges[1:])*(ranges[0]+ranges[1:])
    solution,_,rank,s=lstsq(A,b,cond=1e-12,lapack_driver='gelsd')
    if rank<2 or s[0]/s[-1]>1e8: raise NoFix('Degenerate linear geometry')
    return solution+a[0]

def validate(frame):
    dim=3 if frame.model=='pseudorange' else 2
    minimum=3 if frame.model=='tdoa' else dim+1 if frame.model not in ['aoa','hybrid'] else dim
    if len(frame.y)<minimum: raise NoFix(f'Insufficient observations ({len(frame.y)}); need {minimum}')
    if frame.model not in ['aoa','hybrid']:
        a=np.array([o['anchor'] for o in frame.observations]+([frame.reference['anchor']] if frame.reference else []))
        if len(a)<3 or np.linalg.matrix_rank(a-a[0],tol=1e-8)<2: raise NoFix('Collinear/degenerate anchor geometry')
    if not np.all(np.isfinite(frame.y)) or not np.all(np.isfinite(frame.covariance)): raise NoFix('Non-finite observations')

def nonlinear(frame, estimator='wls', initial=None):
    dim=3 if frame.model=='pseudorange' else 2
    weighted=estimator!='nls' or frame.model=='hybrid'
    chol=np.linalg.cholesky(frame.covariance)
    def whiten(r): return solve_triangular(chol,r,lower=True) if weighted else r
    def fun(x): return whiten(frame.residual(x))
    def jac(x): return whiten(jacobian(frame,x))
    anchors=np.array([o['anchor'] for o in frame.observations])
    center=np.mean(anchors,axis=0)
    if initial is None:
        try: initial=linear(frame) if frame.model in ['toa','rtt','rss'] else center
        except NoFix: initial=center
        if dim==3: initial=np.r_[initial,np.median(frame.y-np.linalg.norm(anchors-initial,axis=1))]
    loss=estimator if estimator in ['huber','soft_l1'] else 'linear'
    starts=[initial]
    # Multistart for nonconvex range-difference, angular, and clock-unknown objectives.
    if frame.model in ['tdoa','aoa','pseudorange','hybrid']:
        span=max(np.ptp(anchors,axis=0).max(),1)
        for direction in [[.3,.2],[-.3,-.2]]:
            candidate=np.array(initial,copy=True); candidate[:2]=center+span*np.array(direction); starts.append(candidate)
    results=[least_squares(fun,start,jac=jac,loss=loss,f_scale=frame.config.robustScale,max_nfev=frame.config.maxIterations,ftol=1e-10,xtol=1e-10,gtol=1e-10,x_scale='jac') for start in starts]
    valid=[r for r in results if r.success and np.all(np.isfinite(r.x))]
    if not valid: raise NoFix('Nonlinear estimator did not converge within evaluation budget')
    result=min(valid,key=lambda r:r.cost)
    return result.x

def uncertainty(frame, x):
    J=solve_triangular(np.linalg.cholesky(frame.covariance),jacobian(frame,x),lower=True)
    _,s,V=np.linalg.svd(J,full_matrices=False)
    if len(s)<len(x) or s[-1]<1e-10 or s[0]/s[-1]>1e8: raise NoFix('Rank-deficient or ill-conditioned observation Jacobian')
    covariance=(V.T/s**2)@V
    values,vectors=np.linalg.eigh(covariance[:2,:2])
    order=np.argsort(values)[::-1]; values=values[order]; vectors=vectors[:,order]
    return dict(covariance=covariance[:2,:2].tolist(),condition=float(s[0]/s[-1]),ellipse=dict(major=float(np.sqrt(values[0]*5.991)),minor=float(np.sqrt(values[1]*5.991)),angle=float(np.arctan2(vectors[1,0],vectors[0,0]))))

def estimate(frame, estimator, seed=0):
    validate(frame)
    rejected=[]; fit=frame
    if estimator=='ls': x=linear(frame)
    elif estimator=='ransac':
        rng=np.random.default_rng(seed); best=None
        for _ in range(frame.config.ransacIterations):
            indices=rng.choice(len(frame.y),3,replace=False)
            try: candidate=linear(subset(frame,indices))
            except NoFix: continue
            residual=np.abs(frame.residual(candidate))/np.sqrt(np.diag(frame.covariance))
            keep=np.flatnonzero(residual<frame.config.rejectionSigma)
            score=(len(keep),-float(np.sum(np.minimum(residual,frame.config.rejectionSigma)**2)))
            if len(keep)>=3 and (best is None or score>best[0]): best=(score,keep,candidate)
        if best is None: raise NoFix('RANSAC found no valid consensus')
        keep=best[1]; fit=subset(frame,keep); x=nonlinear(fit,'wls',best[2]); rejected=[i for i in range(len(frame.y)) if i not in keep]
    elif estimator=='reject':
        # Robust seed, followed by fixed-threshold marginal residual gating and refit.
        x=nonlinear(frame,'huber')
        keep=np.flatnonzero(np.abs(frame.residual(x))/np.sqrt(np.diag(frame.covariance))<=frame.config.rejectionSigma)
        if len(keep)<len(x)+1: raise NoFix('Rejection left insufficient independent observations')
        fit=subset(frame,keep); validate(fit); x=nonlinear(fit,'wls',x)
        rejected=[i for i in range(len(frame.y)) if i not in keep]
    else: x=nonlinear(frame,estimator)
    diagnostics=uncertainty(fit,x)
    # Local inverse Fisher ellipses apply only to correctly specified Gaussian WLS/MLE.
    if estimator not in ['wls','mle'] or not frame.nominalGaussian: diagnostics['ellipse']=None
    residual=frame.residual(x)
    normalized=residual/np.sqrt(np.diag(frame.covariance))
    return dict(position=x[:2].tolist(),clockBiasM=float(x[2]) if len(x)==3 else None,residuals=residual.tolist(),normalizedResiduals=normalized.tolist(),residualRms=float(np.sqrt(np.mean(normalized**2))),rejected=rejected,iterations=None,**diagnostics)

def positive_covariance(P):
    values,vectors=np.linalg.eigh((P+P.T)/2)
    if values[0] < -1e-6*max(1,abs(values[-1])): raise NoFix('Filter covariance lost positive semidefiniteness')
    return (vectors*np.maximum(values,1e-12))@vectors.T

class Tracker:
    """CV state [x,y,vx,vy,(clock bias m, drift m/s)]. No ground-truth initialization."""
    def __init__(self, algorithm, config):
        self.algorithm=algorithm; self.config=config; self.x=None; self.P=None; self.time=None

    def step(self, frame):
        if self.x is None:
            initial=estimate(frame,'wls')
            self.x=np.r_[initial['position'],0.,0.] if frame.model!='pseudorange' else np.r_[initial['position'],0.,0.,initial['clockBiasM'],0.]
            n=len(self.x); self.P=np.eye(n)*100
            self.P[:2,:2]=np.array(initial['covariance'])
            if n==6: self.P[4,4]=100
            self.time=frame.time
            return dict(initial,ellipse=None,predictionOnly=False)
        dt=frame.time-self.time
        n=len(self.x); F=np.eye(n); F[0,2]=dt; F[1,3]=dt
        Q=np.zeros((n,n))
        for p,v in [(0,2),(1,3)]+([(4,5)] if n==6 else []):
            q=self.config.clockProcessNoise if p==4 else self.config.processNoise
            Q[np.ix_([p,v],[p,v])]=q**2*np.array([[dt**4/4,dt**3/2],[dt**3/2,dt**2]])
        self.x=F@self.x; self.P=positive_covariance(F@self.P@F.T+Q); self.time=frame.time
        validate(frame)
        def reduced(x): return np.r_[x[:2],x[4]] if n==6 else x[:2]
        if self.algorithm=='ekf':
            j=jacobian(frame,reduced(self.x)); H=np.zeros((len(frame.y),n)); H[:,:2]=j[:,:2]
            if n==6: H[:,4]=j[:,2]
            innovation=-frame.residual(reduced(self.x)); S=H@self.P@H.T+frame.covariance
            K=np.linalg.solve(S,(self.P@H.T).T).T
            self.x+=K@innovation
            I=np.eye(n)-K@H
            self.P=positive_covariance(I@self.P@I.T+K@frame.covariance@K.T)
        else:
            # Scaled unscented transform alpha=.5, beta=2, kappa=0.
            lam=.5**2*n-n; weights=np.full(2*n+1,1/(2*(n+lam))); weights[0]=lam/(n+lam)
            wc=weights.copy(); wc[0]+=1-.5**2+2
            root=np.linalg.cholesky((n+lam)*self.P)
            points=np.vstack([self.x,*[self.x+root[:,i] for i in range(n)],*[self.x-root[:,i] for i in range(n)]])
            ys=np.array([frame.predict(reduced(p)) for p in points]); mean=weights@ys
            for i,o in enumerate(frame.observations):
                if o['kind']=='aoa': mean[i]=np.arctan2(weights@np.sin(ys[:,i]),weights@np.cos(ys[:,i]))
            dy=ys-mean; innovation=frame.y-mean
            for i,o in enumerate(frame.observations):
                if o['kind']=='aoa': dy[:,i]=wrap(dy[:,i]); innovation[i]=wrap(innovation[i])
            dx=points-self.x
            S=(dy.T*wc)@dy+frame.covariance; cross=(dx.T*wc)@dy
            K=np.linalg.solve(S,cross.T).T
            self.x+=K@innovation; self.P=positive_covariance(self.P-K@S@K.T)
        x=reduced(self.x); diagnostics=uncertainty(frame,x)
        values,vectors=np.linalg.eigh(self.P[:2,:2]); v=vectors[:,-1]
        ellipse=dict(major=float(np.sqrt(5.991*values[-1])),minor=float(np.sqrt(5.991*values[0])),angle=float(np.arctan2(v[1],v[0])))
        if not frame.nominalGaussian: ellipse=None
        residual=frame.residual(x); normalized=residual/np.sqrt(np.diag(frame.covariance))
        return dict(position=x[:2].tolist(),clockBiasM=float(x[2]) if n==6 else None,residuals=residual.tolist(),normalizedResiduals=normalized.tolist(),residualRms=float(np.sqrt(np.mean(normalized**2))),rejected=[],predictionOnly=False,**dict(diagnostics,covariance=self.P[:2,:2].tolist(),ellipse=ellipse))
