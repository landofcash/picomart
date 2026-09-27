import { Request, Response, NextFunction } from 'express';

export type Network = 'testnet' | 'mainnet';

declare global {
  namespace Express {
    interface Request {
      network?: Network;
    }
  }
}

export function networkParam(req: Request, res: Response, next: NextFunction, value: string) {
  const v = value?.toLowerCase?.();
  const map: Record<string, Network> = {
    t: 'testnet', testnet: 'testnet',
    m: 'mainnet', mainnet: 'mainnet',
  };
  const mapped = map[v as keyof typeof map];
  if (!mapped) return res.status(400).json({ success: false, error: 'Invalid network: use t|m or testnet|mainnet' });
  req.network = mapped;
  next();
}
