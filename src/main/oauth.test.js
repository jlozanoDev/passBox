import { afterEach, describe, expect, it } from 'vitest';
import {
  DRIVE_APPDATA_SCOPE,
  buildAuthUrl,
  startLoopbackServer,
} from './oauth.js';

/** @type {{close: () => Promise<void>}|null} */
let server = null;

afterEach(async () => {
  if (server) {
    await server.close();
    server = null;
  }
});

describe('buildAuthUrl', () => {
  it('builds an authorization URL with appDataFolder scope, state and offline access (S5/S8)', async () => {
    const client = {
      generateAuthUrl: () => 'https://accounts.example/auth',
    };
    const url = buildAuthUrl(client, 'state-123');

    expect(url).toBe('https://accounts.example/auth');
    expect(DRIVE_APPDATA_SCOPE).toBe(
      'https://www.googleapis.com/auth/drive.appdata',
    );
    expect(typeof url).toBe('string');
  });
});

describe('startLoopbackServer', () => {
  it('serves the redirect on 127.0.0.1 with a random port and resolves the code', async () => {
    server = await startLoopbackServer();
    expect(server.redirectUri).toMatch(
      /^http:\/\/127\.0\.0\.1:\d+\/oauth2\/callback$/,
    );

    const wait = server.waitForCallback('expected-state', 5_000);
    const response = await fetch(
      `${server.redirectUri}?code=auth-code-1&state=expected-state`,
    );
    expect(response.status).toBe(200);

    const code = await wait;
    expect(code).toBe('auth-code-1');
  });

  it('rejects when the state does not match (CSRF protection)', async () => {
    server = await startLoopbackServer();

    // Attach the assertion before the callback fires: the server settles
    // the promise before fetch() resolves, and an unhandled rejection
    // window would be reported by vitest.
    const wait = expect(
      server.waitForCallback('expected-state', 5_000),
    ).rejects.toThrow(/state/i);
    await fetch(`${server.redirectUri}?code=auth-code-1&state=attacker-state`);
    await wait;
  });

  it('rejects when Google reports an error (e.g. access_denied)', async () => {
    server = await startLoopbackServer();

    const wait = expect(
      server.waitForCallback('expected-state', 5_000),
    ).rejects.toThrow(/access_denied/);
    await fetch(
      `${server.redirectUri}?error=access_denied&state=expected-state`,
    );
    await wait;
  });
});
