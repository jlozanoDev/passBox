/**
 * Sync orchestration (spec S3/RF-03 + T7 scope): after unlock, pull a
 * newer cloud vault; after every local mutation, push — but only when
 * this session has verified the vault lineage and the remote has not
 * grown newer in the meantime. Conflicts surfaced here are resolved
 * by T8 (basic updatedAt arbitration); this layer only guarantees the
 * app never clobbers a newer or foreign-lineage vault.
 *
 * Design note (Log L8): the Drive refresh token is encrypted with the
 * vault session key (T5), so the cloud check runs right after unlock
 * rather than before the password prompt — the closest RF-03 allows
 * under zero-knowledge constraints.
 */

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

export function createSyncService({
  vaultStore,
  driveFiles,
  config,
  timeoutMs = SYNC_TIMEOUT_MS,
}) {
  /** @type {'unverified'|'verified'|'blocked'} session lineage state */
  let lineage = 'unverified';

  const connected = () => Boolean(config.getStatus().connected);

  /** The config store itself may be broken — sync must shrug it off. */
  const record = (ok, error) => {
    try {
      if (error === undefined) {
        config.recordSync(ok);
      } else {
        config.recordSync(ok, error);
      }
    } catch {
      // best effort: last-sync state is diagnostics only
    }
  };

  const net = (promise) => withTimeout(promise, timeoutMs);

  /**
   * Adopt a foreign-lineage (different-salt) remote only when it is
   * genuinely newer, carrying the Drive token across the session-key
   * swap (verifier B1/B3).
   */
  function adoptIfNewer(remote, localPayload, masterPassword) {
    let preview;
    try {
      preview = vaultStore.previewRemoteWithPassword(remote, masterPassword);
    } catch {
      lineage = 'blocked';
      record(false, 'incompatible-vault');
      return { payload: localPayload, action: 'incompatible' };
    }

    if (!(preview.updatedAt > localPayload.updatedAt)) {
      // An independent vault that is not newer: adopting it would
      // destroy local-only secrets; pushing would destroy theirs.
      lineage = 'blocked';
      record(false, 'incompatible-vault');
      return { payload: localPayload, action: 'incompatible' };
    }

    // Decrypt the Drive token blob with the OLD session key BEFORE the
    // swap (verifier B3); a failure here only costs the Drive session.
    let tokenData = null;
    try {
      const blob = config.getTokenBlob ? config.getTokenBlob() : null;
      if (blob) {
        tokenData = vaultStore.decryptSessionData(blob);
      }
    } catch {
      tokenData = null;
    }

    let adopted;
    try {
      adopted = vaultStore.adoptRemote(remote, masterPassword);
    } catch {
      // Persist failed: session and file are untouched, the local
      // payload is still the truth (verifier B2).
      lineage = 'blocked';
      record(false, 'incompatible-vault');
      return { payload: localPayload, action: 'incompatible' };
    }

    // ADOPTION IS COMMITTED: file and session hold the remote, so every
    // path below must return `adopted` — never the stale local payload
    // (verifier B3 residual: a token write failure must not desync the
    // renderer from disk).
    if (tokenData) {
      try {
        config.setTokenBlob(vaultStore.encryptSessionData(tokenData));
      } catch {
        // Best effort: drop the token so the reconnect flow surfaces
        // instead of failing silently forever.
        try {
          if (config.clearToken) {
            config.clearToken();
          }
        } catch {
          // ignore: diagnostics only
        }
      }
    }

    lineage = 'verified';
    record(true);
    return { payload: adopted, action: 'pulled' };
  }

  return {
    /**
     * Run the on-open cloud check (RF-03) with the freshly unlocked
     * local payload. Never throws — a broken cloud must not block
     * unlock (verifier A1/A2).
     * @param {object} localPayload plaintext vault payload
     * @param {string} masterPassword needed only to adopt a remote
     *   vault created on another device with the same password
     * @returns {Promise<{payload: object, action: string, error?: string}>}
     */
    async open(localPayload, masterPassword) {
      try {
        if (!connected()) {
          return { payload: localPayload, action: 'skipped' };
        }

        const remote = await net(driveFiles.download());

        if (!remote) {
          // First sync: seed the cloud with the current vault.
          await net(driveFiles.upload(vaultStore.readEnvelope()));
          lineage = 'verified';
          record(true);
          return { payload: localPayload, action: 'seeded' };
        }

        let remotePayload;
        try {
          remotePayload = vaultStore.decryptWithSession(remote);
        } catch {
          // Different salt: another device's vault lineage.
          return adoptIfNewer(remote, localPayload, masterPassword);
        }

        if (remotePayload.updatedAt > localPayload.updatedAt) {
          vaultStore.replaceEnvelope(remote);
          lineage = 'verified';
          record(true);
          return { payload: remotePayload, action: 'pulled' };
        }

        if (localPayload.updatedAt > remotePayload.updatedAt) {
          await net(driveFiles.upload(vaultStore.readEnvelope()));
          lineage = 'verified';
          record(true);
          return { payload: localPayload, action: 'pushed' };
        }

        lineage = 'verified';
        record(true);
        return { payload: localPayload, action: 'uptodate' };
      } catch (err) {
        // Local-first: a failed check must never block the session.
        record(false, err.message);
        return {
          payload: localPayload,
          action: 'offline',
          error: err.message,
        };
      }
    },

    /**
     * Push after a local mutation (RF-03). Never throws — the local
     * save already succeeded and a sync failure must not undo it.
     * Pre-flight: if the remote grew newer mid-session (or changed
     * lineage), skip the push — T8 resolves the conflict.
     * @param {object} localPayload the payload as persisted by save()
     * @returns {Promise<{uploaded: boolean, reason?: string}>}
     */
    async uploadAfterSave(localPayload) {
      try {
        if (!connected()) {
          return { uploaded: false, reason: 'not-connected' };
        }
        if (lineage !== 'verified') {
          record(false, 'lineage-unverified');
          return { uploaded: false, reason: 'lineage-unverified' };
        }

        const remote = await net(driveFiles.download());
        if (remote) {
          let remotePayload;
          try {
            remotePayload = vaultStore.decryptWithSession(remote);
          } catch {
            lineage = 'blocked';
            record(false, 'lineage-changed');
            return { uploaded: false, reason: 'lineage-changed' };
          }
          if (remotePayload.updatedAt > localPayload.updatedAt) {
            record(false, 'remote-newer');
            return { uploaded: false, reason: 'remote-newer' };
          }
        }

        await net(driveFiles.upload(vaultStore.readEnvelope()));
        record(true);
        return { uploaded: true };
      } catch (err) {
        record(false, err.message);
        return { uploaded: false, reason: err.message };
      }
    },
  };
}
