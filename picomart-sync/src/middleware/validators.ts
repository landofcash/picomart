import { Request, Response, NextFunction } from 'express';
import { sendJson } from '../utils/respond';

export function requireWalletParam(req: Request, res: Response, next: NextFunction) {
  const { wallet } = req.params as { wallet?: string };
  if (!wallet) {
    return sendJson(res, { success: false, error: 'Wallet address is required' }, 400);
  }
  next();
}
