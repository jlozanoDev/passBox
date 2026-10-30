import http from 'node:http';

/**
 * OAuth 2.0 loopback flow (spec S5): a throwaway local server on
 * 127.0.0.1 receives the redirect; the flow uses the user's own BYO
 * client credentials entered on first connect (Log L5).
 */

export const DRIVE_APPDATA_SCOPE =
  'https://www.googleapis.com/auth/drive.appdata';

/**
 * @param {{generateAuthUrl: (opts: object) => string}} client OAuth2Client-like
 * @param {string} state CSRF token for this attempt
 * @returns {string} authorization URL
 */
export function buildAuthUrl(client, state) {
  return client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: [DRIVE_APPDATA_SCOPE],
    state,
  });
}

/**
 * Start a loopback HTTP server on a random port bound to 127.0.0.1.
 * @returns {Promise<{
 *   redirectUri: string,
 *   waitForCallback: (expectedState: string, timeoutMs?: number) => Promise<string>,
 *   close: () => Promise<void>,
 * }>}
 */
export function startLoopbackServer() {
  return new Promise((resolve, reject) => {
    /** @type {{resolve: Function, reject: Function}|null} */
    let pending = null;

    const server = http.createServer((req, res) => {
      const url = new URL(req.url, 'http://127.0.0.1');

      if (url.pathname !== '/oauth2/callback') {
        res.writeHead(404).end();
        return;
      }

      const error = url.searchParams.get('error');
      const code = url.searchParams.get('code');
      const state = url.searchParams.get('state');

      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(
        '<!doctype html><p>Passbox is connected. You can close this window.</p>',
      );

      if (pending) {
        if (error) {
          pending.reject(new Error(`OAuth error: ${error}`));
        } else {
          pending.resolve({ code, state });
        }
        pending = null;
      }
    });

    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();

      resolve({
        redirectUri: `http://127.0.0.1:${port}/oauth2/callback`,

        waitForCallback(expectedState, timeoutMs = 120_000) {
          return new Promise((res, rej) => {
            const timer = setTimeout(() => {
              pending = null;
              rej(new Error('Timed out waiting for Google sign-in'));
            }, timeoutMs);

            pending = {
              resolve: ({ code, state }) => {
                clearTimeout(timer);
                res({ code, state });
              },
              reject: (err) => {
                clearTimeout(timer);
                rej(err);
              },
            };
          }).then(({ code, state }) => {
            if (state !== expectedState) {
              throw new Error('OAuth state mismatch');
            }
            if (!code) {
              throw new Error('OAuth callback missing authorization code');
            }
            return code;
          });
        },

        close() {
          return new Promise((res) => server.close(() => res()));
        },
      });
    });
  });
}
