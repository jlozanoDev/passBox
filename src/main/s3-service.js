import { HeadBucketCommand } from '@aws-sdk/client-s3';

/**
 * Cloud connection service (spec S1/S2/S6, BYO static credentials): the
 * user enters S3 endpoint, region, bucket and access key id plus the
 * secret access key in one action. Connect validates the pair against
 * the provider with HeadBucket, then encrypts the secret with the
 * vault session key and persists only ciphertext — the same at-rest
 * pattern v1.0 used for the Drive refresh token, with none of the
 * OAuth machinery.
 *
 * @param {{getCredentials: Function, setCredentials: Function,
 *          setTokenBlob: Function, getTokenBlob: Function,
 *          clearToken: Function, getStatus: Function}} config
 * @param {{encryptSessionData: Function, decryptSessionData: Function,
 *          status: Function}} vaultStore
 * @param {(config: object) => {send: Function}} createS3Client
 */
export function createS3Service({ config, vaultStore, createS3Client }) {
  return {
    /** Connection state plus non-secret settings (never the secret). */
    status() {
      return { ...config.getStatus(), settings: config.getCredentials() };
    },

    setCredentials(credentials) {
      config.setCredentials(credentials);
    },

    /**
     * Validate and store the connection in one action (S6): persist
     * the four non-secret fields, HeadBucket-probe the provider with
     * the provided secret, then store the secret encrypted.
     * @param {{endpoint: string, region: string, bucket: string,
     *          accessKeyId: string, secretAccessKey: string}} settings
     * @returns {Promise<{connected: boolean}>}
     */
    async connect({ endpoint, region, bucket, accessKeyId, secretAccessKey }) {
      if (!secretAccessKey) {
        throw new Error('Secret access key is required');
      }
      config.setCredentials({ endpoint, region, bucket, accessKeyId });

      if (!vaultStore.status().unlocked) {
        throw new Error('Vault must be unlocked to connect cloud sync');
      }

      const client = createS3Client({
        endpoint,
        region,
        accessKeyId,
        secretAccessKey,
      });
      try {
        await client.send(new HeadBucketCommand({ Bucket: bucket }));
      } catch (err) {
        const status = Number(err?.$metadata?.httpStatusCode);
        if (status === 404) {
          throw new Error(`Bucket "${bucket}" was not found`);
        }
        if (status === 403) {
          throw new Error(
            'Access denied: check the access key ID, secret access key and bucket permissions',
          );
        }
        throw err;
      }

      config.setTokenBlob(vaultStore.encryptSessionData({ secretAccessKey }));
      return { connected: true };
    },

    disconnect() {
      config.clearToken();
    },
  };
}
