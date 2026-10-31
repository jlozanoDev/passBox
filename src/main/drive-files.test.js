import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDriveConfig } from './drive-config.js';
import { VAULT_FILE_NAME, createDriveFiles } from './drive-files.js';

const envelope = {
  salt: 'c2FsdA==',
  iv: 'aXY=',
  authTag: 'dGFn',
  ciphertext: 'Y2lwaGVy',
};

function createMockDrive(overrides = {}) {
  const calls = [];
  return {
    calls,
    files: {
      list: async (params) => {
        calls.push(['list', params]);
        if (overrides.list) return overrides.list(params);
        return { data: { files: [] } };
      },
      create: async (params) => {
        calls.push(['create', params]);
        if (overrides.create) return overrides.create(params);
        return { data: { id: 'created-file-id' } };
      },
      update: async (params) => {
        calls.push(['update', params]);
        if (overrides.update) return overrides.update(params);
        return { data: { id: params.fileId } };
      },
      get: async (params) => {
        calls.push(['get', params]);
        if (overrides.get) return overrides.get(params);
        return { data: envelope };
      },
    },
  };
}

function notFoundError() {
  return Object.assign(new Error('Not Found'), { code: 404 });
}

let cwd;
let config;
let drive;
let files;

beforeEach(() => {
  cwd = mkdtempSync(join(tmpdir(), 'passbox-files-'));
  config = createDriveConfig(cwd);
  drive = createMockDrive();
  files = createDriveFiles({ config, createDriveClient: () => drive });
});

afterEach(() => {
  rmSync(cwd, { recursive: true, force: true });
});

describe('drive-files upload (S8: strict appDataFolder)', () => {
  it('creates passbox.vault inside appDataFolder when no remote file exists', async () => {
    const result = await files.upload(envelope);

    expect(result).toEqual({ fileId: 'created-file-id', created: true });
    const createCall = drive.calls.find(([name]) => name === 'create');
    expect(createCall).toBeTruthy();
    const params = createCall[1];
    expect(params.requestBody).toEqual({
      name: VAULT_FILE_NAME,
      parents: ['appDataFolder'],
    });
    expect(params.media.mimeType).toBe('application/json');
    expect(JSON.parse(params.media.body)).toEqual(envelope);
    // File id is cached for later syncs.
    expect(config.getFileId()).toBe('created-file-id');
  });

  it('updates the existing file when a fileId is already known', async () => {
    config.setFileId('existing-file-id');

    const result = await files.upload(envelope);

    expect(result).toEqual({ fileId: 'existing-file-id', created: false });
    const names = drive.calls.map(([name]) => name);
    expect(names).not.toContain('list');
    expect(names).toContain('update');
    expect(drive.calls.find(([n]) => n === 'update')[1].fileId).toBe(
      'existing-file-id',
    );
  });

  it('searches by name when the cache is empty', async () => {
    drive = createMockDrive({
      list: () => ({ data: { files: [{ id: 'found-file-id' }] } }),
    });
    files = createDriveFiles({ config, createDriveClient: () => drive });

    const result = await files.upload(envelope);

    expect(result).toEqual({ fileId: 'found-file-id', created: false });
    const listParams = drive.calls.find(([n]) => n === 'list')[1];
    expect(listParams.spaces).toBe('appDataFolder');
    expect(listParams.q).toContain(VAULT_FILE_NAME);
    expect(config.getFileId()).toBe('found-file-id');
  });

  it('recreates the file when the cached id was deleted remotely', async () => {
    config.setFileId('stale-file-id');
    drive = createMockDrive({
      update: () => {
        throw notFoundError();
      },
      list: () => ({ data: { files: [] } }),
    });
    files = createDriveFiles({ config, createDriveClient: () => drive });

    const result = await files.upload(envelope);

    expect(result).toEqual({ fileId: 'created-file-id', created: true });
    expect(config.getFileId()).toBe('created-file-id');
  });
});

describe('drive-files download (S3: fetch cloud copy)', () => {
  it('downloads and parses the envelope for a known fileId', async () => {
    config.setFileId('existing-file-id');

    const result = await files.download();

    expect(result).toEqual(envelope);
    const params = drive.calls.find(([n]) => n === 'get')[1];
    expect(params.fileId).toBe('existing-file-id');
    expect(params.alt).toBe('media');
  });

  it('parses a JSON string body as well', async () => {
    config.setFileId('existing-file-id');
    drive = createMockDrive({
      get: () => ({ data: JSON.stringify(envelope) }),
    });
    files = createDriveFiles({ config, createDriveClient: () => drive });

    const result = await files.download();

    expect(result).toEqual(envelope);
  });

  it('returns null when no vault exists in the cloud yet', async () => {
    const result = await files.download();

    expect(result).toBeNull();
    expect(drive.calls.map(([n]) => n)).not.toContain('get');
  });

  it('clears the cached fileId and returns null when it was deleted', async () => {
    config.setFileId('stale-file-id');
    drive = createMockDrive({
      get: () => {
        throw notFoundError();
      },
    });
    files = createDriveFiles({ config, createDriveClient: () => drive });

    const result = await files.download();

    expect(result).toBeNull();
    expect(config.getFileId()).toBeNull();
  });
});
