import express, {type NextFunction, type Request, type Response} from 'express';
import {z} from 'zod';
import type {Config} from '../config.ts';
import {ArtifactPath, ArtifactSchema, Id, type Revision} from '../domain/records.ts';
import {ApiError} from '../domain/errors.ts';
import {sha256, type ObjectStore} from '../storage/bunny.ts';

export const publicTypes: Record<string, string> = {
  html: 'text/html; charset=utf-8', json: 'application/json; charset=utf-8', js: 'text/javascript; charset=utf-8',
  css: 'text/css; charset=utf-8', svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
  webp: 'image/webp', avif: 'image/avif', gif: 'image/gif', ico: 'image/x-icon', woff: 'font/woff', woff2: 'font/woff2', ttf: 'font/ttf',
};
export const isPublicAsset = (file: string) => !!publicTypes[file.split('.').at(-1)!] && !/\.(html|json)$/.test(file);
export const SelectionSchema = z.object({schemaVersion: z.literal(2), shopId: Id, revisionId: Id.nullable()}).strict();
export const PublicManifestSchema = z.object({schemaVersion: z.literal(2), shopId: Id, revisionId: Id, files: z.array(ArtifactSchema).min(2).max(2000)}).strict()
  .refine(value => new Set(value.files.map(file => file.path)).size === value.files.length &&
    value.files.some(file => file.path === 'index.html') && value.files.some(file => file.path === 'storefront.json') &&
    value.files.every(file => ['index.html', 'storefront.json'].includes(file.path) || isPublicAsset(file.path)) &&
    value.files.reduce((sum, file) => sum + file.size, 0) <= 50 * 1024 * 1024, 'Invalid public manifest');
