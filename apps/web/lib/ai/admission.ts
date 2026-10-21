import { AIError } from './contracts';
const admissionGlobal = globalThis as typeof globalThis & {
  __terralabAIInFlight?: Map<string, { actor: string; expires: number }>;
};
const requests = (admissionGlobal.__terralabAIInFlight ??= new Map());
export function admitInference(actor: string, duration: number, now = Date.now()) {
  for (const [id, value] of requests) if (value.expires <= now) requests.delete(id);
  if (
    [...requests.values()].filter((value) => value.actor === actor).length >= 2 ||
    requests.size >= 16
  )
    throw new AIError(
      'concurrency_limit',
      'Two inference requests for this account or the server admission limit are already active. Stop or wait for a response before retrying.',
      429,
    );
  const id = crypto.randomUUID();
  requests.set(id, { actor, expires: now + duration + 5000 });
  return () => {
    requests.delete(id);
  };
}
