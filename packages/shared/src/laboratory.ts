import { z } from 'zod';
export const measurementModels = [
  'toa',
  'pseudorange',
  'tdoa',
  'rtt',
  'aoa',
  'rss',
  'hybrid',
] as const;
export const estimatorIds = [
  'ls',
  'wls',
  'nls',
  'huber',
  'soft_l1',
  'reject',
  'ransac',
  'mle',
  'ekf',
  'ukf',
] as const;
export type EstimatorId = (typeof estimatorIds)[number];
export type MeasurementModel = (typeof measurementModels)[number];
export const estimatorNames: Record<EstimatorId, string> = {
  ls: 'Linear LS',
  wls: 'Weighted nonlinear LS',
  nls: 'Nonlinear LS',
  huber: 'Robust NLS · Huber',
  soft_l1: 'Robust NLS · Soft-L1',
  reject: 'Residual rejection',
  ransac: 'Range RANSAC',
  mle: 'Gaussian maximum likelihood',
  ekf: 'Extended Kalman filter',
  ukf: 'Unscented Kalman filter',
};
export const measurementNames: Record<MeasurementModel, string> = {
  toa: 'Calibrated TOA ranges',
  pseudorange: 'One-way TOA pseudoranges',
  tdoa: 'TDOA range differences',
  rtt: 'Round-trip time',
  aoa: 'Angle of arrival',
  rss: 'Received signal strength',
  hybrid: 'Hybrid observations',
};
export function compatibleEstimator(model: MeasurementModel, estimator: EstimatorId) {
  return !['ls', 'ransac'].includes(estimator) || ['toa', 'rtt', 'rss'].includes(model);
}
// Shared UI metadata supplies bounds, slider increments, units, defaults and interpretation.
export const labParameters = {
  trials: {
    label: 'Monte Carlo trials',
    unit: 'trials',
    min: 1,
    max: 1000,
    step: 1,
    value: 20,
    group: 'Experiment',
    description: 'Independent measurement realizations per location and sweep point.',
  },
  duration: {
    label: 'Trajectory duration',
    unit: 's',
    min: 0,
    max: 300,
    step: 1,
    value: 0,
    group: 'Experiment',
    description: 'Zero runs one epoch; positive duration evaluates moving truth at every sample.',
  },
  sampleStep: {
    label: 'Sample interval',
    unit: 's',
    min: 0.1,
    max: 10,
    step: 0.1,
    value: 1,
    group: 'Experiment',
    description: 'Fixed observation/filter update period; samples include t=0.',
  },
  seed: {
    label: 'Random seed',
    unit: 'integer',
    min: 0,
    max: 2147483647,
    step: 1,
    value: 42,
    group: 'Experiment',
    description:
      'SeedSequence streams keyed by sweep, trial, location and epoch; estimators share each frame.',
  },
  gridSize: {
    label: 'Spatial grid side',
    unit: 'points',
    min: 0,
    max: 12,
    step: 1,
    value: 0,
    group: 'Experiment',
    description: 'Adds N×N stationary receiver locations inside anchor bounds; 0 disables grid.',
  },
  timingNs: {
    label: 'Timing uncertainty',
    unit: 'ns',
    min: 0,
    max: 1000,
    step: 0.1,
    value: 1,
    group: 'Timing & ranges',
    description:
      'Per-link Gaussian standard deviation, combined in quadrature with anchor timing uncertainty; range sigma = c·sigma_t (RTT: c·sigma_t/2).',
  },
  noiseM: {
    label: 'Additional range noise',
    unit: 'm',
    min: 0,
    max: 100,
    step: 0.01,
    value: 0,
    group: 'Timing & ranges',
    description: 'Independent Gaussian range sigma, combined with anchor residual noise.',
  },
  commonTimingNs: {
    label: 'Correlated timing noise',
    unit: 'ns',
    min: 0,
    max: 1000,
    step: 0.1,
    value: 0,
    group: 'Timing & ranges',
    description:
      'One common Gaussian draw per epoch. Adds a rank-one covariance term; cancels in TDOA.',
  },
  anchorSigmaM: {
    label: 'Anchor coordinate uncertainty',
    unit: 'm',
    min: 0,
    max: 20,
    step: 0.01,
    value: 0,
    group: 'Timing & ranges',
    description:
      'Independent x/y survey error fixed per trial/location; estimator uses nominal coordinates and a local variance approximation.',
  },
  dropout: {
    label: 'Measurement dropout',
    unit: 'probability',
    min: 0,
    max: 1,
    step: 0.01,
    value: 0,
    group: 'Availability & propagation',
    description: 'Independent probability of losing an otherwise detectable anchor each epoch.',
  },
  availability: {
    label: 'Signal availability',
    unit: 'probability',
    min: 0,
    max: 1,
    step: 0.01,
    value: 1,
    group: 'Availability & propagation',
    description: 'Probability a detectable anchor is transmitting/available before dropout.',
  },
  nlosProbability: {
    label: 'Random NLOS probability',
    unit: 'probability',
    min: 0,
    max: 1,
    step: 0.01,
    value: 0,
    group: 'Availability & propagation',
    description: 'Additional independent NLOS events; obstacle intersections always classify NLOS.',
  },
  nlosBiasM: {
    label: 'Mean positive NLOS bias',
    unit: 'm',
    min: 0,
    max: 1000,
    step: 0.1,
    value: 5,
    group: 'Availability & propagation',
    description:
      'Exponential excess path length for NLOS timing. Bearing deflection ±atan(bias/d) is an approximation.',
  },
  nlosLossDb: {
    label: 'NLOS signal attenuation',
    unit: 'dB',
    min: 0,
    max: 100,
    step: 0.1,
    value: 10,
    group: 'Availability & propagation',
    description: 'Extra link-budget/RSS loss on random or geometrically obstructed NLOS links.',
  },
  outlierProbability: {
    label: 'Heavy-tailed outlier probability',
    unit: 'probability',
    min: 0,
    max: 1,
    step: 0.01,
    value: 0,
    group: 'Availability & propagation',
    description:
      'Probability of an additive Student-t(3) contaminant; shared link flag across hybrid components.',
  },
  outlierScale: {
    label: 'Outlier scale',
    unit: 'sigma',
    min: 0,
    max: 1000,
    step: 0.5,
    value: 20,
    group: 'Availability & propagation',
    description:
      'Student-t contamination multiplier relative to the observation Gaussian sigma; may have either sign.',
  },
  bearingSigmaDeg: {
    label: 'Bearing uncertainty',
    unit: 'deg',
    min: 0,
    max: 45,
    step: 0.1,
    value: 1,
    group: 'AOA & RSS',
    description: 'Gaussian bearing sigma; angles are wrapped to [-π,π).',
  },
  referenceLossDb: {
    label: 'Reference path loss at 1 m',
    unit: 'dB',
    min: 0,
    max: 150,
    step: 0.1,
    value: 40,
    group: 'AOA & RSS',
    description: 'PL(d)=PL0+20log10(f/f0)+10n log10(max(d,1 m)); empirical model, not ray tracing.',
  },
  pathLossExponent: {
    label: 'Path-loss exponent',
    unit: 'dimensionless',
    min: 1,
    max: 6,
    step: 0.1,
    value: 2,
    group: 'AOA & RSS',
    description: 'Distance slope in the log-distance path-loss equation.',
  },
  referenceFrequencyMHz: {
    label: 'Reference frequency',
    unit: 'MHz',
    min: 1,
    max: 100000,
    step: 1,
    value: 2400,
    group: 'AOA & RSS',
    description:
      'Frequency at which the 1 m reference loss is defined; anchor frequencies alter link budget.',
  },
  shadowingDb: {
    label: 'Lognormal shadowing',
    unit: 'dB sigma',
    min: 0,
    max: 30,
    step: 0.1,
    value: 0,
    group: 'AOA & RSS',
    description:
      'Gaussian dB offset fixed per link/trial; temporally correlated and not explicitly augmented in filters.',
  },
  rssNoiseDb: {
    label: 'RSS measurement noise',
    unit: 'dB sigma',
    min: 0,
    max: 30,
    step: 0.1,
    value: 1,
    group: 'AOA & RSS',
    description:
      'Independent Gaussian dB observation noise; Gaussian MLE is performed in dB, not converted ranges.',
  },
  detectionDbm: {
    label: 'Receiver detection threshold',
    unit: 'dBm',
    min: -200,
    max: 0,
    step: 1,
    value: -120,
    group: 'Detection',
    description: 'Links with predicted received power below this level are unavailable.',
  },
  minSnrDb: {
    label: 'Minimum detectable SNR',
    unit: 'dB',
    min: -50,
    max: 50,
    step: 1,
    value: -20,
    group: 'Detection',
    description: 'Requires received power − thermal noise floor ≥ threshold.',
  },
  noiseFigureDb: {
    label: 'Receiver noise figure',
    unit: 'dB',
    min: 0,
    max: 40,
    step: 0.1,
    value: 5,
    group: 'Detection',
    description: 'Noise floor = −174 dBm/Hz + 10log10(anchor bandwidth in Hz) + noise figure.',
  },
  turnaroundNs: {
    label: 'Actual RTT turnaround',
    unit: 'ns',
    min: 0,
    max: 1000000,
    step: 1,
    value: 100,
    group: 'RTT calibration',
    description: 'Physical responder turnaround included in total round-trip time.',
  },
  turnaroundCalibrationNs: {
    label: 'Calibrated RTT turnaround',
    unit: 'ns',
    min: 0,
    max: 1000000,
    step: 1,
    value: 100,
    group: 'RTT calibration',
    description: 'Known turnaround estimate subtracted before dividing round-trip time by two.',
  },
  equipmentCalibrationNs: {
    label: 'Calibrated equipment delay',
    unit: 'ns',
    min: -100000,
    max: 100000,
    step: 1,
    value: 0,
    group: 'RTT calibration',
    description:
      'Subtracted RTT equipment-delay estimate. Anchor hardware delay is the actual residual equipment delay.',
  },
  robustScale: {
    label: 'Robust loss transition',
    unit: 'whitened sigma',
    min: 0.1,
    max: 20,
    step: 0.1,
    value: 1.5,
    group: 'Estimator & filters',
    description: 'Huber/Soft-L1 f_scale applied to Cholesky-whitened residuals.',
  },
  rejectionSigma: {
    label: 'Residual rejection threshold',
    unit: 'marginal sigma',
    min: 1,
    max: 20,
    step: 0.1,
    value: 4,
    group: 'Estimator & filters',
    description:
      'Marginal normalized residual gate after a robust seed, or RANSAC consensus threshold.',
  },
  ransacIterations: {
    label: 'RANSAC iterations',
    unit: 'subsets',
    min: 5,
    max: 500,
    step: 1,
    value: 50,
    group: 'Estimator & filters',
    description: 'Seeded three-anchor hypotheses; consensus is refit with weighted nonlinear LS.',
  },
  maxIterations: {
    label: 'Optimizer evaluation limit',
    unit: 'evaluations',
    min: 20,
    max: 1000,
    step: 1,
    value: 150,
    group: 'Estimator & filters',
    description:
      'Maximum function evaluations per nonlinear start; failed convergence produces a failed fix.',
  },
  processNoise: {
    label: 'Acceleration process noise',
    unit: 'm/s² sigma',
    min: 0.000001,
    max: 100,
    step: 0.01,
    value: 0.5,
    group: 'Estimator & filters',
    description:
      'CV process noise Q=σa²·[[dt⁴/4,dt³/2],[dt³/2,dt²]] on each position/velocity pair.',
  },
  clockProcessNoise: {
    label: 'Clock acceleration noise',
    unit: 'm/s² sigma',
    min: 0.000001,
    max: 100,
    step: 0.001,
    value: 0.01,
    group: 'Estimator & filters',
    description: 'Same integrated-acceleration Q for pseudorange clock bias/range-rate states.',
  },
  covarianceScale: {
    label: 'Assumed covariance multiplier',
    unit: 'variance factor',
    min: 0.01,
    max: 100,
    step: 0.01,
    value: 1,
    group: 'Estimator & filters',
    description:
      'Scales the covariance supplied to weighted estimators/filters without changing generated noise.',
  },
} as const;
export type LabNumberKey = keyof typeof labParameters;
const shape = Object.fromEntries(
  Object.entries(labParameters).map(([key, p]) => [
    key,
    z
      .number()
      .finite()
      .min(p.min)
      .max(p.max)
      .refine(
        (v) =>
          !['trials', 'seed', 'gridSize', 'ransacIterations', 'maxIterations'].includes(key) ||
          Number.isInteger(v),
        'Integer required',
      )
      .default(p.value),
  ]),
) as { [K in LabNumberKey]: z.ZodDefault<z.ZodNumber> };
export const labConfigSchema = z
  .object({
    ...shape,
    measurement: z.enum(measurementModels).default('toa'),
    estimators: z.array(z.enum(estimatorIds)).min(1).max(10).default(['ls', 'wls', 'huber']),
    hybrid: z
      .array(z.enum(['toa', 'aoa', 'rss']))
      .min(2)
      .max(3)
      .default(['toa', 'aoa']),
    referenceId: z.string().min(1).max(100).default('auto'),
    sweep: z
      .enum(['none', 'timingNs', 'nlosProbability', 'speed', 'anchorCount'])
      .default('timingNs'),
    sweepValues: z.array(z.number().finite()).min(1).max(20).default([0.1, 1, 3, 10]),
    missingIds: z.array(z.string()).max(100).default([]),
    excludeBlocked: z.boolean().default(false),
  })
  .superRefine((config, ctx) => {
    if (config.estimators.some((e) => !compatibleEstimator(config.measurement, e)))
      ctx.addIssue({
        code: 'custom',
        message: 'Incompatible estimator and measurement model',
        path: ['estimators'],
      });
    if (
      new Set(config.estimators).size !== config.estimators.length ||
      new Set(config.hybrid).size !== config.hybrid.length
    )
      ctx.addIssue({ code: 'custom', message: 'Duplicate estimator or hybrid components' });
    if (config.sweep !== 'none') {
      const bounds = {
        timingNs: [0, 1000],
        nlosProbability: [0, 1],
        speed: [0, 1000],
        anchorCount: [3, 100],
      }[config.sweep];
      if (
        config.sweepValues.some(
          (v) =>
            v < bounds[0] ||
            v > bounds[1] ||
            (config.sweep === 'anchorCount' && !Number.isInteger(v)),
        )
      )
        ctx.addIssue({
          code: 'custom',
          message: 'Sweep values outside parameter bounds',
          path: ['sweepValues'],
        });
    }
  });
