// Lightweight static server for Vite SPA on Google Cloud Run. No user-file API.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('./dist/', import.meta.url)));
const port = Number.parseInt(process.env.PORT || '8080', 10);
const mime = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif',
  '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2', '.wasm': 'application/wasm', '.map': 'application/json'
};
const headers = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; worker-src 'self' blob:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'"
};
const withinRoot = (p) => p === root || p.startsWith(root + sep);

createServer(async (req, res) => {
  Object.entries(headers).forEach(([key, value]) => res.setHeader(key, value));
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD' }); res.end(); return;
  }
  let url;
  try { url = new URL(req.url, 'http://localhost'); }
  catch { res.writeHead(400); res.end('Bad request'); return; }
  if (url.pathname === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(req.method === 'HEAD' ? undefined : 'ok'); return;
  }
  let path;
  try { path = decodeURIComponent(url.pathname); }
  catch { res.writeHead(400); res.end('Bad request'); return; }
  if (path.includes('\\') || path.includes('\0') || path.split('/').includes('..')) {
    res.writeHead(400); res.end('Bad request'); return;
  }
  let target = resolve(join(root, '.' + path));
  if (!withinRoot(target)) { res.writeHead(403); res.end('Forbidden'); return; }
  let file;
  try { const s = await stat(target); if (s.isFile()) file = target; } catch { /* missing */ }
  if (!file && (path === '/' || !extname(path))) file = join(root, 'index.html');
  if (!file) { res.writeHead(404); res.end('Not found'); return; }
  try {
    const body = await readFile(file);
    const type = mime[extname(file).toLowerCase()] || 'application/octet-stream';
    const cache = file.includes(`${sep}assets${sep}`) ? 'public, max-age=31536000, immutable' : 'no-cache';
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': cache });
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch {
    res.writeHead(404); res.end('Not found');
  }
}).listen(port, '0.0.0.0', () => console.log(`FileQuest static server listening on 0.0.0.0:${port}`));
