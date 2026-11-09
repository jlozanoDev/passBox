import postgres from 'postgres';
import { deriveKey } from '../crypto/vault.js';
import { decryptRow, encryptRow, parseSaltFromMeta } from './row-crypto.js';
import { MIGRATION_SQL } from './supabase-migrate.js';
import { createSupabaseStore } from './supabase-store.js';

/** Cloud operations during open/save must never hang the session. */
export const SYNC_TIMEOUT_MS = 15_000;

function withTimeout(promise, ms = SYNC_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('sync timed out')), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

/**
 * Default postgres.js client for Supabase's session pooler.
 * @param {string} databaseUrl
 */
export function createSqlClient(databaseUrl) {
  return postgres(databaseUrl, { max: 1, prepare: false });
}

/**
 * Supabase cloud service (specs S1–S8): BYO connect + row sync.
 * Replaces the S3 transport and the whole-envelope sync: secrets live
 * as client-encrypted rows; the shared salt in passbox_meta is the
 * multi-client key agreement (S3).
 *
 * @param {{
 *   config: object,
 *   vaultStore: object,
 *   createSqlClient?: (url: string) => object,
 * }} deps
 */
export function createSupabaseCloud({
  config,
  vaultStore,
  createSqlClient: createClient = createSqlClient,
}) {
  /** Derived data key for the unlocked session (null when locked). */
  let sessionDataKey = null;
  /** Verified this session against the shared salt lineage. */
  let lineage = 'unverified';
  /**
   * Row ids this client pulled at the last open (B1): only these may be
   * soft-deleted when absent from the local payload. Peer rows we have
   * never seen are left untouched.
   * @type {Set<string>}
   */
  let knownRemoteIds = new Set();

  const net = (promise) => withTimeout(promise);

  function requireConnectedSettings() {
    const projectUrl = config.getProjectUrl();
    const serviceKeyBlob = config.getServiceKeyBlob();
    const databaseUrlBlob = config.getDatabaseUrlBlob();
    if (!projectUrl || !serviceKeyBlob || !databaseUrlBlob) {
      throw new Error('Cloud sync is not connected');
    }
    const { databaseUrl } = vaultStore.decryptSessionData(databaseUrlBlob);
    return { projectUrl, databaseUrl };
  }

  function openStore(databaseUrl) {
    const sql = createClient(databaseUrl);
    return { sql, store: createSupabaseStore({ sql }) };
  }

  async function ensureDataKey(store, masterPassword) {
    const saltValue = await store.ensureSalt();
    const salt = parseSaltFromMeta({ value: saltValue });
    sessionDataKey = deriveKey(masterPassword, salt);
    return sessionDataKey;
  }

  function mergeItems(localItems, remoteItems) {
    const byId = new Map();
    for (const item of localItems) {
      byId.set(item.id, item);
    }
    for (const remote of remoteItems) {
      const local = byId.get(remote.id);
      if (!local) {
        byId.set(remote.id, remote);
        continue;
      }
      const localAt = Date.parse(local.updatedAt ?? 0);
      const remoteAt = Date.parse(remote.updatedAt ?? 0);
      if (remoteAt > localAt) {
        byId.set(remote.id, remote);
      }
    }
    return [...byId.values()];
  }

  async function pullItems(store, key) {
    const rows = await store.listRows();
    const items = [];
    for (const row of rows) {
      // B2: one foreign/undecryptable row must not abort the whole pull.
      try {
        const item = decryptRow(
          { iv: row.iv, authTag: row.authTag, ciphertext: row.ciphertext },
          key,
        );
        items.push({ ...item, updatedAt: item.updatedAt ?? row.updatedAt });
      } catch {
        // Skip rows this key cannot authenticate (other master password
        // or corrupted ciphertext); the rest of the vault still loads.
      }
    }
    return items;
  }

  return {
    status() {
      return {
        ...config.getStatus(),
        settings: config.getProjectUrl()
          ? { projectUrl: config.getProjectUrl() }
          : null,
      };
    },

    /**
     * Validate, migrate schema, persist encrypted secrets (S1/S4/S6).
     * @param {{projectUrl: string, serviceKey: string, databaseUrl: string}} credentials
     * @param {{masterPassword?: string}} [options] when provided and the
     *   vault is unlocked, immediately open()/import so Connect leaves
     *   lineage verified and the cloud holds the existing passwords (B3).
     * @returns {Promise<{connected: boolean}>}
     */
    async connect({ projectUrl, serviceKey, databaseUrl } = {}, options = {}) {
      if (!projectUrl) throw new Error('Supabase project URL is required');
      if (!serviceKey) throw new Error('Service key is required');
      if (!databaseUrl) throw new Error('Database connection URL is required');
      if (!vaultStore.status().unlocked) {
        throw new Error('Vault must be unlocked to connect cloud sync');
      }

      config.setProjectUrl(projectUrl);

      const sql = createClient(databaseUrl);
      try {
        await sql.unsafe(MIGRATION_SQL);
      } finally {
        await sql.end?.();
      }

      config.setSecretBlobs({
        serviceKeyBlob: vaultStore.encryptSessionData({ serviceKey }),
        databaseUrlBlob: vaultStore.encryptSessionData({ databaseUrl }),
      });
      lineage = 'unverified';
      sessionDataKey = null;
      knownRemoteIds = new Set();

      // B3: establish lineage + import now when the caller can supply
      // the master password (main process keeps it only while unlocked).
      if (options.masterPassword && vaultStore.status().unlocked) {
        try {
          const payload = vaultStore.decryptWithSession(
            vaultStore.readEnvelope(),
          );
          await this.open(payload, options.masterPassword);
        } catch {
          // Offline or empty local vault: connect still succeeds; the
          // next unlock runs open() and finishes the bootstrap.
        }
      }

      return { connected: true };
    },

    disconnect() {
      config.clearSecrets();
      sessionDataKey = null;
      lineage = 'unverified';
      knownRemoteIds = new Set();
    },

    /**
     * On-open sync (RF-03): seed empty cloud, merge newer rows, or
     * push local-only items. Never throws — offline must not block.
     * @param {object} localPayload
     * @param {string} masterPassword
     * @returns {Promise<{payload: object, action: string, error?: string}>}
     */
    async open(localPayload, masterPassword) {
      try {
        if (!config.getStatus().connected) {
          return { payload: localPayload, action: 'skipped' };
        }
        const { databaseUrl } = requireConnectedSettings();
        const { sql, store } = openStore(databaseUrl);
        try {
          const key = await net(ensureDataKey(store, masterPassword));
          const remoteItems = await net(pullItems(store, key));
          knownRemoteIds = new Set(remoteItems.map((item) => item.id));

          if (remoteItems.length === 0) {
            if (localPayload.items.length > 0) {
              await net(store.importItems(localPayload.items, key));
              for (const item of localPayload.items) {
                knownRemoteIds.add(item.id);
              }
            }
            lineage = 'verified';
            config.recordSync(true);
            return { payload: localPayload, action: 'seeded' };
          }

          const merged = mergeItems(localPayload.items, remoteItems);
          const payload = {
            ...localPayload,
            items: merged,
            updatedAt: new Date().toISOString(),
          };
          lineage = 'verified';
          config.recordSync(true);

          const pulled =
            merged.length !== localPayload.items.length ||
            merged.some((item) => {
              const local = localPayload.items.find((l) => l.id === item.id);
              return !local || local.updatedAt !== item.updatedAt;
            });

          return {
            payload,
            action: pulled ? 'pulled' : 'uptodate',
          };
        } finally {
          await sql.end?.();
        }
      } catch (err) {
        config.recordSync(false, err.message);
        return {
          payload: localPayload,
          action: 'offline',
          error: err.message,
        };
      }
    },

    /**
     * Push after a local mutation. Never throws.
     * @param {object} localPayload
     * @returns {Promise<{uploaded: boolean, reason?: string}>}
     */
    async uploadAfterSave(localPayload) {
      try {
        if (!config.getStatus().connected) {
          return { uploaded: false, reason: 'not-connected' };
        }
        if (lineage !== 'verified' || !sessionDataKey) {
          config.recordSync(false, 'lineage-unverified');
          return { uploaded: false, reason: 'lineage-unverified' };
        }
        const { databaseUrl } = requireConnectedSettings();
        const { sql, store } = openStore(databaseUrl);
        try {
          const key = sessionDataKey;
          const remoteItems = await net(pullItems(store, key));
          const remoteById = new Map(remoteItems.map((i) => [i.id, i]));

          for (const item of localPayload.items) {
            const remote = remoteById.get(item.id);
            if (
              remote &&
              Date.parse(remote.updatedAt ?? 0) >
                Date.parse(item.updatedAt ?? 0)
            ) {
              config.recordSync(false, 'remote-newer');
              return { uploaded: false, reason: 'remote-newer' };
            }
            const row = encryptRow(item, key);
            await net(
              store.upsertRow({
                id: item.id,
                ...row,
                updatedAt: item.updatedAt ?? new Date().toISOString(),
              }),
            );
            remoteById.delete(item.id);
          }

          // B1: soft-delete only rows this client pulled at last open
          // and that the local payload no longer has (intentional local
          // delete). Peer rows we have never seen are never removed.
          for (const orphan of remoteById.values()) {
            if (!knownRemoteIds.has(orphan.id)) {
              continue;
            }
            if (
              Date.parse(orphan.updatedAt ?? 0) >
              Date.parse(localPayload.updatedAt ?? 0)
            ) {
              config.recordSync(false, 'remote-newer');
              return { uploaded: false, reason: 'remote-newer' };
            }
            await net(store.softDelete(orphan.id));
            knownRemoteIds.delete(orphan.id);
          }

          for (const item of localPayload.items) {
            knownRemoteIds.add(item.id);
          }

          config.recordSync(true);
          return { uploaded: true };
        } finally {
          await sql.end?.();
        }
      } catch (err) {
        config.recordSync(false, err.message);
        return { uploaded: false, reason: err.message };
      }
    },
  };
}