export type LabConfig = z.infer<typeof labConfigSchema>;
export const defaultLabConfig = (): LabConfig => labConfigSchema.parse({});
export function parseSweepValues(text: string): number[] {
  const parts = text.split(',');
  if (parts.some((part) => !part.trim() || !Number.isFinite(Number(part.trim()))))
    throw Error('Enter comma-separated finite sweep values without blank entries.');
  return parts.map((part) => Number(part.trim()));
}

export type LabObservation = {
  id: string;
  kind: string;
  anchor: number[];
  value: number;
  sigma: number;
  nlos: boolean;
  blocked: boolean;
  available: boolean;
  reason: string | null;
  power: number;
  loss: number;
  signalDbm: number;
};
export type LabFrame = {
  time: number;
  truth: number[];
  values: number[];
  covariance: number[][];
  observations: LabObservation[];
  anchors: LabObservation[];
  reference: LabObservation | null;
  model: MeasurementModel;
  observationHash: string;
};
export type LabRecord = {
  frameId: string;
  trial: number;
  locationId: string;
  time: number;
  sweepValue: number;
  estimator: EstimatorId;
  observationHash: string;
  truth: number[];
  position: number[] | null;
  errorM: number | null;
  failure: string | null;
  runtimeMs: number;
  condition: number | null;
  residualRms: number | null;
  residuals?: number[];
  normalizedResiduals?: number[];
  clockBiasM?: number | null;
  rejected?: number[];
  ellipse?: { major: number; minor: number; angle: number } | null;
};
export type LabSummary = {
  estimator: EstimatorId;
  sweepValue: number;
  attempted: number;
  fixes: number;
  failures: number;
  availability: number | null;
  failureRate: number | null;
  meanErrorM: number | null;
  medianErrorM: number | null;
  rmseM: number | null;
  p95ErrorM: number | null;
  maxErrorM: number | null;
  medianRuntimeMs: number | null;
  p95RuntimeMs: number | null;
  meanNormalizedResidualRms: number | null;
  residualMean: number | null;
  residualStd: number | null;
  residualAbsP95: number | null;
  medianCondition: number | null;
  p95Condition: number | null;
  failureReasons: Record<string, number>;
};
