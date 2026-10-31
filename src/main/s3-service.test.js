import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createS3Config } from './s3-config.js';
import { createS3Service } from './s3-service.js';

const settings = {
  endpoint: 'https://s3.eu-central-003.backblazeb2.com',
  region: 'eu-central-003',
  bucket: 'passbox-vaults',
  accessKeyId: 'key-id-123',
};

const secretAccessKey = 'kQ0-test-secret-access-key';

function headBucketError(statusCode) {
  return Object.assign(new Error(`HTTP ${statusCode}`), {
    $metadata: { httpStatusCode: statusCode },
  });
}

function createMockVaultStore({ unlocked = true } = {}) {
  return {
    status: vi.fn(() => ({ unlocked })),
    encryptSessionData: vi.fn(() => ({
      iv: 'aXY=',
      authTag: 'dGFn',
      ciphertext: Buffer.from('ciphertext-only').toString('base64'),
    })),
    decryptSessionData: vi.fn(() => ({ secretAccessKey })),
  };
}

let cwd;
let config;
let vaultStore;
let client;

function buildService({ unlocked = true, send } = {}) {
  vaultStore = createMockVaultStore({ unlocked });
  client = { send: vi.fn(send ?? (async () => ({}))) };
  return createS3Service({
    config,
    vaultStore,
    createS3Client: vi.fn(() => client),
  });
}

beforeEach(() => {
  cwd = mkdtempSync(join(tmpdir(), 'passbox-s3service-'));
  config = createS3Config(cwd);
});

afterEach(() => {
  rmSync(cwd, { recursive: true, force: true });
});

describe('s3-service status (S1/S2)', () => {
  it('reports connection state plus non-secret settings for the form', () => {
    const service = buildService();
    expect(service.status()).toEqual({
      hasCredentials: false,
      connected: false,
      settings: null,
    });
    config.setCredentials(settings);
    config.setTokenBlob({ iv: 'aXY=', authTag: 'dGFn', ciphertext: 'eA==' });
    expect(service.status()).toEqual({
      hasCredentials: true,
      connected: true,
      settings,
    });
  });
});

describe('s3-service connect (S2/S6: validate then encrypt)', () => {
  it('rejects a missing secret access key before touching settings', async () => {
    const service = buildService();
    await expect(
      service.connect({ ...settings, secretAccessKey: '' }),
    ).rejects.toThrow(/Secret access key is required/);
    expect(config.getCredentials()).toBeNull();
    expect(config.getTokenBlob()).toBeNull();
  });

  it('persists the four non-secret fields even when validation fails (reconnect UX)', async () => {
    const service = buildService({
      send: async () => {
        throw headBucketError(500);
      },
    });
    await expect(
      service.connect({ ...settings, secretAccessKey }),
    ).rejects.toThrow();
    expect(config.getCredentials()).toEqual(settings);
    expect(config.getTokenBlob()).toBeNull();
  });

  it('requires an unlocked vault to encrypt the secret', async () => {
    const service = buildService({ unlocked: false });
    await expect(
      service.connect({ ...settings, secretAccessKey }),
    ).rejects.toThrow(/unlocked/);
    expect(client.send).not.toHaveBeenCalled();
    expect(config.getTokenBlob()).toBeNull();
  });

  it('validates with HeadBucket, then stores the encrypted secret', async () => {
    const service = buildService();
    const result = await service.connect({ ...settings, secretAccessKey });

    expect(result).toEqual({ connected: true });
    expect(client.send).toHaveBeenCalledTimes(1);
    const command = client.send.mock.calls[0][0];
    expect(command.constructor.name).toBe('HeadBucketCommand');
    expect(command.input).toEqual({ Bucket: settings.bucket });

    expect(vaultStore.encryptSessionData).toHaveBeenCalledWith({
      secretAccessKey,
    });
    const blob = config.getTokenBlob();
    expect(JSON.stringify(blob)).not.toContain(secretAccessKey);
    expect(config.getStatus().connected).toBe(true);
  });

  it('reports a missing bucket without storing any secret', async () => {
    const service = buildService({
      send: async () => {
        throw headBucketError(404);
      },
    });
    await expect(
      service.connect({ ...settings, secretAccessKey }),
    ).rejects.toThrow(/not found/);
    expect(config.getTokenBlob()).toBeNull();
  });

  it('reports access denied without storing any secret', async () => {
    const service = buildService({
      send: async () => {
        throw headBucketError(403);
      },
    });
    await expect(
      service.connect({ ...settings, secretAccessKey }),
    ).rejects.toThrow(/Access denied/);
    expect(config.getTokenBlob()).toBeNull();
  });
});

describe('s3-service disconnect', () => {
  it('clears only the encrypted secret', async () => {
    const service = buildService();
    await service.connect({ ...settings, secretAccessKey });
    service.disconnect();
    expect(config.getTokenBlob()).toBeNull();
    expect(config.getCredentials()).toEqual(settings);
  });
});
