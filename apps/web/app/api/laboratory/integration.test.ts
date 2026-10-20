import { it, expect } from 'vitest';
import { createTemplate, defaultLabConfig } from '@terralab/shared';
import { POST, GET } from './route';
it.runIf(process.env.RUN_SCIENCE_INTEGRATION === '1')(
  'runs the real Next handler → FastAPI worker → persisted output flow',
  async () => {
    const project = createTemplate('outdoor');
    for (const object of project.objects) if (object.kind === 'anchor') object.noise = 0;
    const config = {
      ...defaultLabConfig(),
      sweep: 'none',
      duration: 2,
      trials: 2,
      timingNs: 0,
      nlosBiasM: 0,
      nlosLossDb: 0,
      seed: 7,
    };
    const submitted = await POST(
      new Request('http://terralab.test/api/laboratory', {
        method: 'POST',
        body: JSON.stringify({ project, config }),
      }),
    );
    expect(submitted.status).toBe(202);
    const { id } = await submitted.json();
    let status;
    for (let attempt = 0; attempt < 100; attempt++) {
      const response = await GET(new Request(`http://terralab.test/api/laboratory?id=${id}`));
      expect(response.ok).toBe(true);
      status = await response.json();
      if (!['queued', 'running'].includes(status.status)) break;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    expect(status.status).toBe('completed');
    const response = await GET(
      new Request(`http://terralab.test/api/laboratory?id=${id}&detail=true`),
    );
    const result = await response.json();
    expect(result.completed).toBe(18);
    expect(result.records).toHaveLength(18);
    expect(
      result.records.every(
        (row: { errorM: number | null }) => row.errorM !== null && row.errorM < 1e-6,
      ),
    ).toBe(true);
    expect(
      new Set(
        result.records
          .filter((row: { frameId: string }) => row.frameId === '0:0:0:0')
          .map((row: { observationHash: string }) => row.observationHash),
      ).size,
    ).toBe(1);
  },
  15000,
);
