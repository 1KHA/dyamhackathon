import crypto from 'crypto';

/**
 * Symmetric encryption for secrets stored in the database (the SMTP password).
 *
 * AES-256-GCM with a key derived from JWT_SECRET via scrypt. Values are stored
 * as `enc:v1:<iv>:<authTag>:<ciphertext>` (base64 parts) so the format is
 * self-describing and future-proof.
 */

const PREFIX = 'enc:v1:';
const DEV_FALLBACK_SECRETS = ['your-secret-key', 'your-secret-key-change-in-production'];

function deriveKey(): Buffer {
  const secret = process.env.JWT_SECRET || 'your-secret-key';

  // Refuse the well-known fallback secret outside development — encrypting
  // with a public key would be worse than useless.
  if (process.env.NODE_ENV === 'production' && DEV_FALLBACK_SECRETS.includes(secret)) {
    throw new Error('JWT_SECRET must be set to a real secret in production');
  }

  return crypto.scryptSync(secret, 'alvira-email-settings', 32);
}

export function encryptSecret(plaintext: string): string {
  if (!plaintext) return '';

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', deriveKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `${PREFIX}${iv.toString('base64')}:${authTag.toString('base64')}:${ciphertext.toString('base64')}`;
}

/**
 * Decrypt a stored secret. Returns null when the value cannot be decrypted
 * (secret rotated, DB moved between environments) so callers can degrade to
 * "please re-enter the password" instead of crashing.
 */
export function decryptSecret(stored: string): string | null {
  if (!stored) return '';

  // Legacy/plaintext value (never written by this code, but degrade gracefully)
  if (!stored.startsWith(PREFIX)) return stored;

  try {
    const [ivB64, tagB64, dataB64] = stored.slice(PREFIX.length).split(':');
    const decipher = crypto.createDecipheriv('aes-256-gcm', deriveKey(), Buffer.from(ivB64, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(dataB64, 'base64')),
      decipher.final(),
    ]);
    return plaintext.toString('utf8');
  } catch {
    return null;
  }
}

export function isEncrypted(value: string): boolean {
  return value.startsWith(PREFIX);
}
