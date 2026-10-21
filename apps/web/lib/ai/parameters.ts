import {
  labParameters,
  defaultLabConfig,
  newObject,
  anchorSchema,
  receiverSchema,
  obstacleSchema,
  trajectorySchema,
  type Project,
} from '@terralab/shared';
import { z } from 'zod';
import { AIError } from './contracts';

const effects: Record<
  string,
  { increase: string; decrease: string; metrics: string; tradeoff: string }
> = {
  Experiment: {
    increase:
      'More trials/grid points/duration or finer sampling can increase work and statistical coverage. A seed change selects another realization, not higher accuracy.',
    decrease:
      'Less work or fewer samples can increase Monte Carlo uncertainty; larger sample intervals can miss motion.',
    metrics: 'Attempted samples, runtime and stability of estimated RMSE/quantiles.',
    tradeoff:
      'Hold seed and observation conditions fixed for controlled comparisons; validate paired observation hashes.',
  },
  'Timing & ranges': {
    increase:
      'Larger independent timing/range/survey noise generally increases observation uncertainty; common timing errors may cancel in TDOA.',
    decrease:
      'Smaller uncertainty can improve idealized observations but does not remove geometry defects or bias.',
    metrics: 'RMSE, residual distributions, fix rate and covariance estimates.',
    tradeoff:
      'One-way timing scales by c; RTT scales by c/2. Correlation changes covariance weighting, not just marginal variance.',
  },
  'Availability & propagation': {
    increase:
      'More dropout, outliers, NLOS probability/bias/loss generally contaminates or removes links; increasing availability instead preserves more links.',
    decrease:
      'Fewer impairments can improve synthetic data, but reducing availability removes links.',
    metrics:
      'Availability, failure reasons, residual tails, RMSE and P95 error conditional on a fix.',
    tradeoff:
      'Robust losses can resist some outliers but cannot recover unobservable geometry. NLOS and detection interact.',
  },
  'AOA & RSS': {
    increase:
      'More bearing/RSS noise or shadowing increases uncertainty. Larger path loss reduces predicted received power; frequency/reference parameters alter the link budget.',
    decrease: 'Less noise produces cleaner synthetic observations; reducing loss can retain links.',
    metrics: 'Position errors, native residuals, received power and fix availability.',
    tradeoff:
      'RSS is an empirical log-distance approximation, not full-wave propagation. Compare native residuals only within a measurement model.',
  },
  Detection: {
    increase:
      'Higher detection/SNR thresholds or noise figure tend to make more links unavailable.',
    decrease:
      'Lower thresholds retain more simulated links; this does not validate real receiver performance.',
    metrics:
      'Usable anchors, fix rate and failure reasons; conditional accuracy may change with survivor selection.',
    tradeoff:
      'Bandwidth, noise floor, loss and transmitter power jointly determine simulated detection.',
  },
  'RTT calibration': {
    increase:
      'Increasing actual turnaround/equipment delay without matching calibration creates a range bias; increasing calibration subtracts more delay.',
    decrease:
      'Decreasing actual delay or calibration changes the signed mismatch, not necessarily the absolute bias.',
    metrics: 'Range residuals, bias, RMSE and estimator validity.',
    tradeoff:
      'Match calibration to actual delay before attributing error to geometry; RTT conversion divides time by two.',
  },
  'Estimator & filters': {
    increase:
      'A larger process-noise assumption makes tracking more responsive; larger robust/rejection thresholds tolerate larger residuals. More iterations permit more computation.',
    decrease:
      'Smaller process noise smooths more but can lag motion; lower robust/gating thresholds reject or downweight more data.',
    metrics: 'Tracking error/lag, runtime, residuals, rejected links and failure rate.',
    tradeoff:
      'This is a parameter-family heuristic, not a monotonic guarantee. Weighting uses the assumed covariance and must be tested against actual generated noise.',
  },
};
const direction: Record<string, [string, string]> = {
  trials: [
    'More independent realizations per location/sweep; more work and usually more stable estimated statistics.',
    'Fewer realizations reduce work but increase Monte Carlo uncertainty.',
  ],
  duration: [
    'More epochs along the actual motion; more work and more accumulated clock drift.',
    'Shorter trajectories reduce work; zero evaluates one epoch.',
  ],
  sampleStep: [
    'Larger intervals produce fewer trajectory samples and may miss motion.',
    'Smaller intervals increase sample count and computation.',
  ],
  seed: [
    'Selects a different deterministic realization; numerical magnitude has no accuracy ordering.',
    'Also selects another realization; decreasing seed is not an improvement.',
  ],
  gridSize: [
    'Adds N squared stationary locations, increasing spatial coverage and work.',
    'Reduces grid locations; zero disables the additional grid.',
  ],
  timingNs: [
    'Larger independent timing sigma increases range uncertainty by c·sigma_t, or c·sigma_t/2 for RTT.',
    'Smaller timing uncertainty reduces this generated noise component, not bias or geometric ill-conditioning.',
  ],
  noiseM: [
    'Adds more independent range-noise sigma in quadrature.',
    'Reduces this extra range-noise component; anchor noise remains.',
  ],
  commonTimingNs: [
    'Increases the shared rank-one timing covariance term; the common component cancels in TDOA differences.',
    'Reduces shared timing uncertainty while leaving independent components unchanged.',
  ],
  anchorSigmaM: [
    'Increases fixed-per-trial coordinate survey error and its local variance approximation.',
    'Reduces nominal-versus-true anchor mismatch.',
  ],
  dropout: [
    'Removes more otherwise detectable links independently.',
    'Retains more otherwise detectable links.',
  ],
  availability: [
    'Keeps more anchors available before dropout.',
    'Removes more links before dropout.',
  ],
  nlosProbability: [
    'Adds more independent random NLOS events beyond geometric obstruction.',
    'Reduces random NLOS events; obstructed links can still be NLOS.',
  ],
  nlosBiasM: [
    'Increases the mean exponential excess path length on NLOS links.',
    'Reduces this excess timing-path component; it does not remove NLOS classification or loss.',
  ],
  nlosLossDb: [
    'Adds more dB loss to NLOS links and may trigger signal/SNR exclusion.',
    'Reduces this NLOS attenuation term; timing bias is a separate control.',
  ],
  outlierProbability: [
    'Contaminates a larger proportion of links with the shared heavy-tail event.',
    'Reduces how often heavy-tail contamination is generated.',
  ],
  outlierScale: [
    'Makes Student-t contamination larger relative to Gaussian sigma, with either sign.',
    'Reduces contamination amplitude, while event probability remains unchanged.',
  ],
  bearingSigmaDeg: [
    'Increases angular observation sigma; position impact depends on range and geometry.',
    'Reduces angular noise but cannot resolve ambiguous geometry by itself.',
  ],
  referenceLossDb: [
    'Adds loss at all distances, reducing predicted received power.',
    'Reduces the reference loss and may preserve more detectable links.',
  ],
  pathLossExponent: [
    'Increases distance-dependent loss for distances above the one-metre floor.',
    'Reduces the log-distance slope; the one-metre reference is unchanged.',
  ],
  referenceFrequencyMHz: [
    'With PL0 and anchor frequency fixed, reduces the 20log10(f/f0) term. Changing the reference without recalibration changes the empirical model.',
    'With other terms fixed, increases the frequency correction term.',
  ],
  shadowingDb: [
    'Increases the fixed-per-link/trial Gaussian dB shadowing sigma and temporal correlation.',
    'Reduces that shadowing component; independent RSS noise remains.',
  ],
  rssNoiseDb: [
    'Increases independent RSS observation noise in dB.',
    'Reduces independent RSS noise; lognormal shadowing remains separate.',
  ],
  detectionDbm: [
    'Raises the received-power cutoff, retaining fewer weak links.',
    'Lowers the cutoff, retaining more weak links in this synthetic model.',
  ],
  minSnrDb: [
    'Requires a larger signal-to-noise margin and can remove more links.',
    'Accepts lower-SNR links; this is not hardware validation.',
  ],
  noiseFigureDb: [
    'Raises the calculated noise floor and reduces predicted SNR.',
    'Lowers the noise floor while signal power is unchanged.',
  ],
  turnaroundNs: [
    'Adds actual RTT responder delay; mismatched calibration creates a positive range offset.',
    'Removes actual RTT delay relative to a fixed calibration.',
  ],
  turnaroundCalibrationNs: [
    'Subtracts more assumed responder delay before the RTT divide-by-two conversion.',
    'Subtracts less assumed responder delay. Accuracy depends on signed calibration mismatch.',
  ],
  equipmentCalibrationNs: [
    'Subtracts more equipment-delay estimate; an overestimate can bias RTT range downward.',
    'Subtracts less equipment-delay estimate; compare against actual anchor hardware delay.',
  ],
  robustScale: [
    'Moves the whitened robust-loss transition outward, downweighting fewer residuals.',
    'Downweights smaller normalized residuals; excessive robustness can reduce efficiency.',
  ],
  rejectionSigma: [
    'Uses a more permissive marginal-normalized residual/consensus gate.',
    'Rejects more residuals; too few retained links can cause no fix.',
  ],
  ransacIterations: [
    'Tests more seeded three-anchor hypotheses and consumes more computation.',
    'Tests fewer hypotheses, potentially reducing consensus discovery.',
  ],
  maxIterations: [
    'Allows more nonlinear function evaluations, with greater possible runtime.',
    'Can stop optimization earlier and increase convergence failures.',
  ],
  processNoise: [
    'Increases acceleration covariance Q quadratically, allowing the tracker to respond more to departures from constant velocity.',
    'Enforces smoother constant-velocity prediction and can lag actual acceleration.',
  ],
  clockProcessNoise: [
    'Increases process noise for augmented pseudorange clock-bias/rate states.',
    'Enforces smoother clock evolution; relevant only where those states are implemented.',
  ],
  covarianceScale: [
    'Increases assumed measurement variance, not the generated samples; filtering trusts measurement updates less relative to its process model.',
    'Makes assumed measurement covariance smaller; this can over-trust noisy observations.',
  ],
};
function entityEffects(kind: string, field: string) {
  let fact = 'Validated entity property from the existing shared schema.';
  let increase = 'A larger value has no universal accuracy ordering; inspect a controlled run.';
  let decrease = 'A smaller value has no universal accuracy ordering; inspect a controlled run.';
  let metrics = 'Recorded position error, residuals, usable observations and fix counts.';
  let tradeoff =
    'Hold the other scenario inputs and seed fixed, and compare actual observation hashes.';
  if (field === 'x' || field === 'y') {
    fact =
      'XY coordinates determine anchor geometry, receiver truth or object placement in metres.';
    increase =
      'Moves the object in the positive coordinate direction; observability depends on the full geometry.';
    decrease =
      'Moves it in the negative direction; neither direction guarantees lower positioning error.';
  } else if (field === 'noise' || field === 'timingUncertainty') {
    fact =
      field === 'noise'
        ? 'Anchor range sigma combines with laboratory noiseM by hypot; the baseline also uses anchor noise.'
        : 'Independent anchor timing sigma combines with timingNs by hypot before the c or c/2 range conversion.';
    increase =
      'Adds observation variance in the implemented range/timing models; AOA and RSS have separate noise controls.';
    decrease =
      'Reduces this independent noise component, while bias, other noise and geometry remain.';
  } else if (['clockOffset', 'timingOffset', 'clockDrift', 'hardwareDelay'].includes(field)) {
    fact =
      field === 'clockDrift'
        ? 'Clock drift is ppm: drift × 1000 × time gives ns. Receiver drift also scales the RTT interval by 1 + ppm × 1e-6.'
        : 'Signed nanosecond timing terms enter the laboratory observation generator; they are not all estimated by every model.';
    increase =
      'Raises the signed timing contribution, rather than necessarily its absolute error. Drift accumulates with time.';
    decrease =
      'Lowers the signed contribution; crossing zero may increase or decrease the absolute calibration mismatch.';
    tradeoff =
      kind === 'receiver'
        ? 'TOA assumes calibrated receiver timing; pseudorange estimates a receiver clock state. TDOA cancels a common receiver clock term. RTT ignores clock offset but uses receiver drift; AOA/RSS do not use these timing terms.'
        : 'Anchor timing offset/drift and hardware delay can leave per-anchor biases in TOA/pseudorange/TDOA. RTT uses hardware delay and turnaround/equipment calibration; AOA/RSS do not use these timing terms.';
    metrics =
      'Range bias, residuals, position error, clock-state estimates where supported, and nominal-model validity.';
  } else if (['power', 'frequency', 'bandwidth'].includes(field)) {
    fact =
      'The synthetic link budget uses power − referenceLoss − 20 log10(frequency/referenceFrequency) and a noise floor −174 + 10 log10(bandwidth × 1e6) + noiseFigure.';
    increase =
      field === 'power'
        ? 'Raises simulated received power and SNR; the calibrated RSS prediction also knows transmitter power.'
        : field === 'frequency'
          ? 'Raises the implemented frequency loss at fixed reference frequency and can remove links at detection thresholds.'
          : 'Raises the implemented noise floor and can remove low-SNR links. It does not automatically reduce timingNs.';
    decrease =
      field === 'power'
        ? 'Reduces received power/SNR and can remove usable observations.'
        : field === 'frequency'
          ? 'Reduces this frequency loss term within the same empirical model.'
          : 'Reduces the noise-floor term at fixed power; timing uncertainty remains separately configured.';
    metrics =
      'Recorded signalDbm, availability/failure reasons, usable anchor count and position error.';
    tradeoff =
      'These are empirical synthetic assumptions, not a waveform or full-wave RF simulation; inspect detection and NLOS controls together.';
  } else if (field === 'speed') {
    fact =
      kind === 'trajectory'
        ? 'Waypoint receivers use the referenced trajectory speed; an explicit laboratory speed sweep overrides it.'
        : 'Receiver speed drives nonstationary velocity/circular/random motion; waypoint motion instead uses trajectory speed.';
    increase =
      'Increases travel per sampled interval where this speed is active; tracking lag can increase.';
    decrease = 'Reduces travel; zero stops progress where the speed is active.';
    metrics = 'Sampled truth positions, tracking error/lag and availability along the route.';
    tradeoff =
      'Compare duration, sampleStep and receiver updateInterval. Changing speed at time zero cannot demonstrate accumulated movement.';
  } else if (field === 'updateInterval') {
    fact = 'Receiver motion time is quantized by floor(time/updateInterval) × updateInterval.';
    increase = 'Updates truth less often, producing larger held-position intervals.';
    decrease = 'Updates truth more often; laboratory observations are still sampled at sampleStep.';
    tradeoff =
      'This is a truth-motion control, not an automatic increase in the number of laboratory epochs.';
  } else if (field === 'heading') {
    fact = 'Heading in degrees sets the velocity/linear direction through cosine and sine.';
    increase =
      'Rotates the direction toward increasing mathematical angle in the XY coordinate model.';
    decrease =
      'Rotates it toward decreasing angle. Stationary, circular and waypoint modes do not use this heading.';
  } else if (field === 'radius') {
    fact =
      'Circular motion uses angle = time × speed/radius and an offset that preserves the initial position.';
    increase = 'Reduces angular speed for fixed linear speed and widens the circle.';
    decrease =
      'Increases angular speed and tightens the circle. Other mobility modes ignore radius.';
  } else if (field === 'width' || field === 'height') {
    fact =
      'Rectangle obstacles use these XY dimensions for geometric segment/polygon blockage; polygon obstacles use vertices instead.';
    increase =
      'Expands the rectangle in that direction and may intersect additional links, depending on placement.';
    decrease = 'Shrinks its footprint and may unblock links. Polygon vertices remain independent.';
    metrics = 'Blocked/NLOS observation flags, availability, residuals and position error.';
    tradeoff =
      'Laboratory NLOS adds configured approximate excess-path/loss effects. The baseline marks/excludes blockage; neither is full-wave propagation.';
  } else if (['verticalHeight', 'baseElevation', 'altitude'].includes(field)) {
    fact =
      'This field is stored/display geometry; the current laboratory computes XY distances and XY blockage.';
    increase =
      'Changes the stored/display height or elevation; it does not add XYZ positioning or height-dependent RF physics.';
    decrease =
      'Changes display geometry in the other direction; no scientific improvement follows from this field alone.';
    metrics = 'No direct XY scientific-metric effect is implemented for this display field.';
  } else if (['mobility', 'trajectoryId', 'points', 'loop'].includes(field)) {
    fact =
      field === 'points'
        ? 'Ordered trajectory points define piecewise-linear travel; their coordinates are in metres.'
        : field === 'loop'
          ? 'A looping path adds the closing segment and wraps travel distance; a nonlooping path stops at its endpoint.'
          : field === 'trajectoryId'
            ? 'A waypoint receiver must reference an existing enabled nonempty trajectory for an AI experiment.'
            : 'Mobility selects the implemented stationary, velocity, circular, waypoints or seeded random truth model.';
    increase =
      'Discrete selection: increasing a numeric value is not meaningful. Select the intended route or mode.';
    decrease =
      'Discrete selection: decreasing is not meaningful; compare actual sampled truth under the chosen mode.';
    tradeoff =
      'Waypoint motion uses trajectory speed; duration and update/sample intervals determine which parts of the path are observed.';
  }
  return {
    fact,
    increase,
    decrease,
    metrics,
    tradeoff,
    classification:
      'source-grounded mechanism / mathematical implication; effect on accuracy is a qualified heuristic',
  };
}
export function parameterReference(project: Project, parameter?: string) {
  const config = project.laboratory ?? defaultLabConfig();
  const controls = Object.entries(labParameters).map(([id, p]) => ({
    id,
    ...p,
    current: config[id as keyof typeof config],
    default: p.value,
    allowed: [p.min, p.max],
    sourceFact: p.description,
    expectedEffects: {
      classification:
        'source-grounded mechanism / mathematical implication; effect on accuracy and runtime is a qualified heuristic',
      ...effects[p.group],
      ...(direction[id] ? { increase: direction[id][0], decrease: direction[id][1] } : {}),
    },
    sources: [
      'packages/shared/src/laboratory.ts#labParameters',
      'services/api/terralab/physics.py',
      'services/api/terralab/estimators.py',
      'docs/LAB_PARAMETER_REFERENCE.md',
    ],
  }));
  const discrete = {
    measurement: config.measurement,
    estimators: config.estimators,
    referenceId: config.referenceId,
    hybrid: config.hybrid,
    missingIds: config.missingIds,
    excludeBlocked: config.excludeBlocked,
    sweep: config.sweep,
    sweepValues: config.sweepValues,
  };
  if (parameter) {
    const control = controls.find((c) => c.id === parameter);
    if (control) return control;
    if (parameter in discrete)
      return {
        id: parameter,
        current: discrete[parameter as keyof typeof discrete],
        default: defaultLabConfig()[parameter as keyof typeof discrete],
        source: 'packages/shared/src/laboratory.ts#labConfigSchema',
        note: 'Discrete control. Compatibility and required references are validated by the shared schema and scientific API.',
      };
    const entityParameters = {
      anchor: anchorSchema,
      receiver: receiverSchema,
      obstacle: obstacleSchema,
      trajectory: trajectorySchema,
    };
    const [kind, field] = parameter.split('.');
    if (kind in entityParameters && field) {
      const schema = z.toJSONSchema(entityParameters[kind as keyof typeof entityParameters]) as {
        properties?: Record<string, unknown>;
      };
      const example = newObject(kind as 'anchor', { x: 0, y: 0 }) as unknown as Record<
        string,
        unknown
      >;
      if (!schema.properties?.[field])
        throw new AIError('not_implemented', 'That entity parameter is not implemented.', 422);
      const units: Record<string, string> = {
        x: 'm',
        y: 'm',
        noise: 'm sigma',
        power: 'dBm',
        frequency: 'MHz',
        bandwidth: 'MHz',
        timingOffset: 'ns',
        timingUncertainty: 'ns sigma',
        hardwareDelay: 'ns',
        clockOffset: 'ns',
        clockDrift: 'ppm',
        speed: 'm/s',
        heading: 'deg',
        radius: 'm',
        altitude: 'm',
        width: 'm',
        height: 'm in XY',
        verticalHeight: 'm (display geometry; no XYZ solve)',
        baseElevation: 'm',
        updateInterval: 's',
      };
      return {
        id: parameter,
        unit: units[field] ?? 'discrete / see domain schema',
        default: example[field] ?? 'optional; not set by the existing factory',
        allowed: schema.properties[field],
        expectedEffects: entityEffects(kind, field),
        current: project.objects
          .filter((o) => o.kind === kind)
          .map((o) => ({
            id: o.id,
            value: (o as unknown as Record<string, unknown>)[field] ?? null,
          })),
        classification:
          'source-grounded default/range; expected effects require a controlled experiment',
        interactions:
          'Clock drift accumulates over duration; receiver clock bias is modeled in pseudorange. Anchor timing offsets affect synchronization. Physical obstacle height is not an RF propagation control.',
        sources: [
          'packages/shared/src/model.ts#newObject',
          'services/api/terralab/physics.py#generate',
          'services/api/terralab/physics.py#position',
          'docs/LAB_PARAMETER_REFERENCE.md',
        ],
      };
    }
    throw new AIError(
      'not_implemented',
      'This parameter is not implemented. Use a listed laboratory parameter or kind.field entity control.',
      422,
    );
  }
  return {
    controls,
    discrete,
    supportedEntityControls: [
      'anchor.noise',
      'anchor.timingOffset',
      'anchor.timingUncertainty',
      'anchor.clockDrift',
      'receiver.clockOffset',
      'receiver.clockDrift',
      'receiver.speed',
      'receiver.mobility',
      'obstacle.width',
      'obstacle.height',
      'trajectory.speed',
    ],
    geometry:
      'Anchor layout and receiver placement affect conditioning and observability. Use diagnose_geometry and actual run metrics; more anchors do not guarantee lower error.',
    tdoa: 'TDOA uses the selected/automatic reference and shared-reference covariance; inspect physics.py and estimator covariance handling. A common receiver clock term cancels in differences.',
    obstacles:
      'The laboratory engine implements geometric blockage, approximate NLOS excess-path bias and empirical link-budget loss. The browser baseline only marks/excludes blocked links; it does not add realistic attenuation or multipath. There is no full-wave RF or XYZ positioning solver.',
  };
}
export function parameterIndex(project: Project) {
  const config = project.laboratory ?? defaultLabConfig();
  return {
    controls: Object.entries(labParameters).map(([id, p]) => ({
      id,
      unit: p.unit,
      default: p.value,
      current: config[id as keyof typeof config],
      min: p.min,
      max: p.max,
    })),
    discrete: {
      measurement: config.measurement,
      estimators: config.estimators,
      hybrid: config.hybrid,
      referenceId: config.referenceId,
      sweep: config.sweep,
      sweepValues: config.sweepValues,
    },
    instruction:
      'Call inspect_parameters with one exact parameter ID for units, source-grounded facts, interactions and qualified expected effects. Entity parameters use kind.field (for example receiver.clockDrift).',
  };
}
