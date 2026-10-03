import express, {type NextFunction, type Request, type Response} from 'express';
import {z} from 'zod';
import {randomUUID} from 'node:crypto';
import {NetworkSchema, type Config} from '../config.ts';
import {AccountId, Id} from '../domain/records.ts';
import {ApiError} from '../domain/errors.ts';
import {CreateShopSchema, ShopService, SubmitJobSchema, UpdateShopSchema} from '../domain/shops.ts';
import {AuthService} from '../auth/service.ts';
import type {IdentityProvider} from '../auth/identity.ts';
import type {Journal} from '../storage/journal.ts';
import {PreviewService} from './preview.ts';
import {ChallengeResponseSchema, PreviewResponseSchema, SessionResponseSchema} from './contracts.ts';
import type {ObjectStore} from '../storage/bunny.ts';
import {PublicDelivery, type Reader} from '../publishing/delivery.ts';
import {PublicationService, PublishRequestSchema} from '../publishing/service.ts';

const ChallengeRequest = z.object({accountId: AccountId}).strict();
const VerifyRequest = z.object({accountId: AccountId, challengeId: Id, signature: z.string().regex(/^0x[a-fA-F0-9]{130}$/)}).strict();
export function createApp(deps: {journal: Journal; identity: IdentityProvider; config: Config; now?: () => number; ready?: () => boolean; publicStore?: ObjectStore; publicReader?: Reader}) {
  const {journal, identity, config} = deps, now = deps.now ?? Date.now;
  const auth = new AuthService(journal, identity, config, now), shops = new ShopService(auth);
  const previews = new PreviewService(auth, shops);
  const publications = deps.publicStore && deps.publicReader ? new PublicationService(auth, shops, deps.publicStore,
    new PublicDelivery(journal.store, config, journal.prefix, deps.publicReader)) : undefined;
  const app = express(), router = express.Router({mergeParams: true});
  const windows = new Map<string, {start: number; count: number}>();
  app.disable('x-powered-by'); app.disable('etag');
  app.use((_req, res, next) => { res.set({'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'X-Request-Id': randomUUID()}); next(); });
  app.use((_req, _res, next) => { if (deps.ready && !deps.ready()) throw new ApiError(503, 'coordinator_recovering'); next(); });
  app.get('/healthz', (_req, res) => { journal.assertHealthy(); res.json({success: true, data: {status: 'ok'}}); });
  app.use((req, res, next) => {
    const origin = req.get('Origin');
    if (!origin || !config.origins.has(origin)) throw new ApiError(403, 'origin_not_allowed');
    res.set({'Access-Control-Allow-Origin': origin, Vary: 'Origin', 'Access-Control-Allow-Methods': 'GET,POST,PATCH,OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization,Content-Type,Idempotency-Key', 'Access-Control-Expose-Headers': 'X-Request-Id'});
    if (req.method === 'OPTIONS') { res.sendStatus(204); return; }
    const authRequest = /\/auth\/(challenge|verify)$/.test(req.path), key = `${req.ip}/${authRequest ? 'auth' : 'api'}`, time = now();
    for (const [entryKey, entry] of windows) if (time - entry.start >= 60000) windows.delete(entryKey);
    if (windows.size >= 2000 && !windows.has(key)) throw new ApiError(429, 'rate_limited');
    const window = windows.get(key) ?? {start: time, count: 0}; window.count++; windows.set(key, window);
    if (window.count > (authRequest ? 30 : 120)) { res.set('Retry-After', '60'); throw new ApiError(429, 'rate_limited'); }
    journal.assertHealthy(); next();
  });
  app.use(express.json({limit: 128 * 1024, strict: true, inflate: false}));
  router.use((req, res, next) => {
    const parsed = NetworkSchema.safeParse(req.params.network);
    if (!parsed.success || !config.networks.has(parsed.data)) throw new ApiError(400, 'unsupported_network');
    res.locals.network = parsed.data; next();
  });
  router.post('/auth/challenge', async (req, res) => {
    const input = ChallengeRequest.parse(req.body);
    res.status(201).json({success: true, data: ChallengeResponseSchema.parse(await auth.challenge(res.locals.network, input.accountId, req.get('Origin')!))});
  });
  router.post('/auth/verify', async (req, res) => {
    const input = VerifyRequest.parse(req.body);
    res.json({success: true, data: SessionResponseSchema.parse(await auth.verify(res.locals.network, input.accountId, input.challengeId, input.signature, req.get('Origin')!))});
  });
  router.use(async (req, res, next) => { res.locals.session = await auth.authenticate(res.locals.network, req.get('Authorization'), req.get('Origin')!); next(); });
  router.get('/auth/session', (_req, res) => {
    const session = res.locals.session;
    res.json({success: true, data: {accountId: session.ownerAccountId, network: session.network, expiresAt: session.expiresAt}});
  });
  router.post('/auth/logout', async (_req, res) => { await auth.logout(res.locals.session); res.json({success: true, data: {signedOut: true}}); });
  router.get('/shops', (_req, res) => { res.json({success: true, data: shops.list(res.locals.session)}); });
  router.post('/shops', async (req, res) => {
    const result = await shops.create(res.locals.session, Id.parse(req.get('Idempotency-Key')), CreateShopSchema.parse(req.body));
    res.status(result.status).json({success: true, data: result.data});
  });
  router.get('/shops/:shopId', (req, res) => { res.json({success: true, data: shops.get(res.locals.session, Id.parse(req.params.shopId))}); });
  router.patch('/shops/:shopId', async (req, res) => {
    const result = await shops.update(res.locals.session, Id.parse(req.params.shopId), Id.parse(req.get('Idempotency-Key')), UpdateShopSchema.parse(req.body));
    res.status(result.status).json({success: true, data: result.data});
  });
  router.get('/shops/:shopId/revisions', (req, res) => { res.json({success: true, data: shops.revisions(res.locals.session, Id.parse(req.params.shopId))}); });
  router.get('/shops/:shopId/publications', (req, res) => {
    const shopId = Id.parse(req.params.shopId); shops.get(res.locals.session, shopId);
    res.json({success: true, data: publications?.list(res.locals.session, shopId) ?? {enabled: false, liveUrl: null, operations: []}});
  });
  router.post('/shops/:shopId/publications', async (req, res) => {
    if (!publications) throw new ApiError(503, 'publication_not_configured');
    const result = await publications.submit(res.locals.session, Id.parse(req.params.shopId), Id.parse(req.get('Idempotency-Key')), PublishRequestSchema.parse(req.body));
    res.status(result.status).json({success: true, data: result.data});
  });
  router.post('/shops/:shopId/publications/:operationId/retry', async (req, res) => {
    if (!publications) throw new ApiError(503, 'publication_not_configured');
    z.object({}).strict().parse(req.body ?? {});
    const result = await publications.retry(res.locals.session, Id.parse(req.params.shopId), Id.parse(req.params.operationId), Id.parse(req.get('Idempotency-Key')));
    res.status(result.status).json({success: true, data: result.data});
  });
  router.post('/shops/:shopId/revisions/:revisionId/preview', (req, res) => {
    z.object({}).strict().parse(req.body ?? {});
    res.status(201).json({success: true, data: PreviewResponseSchema.parse(previews.issue(res.locals.session, Id.parse(req.params.shopId), Id.parse(req.params.revisionId)))});
  });
  router.get('/shops/:shopId/jobs', (req, res) => { res.json({success: true, data: shops.jobs(res.locals.session, Id.parse(req.params.shopId))}); });
  router.get('/shops/:shopId/jobs/:jobId', (req, res) => { res.json({success: true, data: shops.job(res.locals.session, Id.parse(req.params.shopId), Id.parse(req.params.jobId))}); });
  router.post('/shops/:shopId/jobs', async (req, res) => {
    const result = await shops.submit(res.locals.session, Id.parse(req.params.shopId), Id.parse(req.get('Idempotency-Key')), SubmitJobSchema.parse(req.body));
    res.status(result.status).json({success: true, data: result.data});
  });
  app.use('/api/v1/:network', router);
  router.get('/shops/:shopId/jobs/:jobId/attempts', (req, res) => {
    res.json({success: true, data: shops.attempts(res.locals.session, Id.parse(req.params.shopId), Id.parse(req.params.jobId))});
  });
  router.post('/shops/:shopId/jobs/:jobId/cancel', async (req, res) => {
    z.object({}).strict().parse(req.body ?? {});
    const result = await shops.cancel(res.locals.session, Id.parse(req.params.shopId), Id.parse(req.params.jobId), Id.parse(req.get('Idempotency-Key')));
    res.status(result.status).json({success: true, data: result.data});
  });
  app.use((_req, _res) => { throw new ApiError(404, 'not_found'); });
  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    let status = 500, code = 'internal_error';
    if (error instanceof ApiError) { status = error.status; code = error.code; }
    else if (error instanceof z.ZodError) { status = 400; code = 'invalid_request'; }
    else if (error && typeof error === 'object' && 'status' in error && [400, 413, 415].includes(Number(error.status))) { status = Number(error.status); code = status === 413 ? 'request_too_large' : 'invalid_json_request'; }
    res.status(status).json({success: false, error: code});
  });
  return {app, auth, shops, previews, publications};
}
