import { describe, expect, it } from 'vitest';
import {
  PBKDF2_ITERATIONS,
  SALT_BYTES,
  createVault,
  deriveKey,
  openVault,
} from './vault.js';

const samplePayload = {
  version: '1.0.0',
  salt: 'ignored-in-test',
  updatedAt: '2026-10-30T20:00:00.000Z',
  items: [
    {
      id: 'c9a1b2c3-d4e5-6789-abcd-ef0123456789',
      title: 'Stripe Production API Key',
      category: 'api_token',
      username: 'admin@project.com',
      secret: 'sk_live_51M...',
      notes: 'Usar solo en entornos productivos de pasarela de pagos.',
      createdAt: '2026-10-30T20:00:00.000Z',
      updatedAt: '2026-10-30T20:00:00.000Z',
    },
  ],
};

describe('deriveKey', () => {
  it('derives a 32-byte key with the mandated PBKDF2 parameters', () => {
    const salt = Buffer.alloc(SALT_BYTES, 7);
    const key = deriveKey('correct horse battery staple', salt);

    expect(key).toBeInstanceOf(Buffer);
    expect(key.length).toBe(32);
    expect(PBKDF2_ITERATIONS).toBeGreaterThanOrEqual(100_000);
    expect(SALT_BYTES).toBe(16);
  });

  it('produces a different key for a different password or salt', () => {
    const saltA = Buffer.alloc(SALT_BYTES, 1);
    const saltB = Buffer.alloc(SALT_BYTES, 2);

    const key1 = deriveKey('password-one', saltA);
    const key2 = deriveKey('password-two', saltA);
    const key3 = deriveKey('password-one', saltB);

    expect(key1.equals(key2)).toBe(false);
    expect(key1.equals(key3)).toBe(false);
  });
});

describe('createVault / openVault', () => {
  it('round-trips the vault payload through the encrypted envelope', () => {
    const envelope = createVault(samplePayload, 'master-password');

    expect(typeof envelope.salt).toBe('string');
    expect(typeof envelope.iv).toBe('string');
    expect(typeof envelope.authTag).toBe('string');
    expect(typeof envelope.ciphertext).toBe('string');

    const opened = openVault(envelope, 'master-password');
    expect(opened).toEqual(samplePayload);
  });

  it('uses a random 16-byte salt and never reuses the same envelope bytes', () => {
    const a = createVault(samplePayload, 'master-password');
    const b = createVault(samplePayload, 'master-password');

    expect(a.salt).not.toBe(b.salt);
    expect(a.iv).not.toBe(b.iv);
    expect(a.ciphertext).not.toBe(b.ciphertext);
    expect(Buffer.from(a.salt, 'base64').length).toBe(16);
    expect(Buffer.from(a.iv, 'base64').length).toBe(12);
  });

  it('rejects a wrong master password via GCM auth tag', () => {
    const envelope = createVault(samplePayload, 'master-password');

    expect(() => openVault(envelope, 'wrong-password')).toThrow();
  });

  it('rejects a tampered ciphertext via GCM auth tag', () => {
    const envelope = createVault(samplePayload, 'master-password');
    const bytes = Buffer.from(envelope.ciphertext, 'base64');
    bytes[0] ^= 0xff;
    const tampered = { ...envelope, ciphertext: bytes.toString('base64') };

    expect(() => openVault(tampered, 'master-password')).toThrow();
  });
});
