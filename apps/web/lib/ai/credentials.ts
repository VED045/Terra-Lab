// Imported by server routes only. Secrets never enter the settings descriptor.
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { AIError, keySchema } from './contracts';

export const credentialCookie =
  process.env.NODE_ENV === 'production' ? '__Host-terralab-ai' : 'terralab-ai';
export const credentialLifetime = 60 * 60 * 24 * 7;
function encryptionKey(): Buffer {
  const encoded = process.env.TERRALAB_AI_COOKIE_KEY ?? '';
  const key = Buffer.from(encoded, 'base64');
  if (key.length !== 32 || key.toString('base64') !== encoded)
    throw new AIError(
      'secret_store_unavailable',
      'Ask the administrator to configure the AI encryption key.',
      503,
    );
  return key;
}
export function canSaveCredentials(): boolean {
  try {
    encryptionKey();
    return true;
  } catch {
    return false;
  }
}
export function sealCredential(apiKey: string, userId: string, now = Date.now()): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  cipher.setAAD(Buffer.from(`terralab-ai:v1:${userId}`));
  const data = Buffer.from(
    JSON.stringify({ key: keySchema.parse(apiKey), expires: now + credentialLifetime * 1000 }),
  );
  return Buffer.concat([iv, cipher.update(data), cipher.final(), cipher.getAuthTag()]).toString(
    'base64url',
  );
}
export function openCredential(
  value: string | undefined,
  userId: string,
  now = Date.now(),
): string | null {
  if (!value || value.length > 2048) return null;
  try {
    const bytes = Buffer.from(value, 'base64url');
    const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), bytes.subarray(0, 12));
    decipher.setAAD(Buffer.from(`terralab-ai:v1:${userId}`));
    decipher.setAuthTag(bytes.subarray(-16));
    const data = JSON.parse(
      Buffer.concat([decipher.update(bytes.subarray(12, -16)), decipher.final()]).toString(),
    );
    return typeof data.expires === 'number' && data.expires > now
      ? keySchema.parse(data.key)
      : null;
  } catch {
    return null;
  }
}
export function readCookie(request: Request): string | undefined {
  return request.headers
    .get('cookie')
    ?.split(';')
    .map((x) => x.trim())
    .find((x) => x.startsWith(credentialCookie + '='))
    ?.slice(credentialCookie.length + 1);
}
export function redact(text: string, secrets: string[]): string {
  for (const secret of secrets.filter(Boolean)) text = text.split(secret).join('[redacted]');
  return text;
}
// Retain possible key prefixes across provider chunks so split tokens cannot disclose a key.
export function streamRedactor(secret: string) {
  let pending = '';
  return (text: string, final = false) => {
    pending = redact(pending + text, [secret]);
    const keep = final ? 0 : Math.max(0, secret.length - 1);
    const length = Math.max(0, pending.length - keep);
    const output = pending.slice(0, length);
    pending = pending.slice(length);
    return output;
  };
}
