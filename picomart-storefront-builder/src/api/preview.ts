import express, {type NextFunction, type Request, type Response} from 'express';
import {randomBytes} from 'node:crypto';
import {ArtifactPath, type Revision, type Session} from '../domain/records.ts';
import {ApiError} from '../domain/errors.ts';
import type {AuthService} from '../auth/service.ts';
import type {ShopService} from '../domain/shops.ts';
import {sha256} from '../storage/bunny.ts';
import {revisionPath} from '../storage/revisions.ts';

const types: Record<string, string> = {
  html: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8', css: 'text/css; charset=utf-8',
  json: 'application/json; charset=utf-8', svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
  webp: 'image/webp', avif: 'image/avif', gif: 'image/gif', ico: 'image/x-icon', woff: 'font/woff', woff2: 'font/woff2', ttf: 'font/ttf',
};
type Grant = {session: Session; revision: Revision; expiresAt: number};

/** Separate HTTP listener: generated content is never served by the management API.
 * Links are temporary bearer capabilities, limited to one ready revision's dist files.
 * No cookies (including third-party cookies), management tokens or live VMs are needed.
 */
export class PreviewService {
  #auth: AuthService;
  #shops: ShopService;
  #grants = new Map<string, Grant>();
  #reads = 0;
  constructor(auth: AuthService, shops: ShopService) { this.#auth = auth; this.#shops = shops; }
  issue(session: Session, shopId: string, revisionId: string) {
    const revision = this.#shops.revisions(session, shopId).find(value => value.id === revisionId);
    if (!revision) throw new ApiError(404, 'revision_not_found');
    for (const [key, grant] of this.#grants) if (grant.expiresAt <= this.#auth.now()) this.#grants.delete(key);
    if (this.#grants.size >= 2000) throw new ApiError(429, 'preview_limit');
    const token = randomBytes(32).toString('base64url');
    const expiresAt = Math.min(this.#auth.now() + this.#auth.config.previewTtl, Date.parse(session.expiresAt));
    this.#grants.set(sha256(token), {session, revision, expiresAt});
    return {url: `${this.#auth.config.previewOrigin}/p/${token}/s/${shopId}/`, expiresAt: new Date(expiresAt).toISOString(), revisionId};
  }
  app() {
    const app = express(), {config} = this.#auth;
    app.disable('x-powered-by'); app.disable('etag');
    app.use((req, res, next) => {
      res.set({'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
        'X-Robots-Tag': 'noindex, nofollow, noarchive',
        'Content-Security-Policy': `sandbox allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox; default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' https: data:; font-src 'self' https://fonts.gstatic.com data:; connect-src 'self' ${config.syncOrigin} https://*.b-cdn.net https://cdn.picomart.zkbytes.com; worker-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors ${[...config.origins].join(' ')}`,
        'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()'});
      // Trust the configured public Host only, never a caller-supplied forwarded host.
      if (req.get('host') !== new URL(config.previewOrigin).host) throw new ApiError(403, 'preview_host_not_allowed');
      if (req.method !== 'GET' && req.method !== 'HEAD') throw new ApiError(405, 'method_not_allowed');
      this.#auth.journal.assertHealthy(); next();
    });
    app.get('/healthz', (_req, res) => { res.json({success: true}); });
    app.get('/p/:token/s/:shopId/{*file}', async (req, res) => {
      const token = String(req.params.token), shopId = String(req.params.shopId);
      if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw new ApiError(401, 'preview_expired');
      const grant = this.#grants.get(sha256(token));
      if (!grant || grant.expiresAt <= this.#auth.now()) { this.#grants.delete(sha256(token)); throw new ApiError(401, 'preview_expired'); }
      this.#auth.current(grant.session);
      if (grant.revision.shopId !== shopId) throw new ApiError(404, 'preview_not_found');
      const currentIdentity = await this.#auth.identity.account(grant.session.network, grant.session.ownerAccountId);
      if (currentIdentity.signerAddress !== grant.session.signerAddress) throw new ApiError(401, 'preview_expired');
      const parts = req.params.file as string[] | undefined;
      const file = parts?.join('/').replace(/\/$/, '') || 'index.html';
      if (!ArtifactPath.safeParse(file).success) throw new ApiError(404, 'preview_not_found');
      let entry = grant.revision.files.find(value => value.path === `dist/${file}`);
      // Only known SPA page routes fall back to HTML. Private metadata and missing assets do not.
      if (!entry && /^(products(?:\/[A-Za-z0-9_-]{22})?|collections\/[a-z0-9-]{1,80}|about)\/?$/.test(file)) {
        entry = grant.revision.files.find(value => value.path === 'dist/index.html');
      }
      const ext = entry?.path.split('.').at(-1) ?? '';
      if (!entry || !types[ext]) throw new ApiError(404, 'preview_not_found');
      if (this.#reads >= 16) throw new ApiError(429, 'preview_busy');
      this.#reads++;
      try {
        const bytes = await this.#auth.journal.store.get(`${revisionPath(this.#auth.journal, grant.revision)}/${entry.path}`, entry.size + 1);
        if (!bytes || bytes.length !== entry.size || sha256(bytes) !== entry.sha256) throw new ApiError(503, 'preview_artifact_unavailable');
        this.#auth.current(grant.session);
        if (grant.expiresAt <= this.#auth.now()) throw new ApiError(401, 'preview_expired');
        // Builds use a fixed /s/{shop}/ base. Rebase the verified delivery copy,
        // including compiled router/asset references, without changing durable artifacts.
        const output = ['html', 'js', 'css', 'svg'].includes(ext)
          ? bytes.toString('utf8').replaceAll(`/s/${shopId}/`, `/p/${token}/s/${shopId}/`) : bytes;
        res.set('Content-Type', types[ext]); res.send(output);
      } finally { this.#reads--; }
    });
    app.use((_req, _res) => { throw new ApiError(404, 'preview_not_found'); });
    app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
      const status = error instanceof ApiError ? error.status : 503;
      res.status(status).type('text/plain').send(status === 401 ? 'Preview link expired. Return to the seller workspace and refresh the preview.' : 'This private preview is unavailable. Return to the seller workspace to try again.');
    });
    return app;
  }
}
