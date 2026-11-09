import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  SALT_BYTES,
  decryptWithKey,
  deriveKey,
  encryptWithKey,
} from '../crypto/vault.js';
import {
  assertRowEnvelope,
  createSharedSalt,
  decryptRow,
  encryptRow,
  parseSaltFromMeta,
} from './row-crypto.js';

const item = {
  id: 'c9a1b2c3-d4e5-6789-abcd-ef0123456789',
  title: 'Stripe Production API Key',
  category: 'api_token',
  username: 'admin@project.com',
  secret: 'sk_live_51M...',
  notes: 'production only',
  createdAt: '2026-11-09T10:00:00.000Z',
  updatedAt: '2026-11-09T10:00:00.000Z',
};

const master = 'correct horse battery staple';

describe('createSharedSalt / parseSaltFromMeta (S3: multi-client key agreement)', () => {
  it('creates a base64 salt of the mandated size', () => {
    const salt = createSharedSalt();
    expect(typeof salt).toBe('string');
    expect(Buffer.from(salt, 'base64')).toHaveLength(SALT_BYTES);
  });

  it('round-trips through the meta row value', () => {
    const salt = createSharedSalt();
    expect(parseSaltFromMeta({ value: salt })).toEqual(
      Buffer.from(salt, 'base64'),
    );
  });

  it('rejects missing or malformed salt in meta', () => {
    expect(() => parseSaltFromMeta(null)).toThrow(/salt/i);
    expect(() => parseSaltFromMeta({ value: '' })).toThrow(/salt/i);
    expect(() => parseSaltFromMeta({ value: 'not-base64!!' })).toThrow(/salt/i);
  });
});

describe('encryptRow / decryptRow (S2: ciphertext only)', () => {
  it('produces iv/authTag/ciphertext and never includes the item plaintext', () => {
    const key = deriveKey(master, randomBytes(SALT_BYTES));
    const row = encryptRow(item, key);
    expect(row).toMatchObject({
      iv: expect.any(String),
      authTag: expect.any(String),
      ciphertext: expect.any(String),
    });
    expect(row.ciphertext).not.toContain('sk_live_51M');
    expect(row.ciphertext).not.toContain('Stripe');
    expect(JSON.stringify(row)).not.toContain(item.secret);
    assertRowEnvelope(row);
  });

  it('round-trips the full item', () => {
    const key = deriveKey(master, randomBytes(SALT_BYTES));
    const row = encryptRow(item, key);
    expect(decryptRow(row, key)).toEqual(item);
  });

  it('two clients with the same master password and shared salt decrypt each other (S3)', () => {
    const sharedSalt = createSharedSalt();
    const keyA = deriveKey(master, Buffer.from(sharedSalt, 'base64'));
    const keyB = deriveKey(master, Buffer.from(sharedSalt, 'base64'));

    const rowFromA = encryptRow(item, keyA);
    expect(decryptRow(rowFromA, keyB)).toEqual(item);

    const rowFromB = encryptRow({ ...item, title: 'From B' }, keyB);
    expect(decryptRow(rowFromB, keyA)).toEqual({ ...item, title: 'From B' });
  });

  it('a different master password cannot decrypt the row (S3)', () => {
    const salt = randomBytes(SALT_BYTES);
    const row = encryptRow(item, deriveKey(master, salt));
    const wrong = deriveKey('wrong password', salt);
    expect(() => decryptRow(row, wrong)).toThrow();
  });

  it('rejects a malformed row envelope before any decrypt attempt', () => {
    const key = deriveKey(master, randomBytes(SALT_BYTES));
    expect(() => assertRowEnvelope({ iv: 'aXY=' })).toThrow(/envelope/i);
    expect(() => decryptRow({ ciphertext: 'x' }, key)).toThrow(/envelope/i);
  });

  it('rejects a non-object item', () => {
    const key = deriveKey(master, randomBytes(SALT_BYTES));
    expect(() => encryptRow(null, key)).toThrow(/item/i);
    expect(() => encryptRow('nope', key)).toThrow(/item/i);
  });
});

describe('row envelope uses the same AES-GCM primitives as the vault', () => {
  it('encryptWithKey/decryptWithKey shape matches assertRowEnvelope', () => {
    const key = deriveKey(master, randomBytes(SALT_BYTES));
    const salt = randomBytes(SALT_BYTES);
    const env = encryptWithKey(item, key, salt);
    const { salt: _salt, ...row } = env;
    assertRowEnvelope(row);
    expect(decryptWithKey(env, key)).toEqual(item);
  });
});
