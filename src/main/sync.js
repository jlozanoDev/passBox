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

export function createSyncService({ vaultStore, driveFiles, config }) {
  /** @type {'unverified'|'verified'|'blocked'} session lineage state */
  let lineage = 'unverified';

  function connected() {
    return Boolean(config.getStatus().connected);
  }

  return {
    /**
     * Run the on-open cloud check (RF-03) with the freshly unlocked
     * local payload.
     * @param {object} localPayload plaintext vault payload
     * @param {string} masterPassword needed only to adopt a remote
     *   vault created on another device with the same password
     * @returns {Promise<{payload: object, action: string}>}
     */
    async open(localPayload, masterPassword) {
      if (!connected()) {
        return { payload: localPayload, action: 'skipped' };
      }

      try {
        const remote = await driveFiles.download();

        if (!remote) {
          // First sync: seed the cloud with the current vault.
          await driveFiles.upload(vaultStore.readEnvelope());
          lineage = 'verified';
          config.recordSync(true);
          return { payload: localPayload, action: 'seeded' };
        }

        let remotePayload;
        try {
          remotePayload = vaultStore.decryptWithSession(remote);
        } catch {
          // Different salt: another device's vault. Same master
          // password adopts it; a different one is refused outright.
          try {
            remotePayload = vaultStore.rekey(remote, masterPassword);
          } catch {
            lineage = 'blocked';
            return { payload: localPayload, action: 'incompatible' };
          }
          lineage = 'verified';
          config.recordSync(true);
          return { payload: remotePayload, action: 'pulled' };
        }

        if (remotePayload.updatedAt > localPayload.updatedAt) {
          vaultStore.replaceEnvelope(remote);
          lineage = 'verified';
          config.recordSync(true);
          return { payload: remotePayload, action: 'pulled' };
        }

        if (localPayload.updatedAt > remotePayload.updatedAt) {
          await driveFiles.upload(vaultStore.readEnvelope());
          lineage = 'verified';
          config.recordSync(true);
          return { payload: localPayload, action: 'pushed' };
        }

        lineage = 'verified';
        return { payload: localPayload, action: 'uptodate' };
      } catch (err) {
        // Local-first: a failed check must never block the session.
        config.recordSync(false, err.message);
        return { payload: localPayload, action: 'offline', error: err.message };
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
      if (!connected()) {
        return { uploaded: false, reason: 'not-connected' };
      }
      if (lineage !== 'verified') {
        return { uploaded: false, reason: 'lineage-unverified' };
      }

      try {
        const remote = await driveFiles.download();
        if (remote) {
          let remotePayload;
          try {
            remotePayload = vaultStore.decryptWithSession(remote);
          } catch {
            lineage = 'blocked';
            return { uploaded: false, reason: 'lineage-changed' };
          }
          if (remotePayload.updatedAt > localPayload.updatedAt) {
            return { uploaded: false, reason: 'remote-newer' };
          }
        }
        await driveFiles.upload(vaultStore.readEnvelope());
        config.recordSync(true);
        return { uploaded: true };
      } catch (err) {
        config.recordSync(false, err.message);
        return { uploaded: false, reason: err.message };
      }
    },
  };
}