export const AssetReferenceSchema = ArtifactSchema.extend({schemaVersion: z.literal(2), shopId: Id, revisionId: Id}).strict();
export type PublicManifest = z.infer<typeof PublicManifestSchema>;
export type Reader = (file: string, maxBytes: number) => Promise<Buffer | null>;
export const shopPath = (prefix: string, shopId: string) => `${prefix}/published/${Id.parse(shopId)}`;
export const publicRevisionPath = (prefix: string, shopId: string, revisionId: string) => `${shopPath(prefix, shopId)}/revisions/${Id.parse(revisionId)}`;
export const selectionPath = (prefix: string, shopId: string) => `${shopPath(prefix, shopId)}/current.json`;
export const assetPath = (prefix: string, shopId: string, file: string) => `${shopPath(prefix, shopId)}/assets/${ArtifactPath.parse(file)}.json`;
export function approvedManifest(revision: Revision): PublicManifest {
  return PublicManifestSchema.parse({schemaVersion: 2, shopId: revision.shopId, revisionId: revision.id,
    files: revision.files.filter(file => file.path.startsWith('dist/')).map(file => ({...file, path: file.path.slice(5)}))});
}
export async function readHttp(url: string, maxBytes: number): Promise<Buffer> {
  const response = await fetch(url, {redirect: 'error', signal: AbortSignal.timeout(15000), headers: {'Cache-Control': 'no-cache'}});
  if (!response.ok || !response.body) { await response.body?.cancel(); throw new ApiError(503, 'public_delivery_unavailable'); }
  const reader = response.body.getReader(), chunks: Uint8Array[] = []; let size = 0;
  try {
    for (;;) { const {done, value} = await reader.read(); if (done) break; size += value.length;
      if (size > maxBytes) throw new ApiError(503, 'public_artifact_mismatch'); chunks.push(value); }
  } finally { await reader.cancel(); }
  return Buffer.concat(chunks);
}
export class PublicDelivery {
  readonly store: ObjectStore;
  readonly config: Config;
  readonly prefix: string;
  readonly readArtifact: Reader;
  #reads = 0;
  constructor(store: ObjectStore, config: Config, prefix: string, readArtifact: Reader) {
    this.store = store; this.config = config; this.prefix = prefix; this.readArtifact = readArtifact;
  }
  url(shopId: string) { return `${this.config.publicOrigin}/s/${Id.parse(shopId)}/`; }
  async selection(shopId: string) {
    const bytes = await this.store.get(selectionPath(this.prefix, shopId), 4096);
    if (!bytes) return null;
    const selection = SelectionSchema.parse(JSON.parse(bytes.toString()));
    if (selection.shopId !== shopId) throw new ApiError(503, 'public_selection_mismatch');
    return selection.revisionId;
  }
  async manifest(shopId: string, revisionId: string) {
    const bytes = await this.store.get(`${publicRevisionPath(this.prefix, shopId, revisionId)}/ready.json`);
    if (!bytes) throw new ApiError(503, 'public_revision_unavailable');
    const manifest = PublicManifestSchema.parse(JSON.parse(bytes.toString()));
    if (manifest.shopId !== shopId || manifest.revisionId !== revisionId) throw new ApiError(503, 'public_revision_mismatch');
    return manifest;
  }
  async resolve(shopId: string, file: string) {
    if (!Id.safeParse(shopId).success || !ArtifactPath.safeParse(file || 'index.html').success) return null;
    const page = !file || file === 'index.html' || /^(products(?:\/[A-Za-z0-9_-]{22})?|collections\/[a-z0-9-]{1,80}|about)$/.test(file);
    if (!page && file !== 'storefront.json' && !isPublicAsset(file)) return null;
    // Read selection from authenticated primary storage on every page request. Asset
    // references are immutable and remain valid for tabs opened before a publication.
    let revisionId: string | null, reference: z.infer<typeof AssetReferenceSchema> | undefined;
    if (page || file === 'storefront.json') revisionId = await this.selection(shopId);
    else {
      const bytes = await this.store.get(assetPath(this.prefix, shopId, file), 4096);
      if (!bytes) return null;
      reference = AssetReferenceSchema.parse(JSON.parse(bytes.toString()));
      if (reference.shopId !== shopId || reference.path !== file) throw new ApiError(503, 'public_asset_mismatch');
      revisionId = reference.revisionId;
    }
    if (!revisionId) return null;
    const manifest = await this.manifest(shopId, revisionId), name = page ? 'index.html' : file;
    const entry = manifest.files.find(item => item.path === name);
    if (!entry) return null;
    if (reference && (reference.sha256 !== entry.sha256 || reference.size !== entry.size)) throw new ApiError(503, 'public_asset_mismatch');
    const bytes = await this.readArtifact(`${publicRevisionPath(this.prefix, shopId, revisionId)}/${name}`, entry.size + 1);
    if (!bytes || bytes.length !== entry.size || sha256(bytes) !== entry.sha256) throw new ApiError(503, 'public_artifact_mismatch');
    return {bytes, revisionId, type: publicTypes[name.split('.').at(-1)!], cache: page || file === 'storefront.json' ? 'no-store' : 'public, max-age=31536000, immutable'};
  }
  app() {
    const app = express(); app.disable('x-powered-by'); app.disable('etag');
    app.use((req, res, next) => {
      res.set({'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
        'Content-Security-Policy': `sandbox allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox; default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' https: data:; font-src 'self' https://fonts.gstatic.com data:; connect-src 'self' ${this.config.syncOrigin} https://*.b-cdn.net https://cdn.picomart.zkbytes.com; worker-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`,
        'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()'});
      if (req.get('host') !== new URL(this.config.publicOrigin).host) throw new ApiError(403, 'public_host_not_allowed');
      if (!['GET', 'HEAD'].includes(req.method)) throw new ApiError(405, 'method_not_allowed');
      next();
    });
    app.get('/healthz', (_req, res) => { res.json({success: true}); });
    app.get('/s/:shopId', (req, res, next) => {
      if (req.path.endsWith('/')) { next(); return; }
      if (!Id.safeParse(req.params.shopId).success) throw new ApiError(404, 'shop_not_found');
      res.redirect(308, `/s/${req.params.shopId}/`);
    });
    app.get('/s/:shopId/{*file}', async (req, res) => {
      if (this.#reads >= 32) throw new ApiError(503, 'public_delivery_busy');
      this.#reads++;
      try {
        const file = (req.params.file as string[] | undefined)?.join('/').replace(/\/$/, '') || '';
        const result = await this.resolve(String(req.params.shopId), file);
        if (!result) throw new ApiError(404, 'shop_not_found');
        res.set({'Content-Type': result.type, 'Cache-Control': result.cache, 'X-Picomart-Revision': result.revisionId}).send(result.bytes);
      } finally { this.#reads--; }
    });
    app.use((_req, _res) => { throw new ApiError(404, 'shop_not_found'); });
    app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
      const status = error instanceof ApiError ? error.status : 503;
      res.status(status).type('text/plain').send(status === 404 ? 'Shop or page not found.' : 'This shop is temporarily unavailable. Please try again.');
    });
    return app;
  }
}
