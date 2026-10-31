import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { copyFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

let directory: string, origin: string, child: ChildProcess;
const html = '<!doctype html><title>FileQuest</title><script type="module" src="/assets/app-test.js"></script>';

async function freePort() {
  const socket = createServer(); socket.listen(0, '127.0.0.1'); await once(socket, 'listening');
  const address = socket.address();
  if (!address || typeof address === 'string') throw new Error('Missing server test port.');
  const port = address.port; socket.close(); await once(socket, 'close'); return port;
}
async function launch(folder: string) {
  const port = await freePort();
  const process = spawn(globalThis.process.execPath, [join(folder, 'server.mjs')], {
    env: { ...globalThis.process.env, PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  const started = await Promise.race([
    once(process.stdout!, 'data').then(([message]) => String(message)),
    once(process, 'exit').then(([code]) => `exit:${code}`),
    once(process, 'error').then(([error]) => { throw error; }),
  ]);
  return { process, port, started };
}

beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'filequest-http-'));
  await copyFile('server.mjs', join(directory, 'server.mjs'));
  await mkdir(join(directory, 'dist', 'assets'), { recursive: true });
  await writeFile(join(directory, 'dist', 'index.html'), html);
  await writeFile(join(directory, 'dist', 'assets', 'app-test.js'), 'export const app = true;');
  await writeFile(join(directory, 'dist', 'assets', 'worker-test.js'), 'self.onmessage = () => {};');
  await writeFile(join(directory, 'dist', 'assets', 'app-test.css'), 'body { color: white; }');
  const launched = await launch(directory); child = launched.process;
  expect(launched.started).toContain(`0.0.0.0:${launched.port}`);
  origin = `http://127.0.0.1:${launched.port}`;
});

afterAll(async () => {
  if (child && child.exitCode === null) { child.kill(); await once(child, 'exit'); }
  // Delete only this test's resolved mkdtemp directory, never a project/user path.
  const root = resolve(tmpdir()) + sep;
  if (directory && resolve(directory).startsWith(root) && directory.includes('filequest-http-')) {
    await rm(directory, { recursive: true, force: true });
  }
});

describe('Cloud Run static HTTP contract', () => {
  it('serves the compiled app and extensionless SPA routes without caching HTML permanently', async () => {
    for (const path of ['/', '/quest/session', '/quest/session/']) {
      const response = await fetch(origin + path);
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toBe('text/html; charset=utf-8');
      expect(response.headers.get('cache-control')).toBe('no-cache');
      expect(await response.text()).toBe(html);
    }
  });
  it('supports GET/HEAD health probes with no cached or HEAD response body', async () => {
    const get = await fetch(origin + '/healthz');
    expect(get.status).toBe(200); expect(await get.text()).toBe('ok');
    expect(get.headers.get('cache-control')).toBe('no-store');
    const head = await fetch(origin + '/healthz', { method: 'HEAD' });
    expect(head.status).toBe(200); expect(await head.text()).toBe('');
  });
  it.each([['app-test.js', 'text/javascript'], ['worker-test.js', 'text/javascript'], ['app-test.css', 'text/css']])('serves %s with the correct MIME and immutable caching', async (asset, mime) => {
    const response = await fetch(`${origin}/assets/${asset}`);
    expect(response.status).toBe(200); expect(response.headers.get('content-type')).toContain(mime);
    expect(response.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
  });
  it('HEADs JavaScript without returning bytes', async () => {
    const response = await fetch(origin + '/assets/app-test.js', { method: 'HEAD' });
    expect(response.status).toBe(200); expect(await response.text()).toBe('');
  });
  it('returns 404 for missing static assets, including extensionless asset URLs', async () => {
    for (const path of ['/assets/missing.js', '/assets/missing-worker', '/assets/', '/missing.png']) {
      expect((await fetch(origin + path)).status).toBe(404);
    }
  });
  it('rejects uploads and unsupported HTTP methods', async () => {
    for (const path of ['/', '/upload', '/healthz']) {
      const response = await fetch(origin + path, { method: 'POST', body: 'synthetic bytes' });
      expect(response.status).toBe(405); expect(response.headers.get('allow')).toBe('GET, HEAD');
    }
  });
  it.each(['/..%2Fserver.mjs', '/assets%5Ctest.js', '/%00', '/%zz'])('rejects malformed or unsafe URL %s', async (path) => {
    expect((await fetch(origin + path)).status).toBe(400);
  });
  it('keeps worker/Blob operation compatible with CSP and disallows embedding or object execution', async () => {
    const response = await fetch(origin + '/');
    const csp = response.headers.get('content-security-policy');
    expect(csp).toContain("worker-src 'self' blob:");
    expect(csp).toContain("connect-src 'self'");
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'none'");
    expect(csp).toContain("form-action 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('x-frame-options')).toBe('DENY');
    expect(response.headers.get('referrer-policy')).toBe('no-referrer');
    expect(response.headers.get('permissions-policy')).toContain('camera=()');
  });
  it('fails startup rather than reporting a healthy container without a production index', async () => {
    const missing = join(directory, 'missing-build'); await mkdir(missing);
    await copyFile('server.mjs', join(missing, 'server.mjs'));
    const launched = await launch(missing);
    if (!launched.started.startsWith('exit:')) { launched.process.kill(); await once(launched.process, 'exit'); }
    expect(launched.started).toBe('exit:1');
  });
});
