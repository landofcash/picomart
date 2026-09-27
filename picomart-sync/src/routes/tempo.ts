import express, { Request } from 'express';
import { tempoIndexer, TempoIndexer, TempoProjection, TEMPO_SYNC_DEPLOYMENT } from '../tempoSync';
import { tempoAddress, tempoEntityId } from '../tempoIdentity';
import { sendJson } from '../utils/respond';

/** Public projection; address validation is not caller authentication. */
export function createTempoRouter(indexer: TempoIndexer = tempoIndexer) {
  const router = express.Router();
  router.get('/status', (_req, res) => {
    const status = indexer.status();
    sendJson(res, { success: status.ready, data: status }, status.ready ? 200 : 503);
  });
  const read = (path: string, select: (req: Request, state: TempoProjection) => unknown) => {
    router.get(path, (req, res) => {
      const state = indexer.snapshot();
      if (!state) return sendJson(res, { success: false, error: 'Tempo projection is rebuilding or unavailable', data: indexer.status() }, 503);
      try {
        const value = select(req, state);
        if (value === undefined) return sendJson(res, { success: false, error: 'Entity or payment not indexed' }, 404);
        sendJson(res, { success: true, data: { ...TEMPO_SYNC_DEPLOYMENT, throughBlock: state.throughBlock, ...value as object } });
      } catch { sendJson(res, { success: false, error: 'Malformed EVM address or entity ID/seed' }, 400); }
    });
  };
  read('/wallets/:wallet', req => ({ account: tempoAddress(req.params.wallet), identityProfile: 'evm-address', authenticated: false }));
  read('/catalogs', (_req, state) => ({ catalogs: [...state.catalogs.values()] }));
  read('/catalogs/seller/:wallet', (req, state) => {
    const seller = tempoAddress(req.params.wallet);
    return { catalogs: [...state.catalogs.values()].filter(c => c.seller === seller) };
  });
  read('/catalogs/:id', (req, state) => {
    const catalog = state.catalogs.get(tempoEntityId(req.params.id));
    return catalog ? { catalog } : undefined;
  });
  read('/orders', (_req, state) => ({ orders: [...state.orders.values()] }));
  for (const role of ['buyer', 'seller', 'payer'] as const) read(`/orders/${role}/:wallet`, (req, state) => {
    const account = tempoAddress(req.params.wallet);
    return { orders: [...state.orders.values()].filter(o => o[role] === account) };
  });
  read('/orders/:id/payment-evidence', (req, state) => {
    const order = state.orders.get(tempoEntityId(req.params.id));
    return order?.payment ? { orderId: order.orderId, payment: order.payment, status: order.status,
      deleted: order.deleted, buyer: order.buyer, seller: order.seller, buyerCommitment: order.buyerCommitment,
      confirmation: 'receipt-and-state-verified' } : undefined;
  });
  read('/orders/:id', (req, state) => {
    const order = state.orders.get(tempoEntityId(req.params.id));
    return order ? { order } : undefined;
  });
  router.use((_req, res) => sendJson(res, { success: false, error: 'Tempo API route not found' }, 404));
  return router;
}
