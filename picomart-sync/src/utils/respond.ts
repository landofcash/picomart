import { Response } from 'express';

export function sendJson(res: Response, body: unknown, status = 200) {
  const safe = JSON.stringify(body, (_k, v) => (typeof v === 'bigint' ? v.toString() : v));
  res.status(status).set('Content-Type', 'application/json').send(safe);
}
