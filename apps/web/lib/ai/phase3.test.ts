import { describe, it, expect, vi, afterEach } from 'vitest';
import { createTemplate } from '@terralab/shared';
import { studySchema, parameterStudy, regressionPlan } from './research-workflows';
import { readTasks, taskKey, taskSchema, transitionTask } from './task-history';
import { commandIdSchema, testingAvailable, submitTest } from './testing';
import { toolSchemas } from './agent-contracts';
import { toolSpecs } from './tools';
import { assertLocalOllamaModel } from './providers';
import { providerKey } from './server';
import { admitInference } from './admission';

afterEach(() => vi.unstubAllEnvs());
describe('Phase 3 trusted command boundary', () => {
  it('advertises actual experiment fields without adding defaults to a partial patch', () => {
    const parsed = toolSchemas.propose_experiment.parse({
      config: { trials: 2, estimators: ['ls'] },
      reason: 'Controlled check',
    });
    expect(parsed.config).toEqual({ trials: 2, estimators: ['ls'] });
    expect(
      toolSchemas.propose_experiment.safeParse({
        config: { estimator: 'ls' },
        reason: 'Invalid field',
      }).success,
    ).toBe(false);
  });
  it('bounds concurrent inference per user and releases expired or cancelled slots', () => {
    const actor = crypto.randomUUID();
    const first = admitInference(actor, 1000, 1000),
      second = admitInference(actor, 1000, 1000);
    expect(() => admitInference(actor, 1000, 1000)).toThrow('Two inference requests');
    first();
    const third = admitInference(actor, 1000, 1000);
    third();
    second();
    const expired = admitInference(actor, 1000, 1000);
    const current = admitInference(actor, 1000, 10000);
    current();
    expired();
  });
  it('rejects cloud names, disguised remote aliases and hosted keys in free-only mode', () => {
    expect(() => assertLocalOllamaModel('deepseek-r1:8b', {})).not.toThrow();
    expect(() => assertLocalOllamaModel('deepseek-v4.1-flash:cloud', {})).toThrow();
    expect(() =>
      assertLocalOllamaModel('looks-local', { remote_host: 'https://ollama.com' }),
    ).toThrow();
    expect(() => assertLocalOllamaModel('looks-local', { remote_model: 'hosted-model' })).toThrow();
    vi.stubEnv('TERRALAB_AI_FREE_LOCAL_ONLY', '1');
    expect(() =>
      providerKey(
        new Request('http://localhost'),
        { userId: 'local-development', local: true, db: null },
        'deepseek',
      ),
    ).toThrow('local models only');
  });
  it('accepts only discovered fixed IDs and never shell/cwd/env/arguments', () => {
    expect(commandIdSchema.parse('typecheck')).toBe('typecheck');
    for (const id of ['npm test; whoami', 'shell', 'install', '../typecheck', 'typecheck --help'])
      expect(commandIdSchema.safeParse(id).success).toBe(false);
    expect(
      toolSchemas.propose_test_run.safeParse({
        commandId: 'typecheck',
        reason: 'Check source',
        command: 'anything',
      }).success,
    ).toBe(false);
    expect(toolSpecs('owner').some((t) => t.function.name === 'propose_test_run')).toBe(false);
    expect(toolSpecs('owner', true).some((t) => t.function.name === 'propose_test_run')).toBe(true);
    expect(toolSpecs('viewer', true).some((t) => t.function.name.startsWith('propose_'))).toBe(
      false,
    );
  });
  it('fails closed outside explicit local development even with a forged enabled flag', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('TERRALAB_AI_TESTING_ENABLED', '1');
    const identity = { userId: 'local-development', local: true, db: null };
    expect(testingAvailable(identity)).toBe(false);
    await expect(
      submitTest(identity, crypto.randomUUID(), 'typecheck', 'a'.repeat(64), crypto.randomUUID()),
    ).rejects.toMatchObject({ code: 'testing_disabled' });
    vi.stubEnv('NODE_ENV', 'development');
    expect(testingAvailable({ ...identity, local: false })).toBe(false);
  });
  it('selects relevant tests from source paths while acknowledging dependency uncertainty', () => {
    const plan = regressionPlan([
      'apps/web/lib/ai/tools.ts',
      'services/api/terralab/worker.py',
      'supabase/migrations/example.sql',
    ]);
    expect(plan.commandIds).toEqual(
      expect.arrayContaining([
        'typecheck',
        'frontend-unit',
        'scientific-unit',
        'ai-unit',
        'ai-workflows',
        'worker-integration',
        'database',
        'collaboration',
      ]),
    );
    expect(plan.patchPolicy).toContain('no source edit tool');
  });
});
describe('bounded reproducible studies and task recovery', () => {
  it('uses only actual scientific sweeps and preserves seed/fixed inputs', () => {
    const project = createTemplate('outdoor');
    const input = studySchema.parse({
      metric: 'rmseM',
      parameter: 'timingNs',
      values: [0, 1, 3],
      trials: 2,
      seed: 42,
    });
    const study = parameterStudy(project, input);
    expect(study.config).toMatchObject({
      sweep: 'timingNs',
      sweepValues: [0, 1, 3],
      trials: 2,
      seed: 42,
    });
    expect(study.method).toContain('not proven paired');
    expect(studySchema.safeParse({ ...input, parameter: 'notImplemented' }).success).toBe(false);
    expect(studySchema.safeParse({ ...input, values: [0, 1, 2, 3, 4, 5] }).success).toBe(false);
    expect(() => parameterStudy(project, { ...input, values: [-1, 2] })).toThrow();
  });
  it('retains scoped IDs, bounded plan/history and never stores tokens/messages', () => {
    const projectId = crypto.randomUUID(),
      at = new Date().toISOString();
    let task = taskSchema.parse({
      id: crypto.randomUUID(),
      projectId,
      kind: 'test',
      title: 'Test source',
      state: 'draft',
      createdAt: at,
      updatedAt: at,
      history: [],
    });
    task = transitionTask(task, 'awaiting_approval', 'Review exact command and revision');
    task = transitionTask(task, 'running', 'Actual job submitted', { testId: crypto.randomUUID() });
    const key = taskKey('actor', projectId);
    const storage = { getItem: (value: string) => (value === key ? JSON.stringify([task]) : null) };
    expect(readTasks(storage, 'actor', projectId)[0].testId).toBe(task.testId);
    expect(readTasks(storage, 'other', projectId)).toEqual([]);
    expect(readTasks(storage, 'actor', crypto.randomUUID())).toEqual([]);
    expect(readTasks(storage, 'actor', projectId, Date.now() + 8 * 86400000)).toEqual([]);
    expect(taskSchema.safeParse({ ...task, token: 'secret', messages: ['prompt'] }).success).toBe(
      false,
    );
    for (let i = 0; i < 50; i++) task = transitionTask(task, 'running', 'Bounded step');
    expect(task.history).toHaveLength(30);
  });
});
