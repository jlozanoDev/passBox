import { describe, expect, it } from 'vitest';
import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { createS3Client } from './s3-client.js';
import { VAULT_FILE_NAME, createS3Files } from './s3-files.js';
import { assertEnvelope, parseEnvelopeBody } from './vault-envelope.js';

const envelope = {
  salt: 'c2FsdA==',
  iv: 'aXY=',
  authTag: 'dGFn',
  ciphertext: 'Y2lwaGVy',
};

function createMockS3(overrides = {}) {
  const calls = [];
  return {
    calls,
    async send(command) {
      calls.push(command);
      if (overrides.send) return overrides.send(command);
      return {};
    },
  };
}

function noSuchKeyError() {
  return Object.assign(new Error('NoSuchKey'), {
    name: 'NoSuchKey',
    $metadata: { httpStatusCode: 404 },
  });
}

function forbiddenError() {
  return Object.assign(new Error('AccessDenied'), {
    name: 'AccessDenied',
    $metadata: { httpStatusCode: 403 },
  });
}

function bodyReturning(text) {
  return { Body: { transformToString: async () => text } };
}

describe('vault-envelope (shared shape gate, v1.0 S10)', () => {
  it('accepts a well-formed envelope', () => {
    expect(() => assertEnvelope(envelope)).not.toThrow();
  });

  it('rejects plaintext-shaped or partial payloads', () => {
    expect(() => assertEnvelope({ secret: 'sk_live_PLAINTEXT' })).toThrow(
      /Invalid vault envelope/,
    );
    expect(() => assertEnvelope({ salt: 'a', iv: 'b', authTag: 'c' })).toThrow(
      /Invalid vault envelope/,
    );
    expect(() => assertEnvelope(undefined)).toThrow(/Invalid vault envelope/);
    expect(() => assertEnvelope(envelope.salt)).toThrow(
      /Invalid vault envelope/,
    );
  });

  it('parses JSON strings and objects into envelopes', () => {
    expect(parseEnvelopeBody(JSON.stringify(envelope))).toEqual(envelope);
    expect(parseEnvelopeBody(envelope)).toEqual(envelope);
  });

  it('rejects invalid JSON and malformed bodies', () => {
    expect(() => parseEnvelopeBody('{nope')).toThrow(/not valid JSON/);
    expect(() => parseEnvelopeBody('{"secret":"x"}')).toThrow(
      /Invalid vault envelope/,
    );
  });
});

describe('s3-client', () => {
  it('builds an S3Client with path-style addressing enabled by default', () => {
    const client = createS3Client({
      endpoint: 'https://s3.eu-central-003.backblazeb2.com',
      region: 'eu-central-003',
      accessKeyId: 'key-id',
      secretAccessKey: 'secret',
    });
    expect(client).toBeInstanceOf(S3Client);
    expect(typeof client.send).toBe('function');
    expect(client.config.forcePathStyle).toBe(true);
  });
});

describe('s3-files upload (S1/S3: fixed passbox.vault key)', () => {
  it('rejects a malformed envelope before any S3 call (S6 gate)', async () => {
    const s3 = createMockS3();
    const files = createS3Files({
      getBucket: () => 'bkt',
      createS3Client: () => s3,
    });
    await expect(files.upload({ secret: 'sk_live_PLAINTEXT' })).rejects.toThrow(
      /Invalid vault envelope/,
    );
    expect(s3.calls).toHaveLength(0);
  });

  it('PUTs the JSON envelope as passbox.vault in the configured bucket', async () => {
    const s3 = createMockS3();
    const files = createS3Files({
      getBucket: () => 'my-bucket',
      createS3Client: () => s3,
    });
    const result = await files.upload(envelope);

    expect(result).toEqual({ key: VAULT_FILE_NAME });
    expect(s3.calls).toHaveLength(1);
    const command = s3.calls[0];
    expect(command).toBeInstanceOf(PutObjectCommand);
    expect(command.input).toEqual({
      Bucket: 'my-bucket',
      Key: VAULT_FILE_NAME,
      Body: JSON.stringify(envelope),
      ContentType: 'application/json',
    });
  });

  it('obtains a fresh client per operation', async () => {
    const clients = [];
    const files = createS3Files({
      getBucket: () => 'bkt',
      createS3Client: () => {
        const client = createMockS3();
        clients.push(client);
        return client;
      },
    });
    await files.upload(envelope);
    await files.upload(envelope);
    expect(clients).toHaveLength(2);
    expect(clients[0]).not.toBe(clients[1]);
  });

  it('fails loudly when the bucket is not configured', async () => {
    const s3 = createMockS3();
    const files = createS3Files({
      getBucket: () => null,
      createS3Client: () => s3,
    });
    await expect(files.upload(envelope)).rejects.toThrow(/not configured/);
    await expect(files.download()).rejects.toThrow(/not configured/);
    expect(s3.calls).toHaveLength(0);
  });
});

describe('s3-files download (S3: remote envelope or null)', () => {
  it('returns the parsed envelope on success', async () => {
    const s3 = createMockS3({
      send: async () => bodyReturning(JSON.stringify(envelope)),
    });
    const files = createS3Files({
      getBucket: () => 'bkt',
      createS3Client: () => s3,
    });
    const result = await files.download();
    expect(result).toEqual(envelope);
    const command = s3.calls[0];
    expect(command).toBeInstanceOf(GetObjectCommand);
    expect(command.input).toEqual({ Bucket: 'bkt', Key: VAULT_FILE_NAME });
  });

  it('returns null when the object does not exist (NoSuchKey)', async () => {
    const s3 = createMockS3({
      send: async () => {
        throw noSuchKeyError();
      },
    });
    const files = createS3Files({
      getBucket: () => 'bkt',
      createS3Client: () => s3,
    });
    await expect(files.download()).resolves.toBeNull();
  });

  it('returns null on a bare 404 status (S3-compatible variants)', async () => {
    const s3 = createMockS3({
      send: async () => {
        throw Object.assign(new Error('Not Found'), {
          $metadata: { httpStatusCode: 404 },
        });
      },
    });
    const files = createS3Files({
      getBucket: () => 'bkt',
      createS3Client: () => s3,
    });
    await expect(files.download()).resolves.toBeNull();
  });

  it('rejects invalid JSON and malformed remote bodies', async () => {
    const s3 = createMockS3({
      send: async () => bodyReturning('{nope'),
    });
    const files = createS3Files({
      getBucket: () => 'bkt',
      createS3Client: () => s3,
    });
    await expect(files.download()).rejects.toThrow(/not valid JSON/);
  });

  it('propagates non-404 errors (e.g. AccessDenied)', async () => {
    const s3 = createMockS3({
      send: async () => {
        throw forbiddenError();
      },
    });
    const files = createS3Files({
      getBucket: () => 'bkt',
      createS3Client: () => s3,
    });
    await expect(files.download()).rejects.toThrow(/AccessDenied/);
  });
});
