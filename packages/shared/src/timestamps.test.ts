import { expect, it } from 'vitest';
import { createTemplate, deserializeProject, serializeProject } from './index';
it.each([
  ['2026-10-20T12:34:56.123456+00:00', '2026-10-20T12:34:56.123Z'],
  ['2026-10-20T18:04:56.123456+05:30', '2026-10-20T12:34:56.123Z'],
  ['2026-10-20T08:34:56-04:00', '2026-10-20T12:34:56.000Z'],
  ['2026-10-20T12:34:56Z', '2026-10-20T12:34:56.000Z'],
])('round-trips cloud timestamp %s as UTC', (updatedAt, expected) => {
  const p = deserializeProject(JSON.stringify({ ...createTemplate('outdoor'), updatedAt }));
  expect(p.updatedAt).toBe(expected);
  expect(deserializeProject(serializeProject(p))).toEqual(p);
});
it.each(['2026-02-30T12:00:00Z', '2026-10-20T12:00:00', 'not a date', '2026-10-20'])(
  'rejects invalid or timezone-free timestamp %s',
  (updatedAt) => {
    expect(() =>
      deserializeProject(JSON.stringify({ ...createTemplate('outdoor'), updatedAt })),
    ).toThrow();
  },
);
