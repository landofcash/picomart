// Kept in each website so its Railway root directory is self-contained.
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { realpath, stat } from 'node:fs/promises';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import {PICOMART_CONFIG} from '../vendor/picomart-config/index.mjs';

const root = await realpath(resolve(dirname(fileURLToPath(import.meta.url)), '../dist'));
await stat(resolve(root, 'index.html'));
const port = Number(process.env.PORT || 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT');
const mime = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.webp': 'image/webp', '.avif': 'image/avif',
  '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.ttf': 'font/ttf', '.wasm': 'application/wasm', '.txt': 'text/plain; charset=utf-8',
  '.mp4': 'video/mp4', '.pdf': 'application/pdf',
};
const inside = path => path === root || path.startsWith(root + sep);
const server = createServer(async (req, res) => {
  const reply = (status, body) => {
    res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(req.method === 'HEAD' ? undefined : body);
  };
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return reply(405, 'Method not allowed');
  }
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); }
  catch { return reply(400, 'Invalid path'); }
  if (pathname === '/healthz') return reply(200, 'ok');
  const url = new URL(req.url, 'http://localhost');
  const hostname = String(req.headers.host || '').split(':')[0].toLowerCase();
  // Preserve existing seller bookmarks and catalog demo links after the domain switch.
  // A canonical 16-byte base64url seed has 21 characters plus two final bits.
  const redirectOrigin = /^\/[A-Za-z0-9_-]{21}[AQgw]\/?$/.test(pathname) &&
    ['picomart.zkbytes.com', 'seller.picomart.zkbytes.com'].includes(hostname)
    ? PICOMART_CONFIG.app.promoUrl
    : hostname === 'seller.picomart.zkbytes.com' ? PICOMART_CONFIG.app.sellerUrl : null;
  if (redirectOrigin) {
    res.writeHead(308, {Location: redirectOrigin + url.pathname + url.search, 'Cache-Control': 'no-cache'});
    return res.end();
  }
  // Do not expose dotfiles, Windows separators, or files outside the built site.
  if (pathname.includes('\\') || pathname.includes('\0') ||
      pathname.split('/').some(part => part.startsWith('.'))) return reply(404, 'Not found');
  try {
    let file = pathname === '/' ? resolve(root, 'index.html') : resolve(root, '.' + pathname);
    if (!inside(file)) return reply(404, 'Not found');
    let info;
    try {
      file = await realpath(file);
      if (!inside(file)) return reply(404, 'Not found');
      info = await stat(file);
      if (!info.isFile()) info = undefined;
    } catch (error) {
      if (!['ENOENT', 'ENOTDIR'].includes(error.code)) throw error;
    }
    if (!info) {
      // Missing assets/APIs must not receive HTML. Navigation routes get SPA fallback.
      if (extname(pathname) || /^\/(assets|api)(\/|$)/.test(pathname) ||
          !String(req.headers.accept || '').includes('text/html')) return reply(404, 'Not found');
      file = resolve(root, 'index.html');
      info = await stat(file);
    }
    const hashedAsset = /^\/[a-z0-9/_-]*assets\/.+-[a-z0-9_-]{8,}\.[a-z0-9]+$/i.test(pathname);
    res.writeHead(200, {
      'Content-Type': mime[extname(file).toLowerCase()] || 'application/octet-stream',
      'Content-Length': info.size,
      'Cache-Control': hashedAsset ? 'public, max-age=31536000, immutable' : 'no-cache',
    });
    if (req.method === 'HEAD') return res.end();
    const stream = createReadStream(file);
    stream.on('error', () => res.destroy());
    res.on('close', () => stream.destroy());
    stream.pipe(res);
  } catch (error) {
    console.error('Static request failed:', error.code || error.name);
    if (!res.headersSent) reply(500, 'Server error');
    else res.destroy();
  }
});
server.listen(port, '0.0.0.0', () => console.log('Picomart website listening on port ' + port));
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    server.close(() => process.exit(0));
    server.closeIdleConnections();
  });
}
