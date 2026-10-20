import { describe, it, expect } from 'vitest';
import {
  labConfigSchema,
  defaultLabConfig,
  labParameters,
  compatibleEstimator,
  measurementModels,
  estimatorIds,
  createTemplate,
  serializeProject,
  deserializeProject,
} from './index';
describe('Scientific experiment configuration', () => {
  it('preserves legacy projects and saves a complete laboratory configuration', () => {
    const project = createTemplate('outdoor');
    expect(deserializeProject(serializeProject(project)).laboratory).toBeUndefined();
    project.laboratory = {
      ...defaultLabConfig(),
      measurement: 'pseudorange',
      estimators: ['wls', 'ekf', 'ukf'],
      duration: 10,
      sweep: 'none',
    };
    expect(deserializeProject(serializeProject(project))).toEqual(project);
  });
  it.each(measurementModels)('enforces estimator compatibility for %s', (measurement) => {
    for (const estimator of estimatorIds) {
      const parsed = labConfigSchema.safeParse({ measurement, estimators: [estimator] });
      expect(parsed.success).toBe(compatibleEstimator(measurement, estimator));
    }
  });
  it('documents and validates defaults and numeric bounds for every control', () => {
    const config = defaultLabConfig();
    for (const [key, p] of Object.entries(labParameters)) {
      expect(p.description.length).toBeGreaterThan(15);
      expect(p.unit.length).toBeGreaterThan(0);
      expect(config[key as keyof typeof labParameters]).toBe(p.value);
      expect(labConfigSchema.safeParse({ [key]: p.min - 1 }).success).toBe(false);
      expect(labConfigSchema.safeParse({ [key]: p.max + 1 }).success).toBe(false);
    }
  });
  it('rejects fractional counts, invalid sweeps, duplicate estimators and incomplete hybrid models', () => {
    for (const invalid of [
      { trials: 1.5 },
      { gridSize: 2.5 },
      { sweep: 'nlosProbability', sweepValues: [2] },
      { sweep: 'anchorCount', sweepValues: [3.5] },
      { estimators: ['ls', 'ls'] },
      { hybrid: ['toa'] },
    ])
      expect(labConfigSchema.safeParse(invalid).success).toBe(false);
  });
});
