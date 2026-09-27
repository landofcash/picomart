import { Request, Response } from 'express';
import { sendJson } from '../utils/respond';
import { appDb } from '../cache';
import { config } from '../config';
import { resolveWalletAliases } from '../walletIdentity';
import { OrderSeedSchema, SellerPublicKeySchema, SolidityAddressSchema } from '@picomart/order-protocol';
import { readTopicId } from '../hederaSync';

export async function getCatalogsByWallet(req: Request, res: Response) {
  const { wallet } = req.params as { wallet: string };
  const aliases = await resolveWalletAliases(config.hedera(req.network!), wallet);

  for (const alias of aliases) {
    const catalogs = await appDb.getCatalogsByWallet(alias, req.network!);
    if (catalogs) {
      return sendJson(res, { success: true, data: catalogs });
    }
  }

  sendJson(res, {
    success: true,
    data: {
      id: `${wallet.toLowerCase()}-${req.network!}`,
      sellerWallet: wallet,
      networkName: req.network!,
      catalogs: [],
    },
  });
}

export async function listAllCatalogs(req: Request, res: Response) {
  const catalogs = await appDb.getAllCatalogs(req.network!);
  sendJson(res, { success: true, data: catalogs });
}

export async function getCatalogBySeed(req: Request, res: Response) {
  const parsed = OrderSeedSchema.safeParse(req.params.catalogSeed);
  if (!parsed.success) return sendJson(res, { success: false, error: 'Malformed catalog seed' }, 400);
  const catalog = await appDb.findCatalogBySeed(req.network!, parsed.data);
  if (!catalog || !catalog.catalogUrl) {
    return sendJson(res, { success: false, error: 'Catalog not indexed' }, 404);
  }
  const net = config.hedera(req.network!);
  if (!net) return sendJson(res, { success: false, error: 'Unsupported network' }, 400);
  const aliases = await resolveWalletAliases(net, catalog.sellerWallet);
  const sellerAccountId = aliases.find(alias => /^\d+\.\d+\.\d+$/.test(alias));
  const sellerEvmAddress = aliases.find(alias => SolidityAddressSchema.safeParse(alias).success) ??
    catalog.sellerWallet.toLowerCase();
  const sellerPublicKey = catalog.sellerPubKey;
  if (!sellerAccountId || !SolidityAddressSchema.safeParse(sellerEvmAddress).success ||
      !SellerPublicKeySchema.safeParse(sellerPublicKey).success) {
    return sendJson(res, { success: false, error: 'Catalog identity is incomplete' }, 409);
  }
  const hcsTopicId = await readTopicId(net);
  return sendJson(res, {
    success: true,
    data: {
      catalogSeed: catalog.seed,
      catalogUrl: catalog.catalogUrl,
      sellerAccountId,
      sellerEvmAddress,
      sellerPublicKey,
      contractId: net.contractId ?? '',
      contractEvmAddress: net.contractAddress.toLowerCase(),
      hcsTopicId,
    },
  });
}
