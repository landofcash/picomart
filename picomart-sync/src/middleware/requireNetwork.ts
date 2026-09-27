import { Request, Response, NextFunction } from 'express';

export function requireNetwork(req: Request, res: Response, next: NextFunction) {
  if (!req.network) {
    return res.status(400).json({ success: false, error: 'Missing or invalid network' });
  }
  next();
}
