import { Request, Response } from 'express';
import { sendJson } from '../utils/respond';
import { appDb } from '../cache';
import { ApiResponse } from '../types/types';

export async function listWallets(req: Request, res: Response) {
  const network = req.network!;
  const allCatalogs = await appDb.getAllCatalogs(network);
  const walletSummary = allCatalogs.map(store => ({
    wallet: store.sellerWallet,
    catalogCount: store.catalogs.length,
  }));
  const response: ApiResponse<any> = { success: true, data: walletSummary };
  sendJson(res, response);
}
