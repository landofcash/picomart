import express, { Request, Response } from 'express';
import cors from 'cors';
import { randomUUID } from 'crypto';
import { appDb } from './cache';
import uploadToBunnyRouter from './routes/api/upload-to-bunny';
import systemRouter from './routes/system';
import { createTempoRouter } from './routes/tempo';
import { sendJson } from './utils/respond';

export function createApp() {
  const app = express();

  // Request ID and simple logging
  app.use((req, _res, next) => {
    (req as any).id = randomUUID(); next(); });
  app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      console.log(JSON.stringify({
        id: (req as any).id,
        method: req.method,
        url: req.originalUrl,
        status: res.statusCode,
        ms: Date.now() - start }));
    });
    next();
  });

  // Middleware
  app.use(cors());
  // A signed catalog request wraps a bounded 1 MB JSON string, including escaping.
  app.use(express.json({ limit: '2mb' }));
  app.use('/', systemRouter);
  app.use('/api/cdn', uploadToBunnyRouter);
  app.use('/api/v1/moderato', createTempoRouter());
  app.use(['/api/v1/:network', '/api/:network'], (_req, res) => {
    sendJson(res, { success: false, error: 'Inherited network API disabled; use /api/v1/moderato' }, 410);
  });
  app.use((err: unknown, _req: Request, res: Response, _next: Function) => {
    const message = err instanceof Error ? err.message : 'Unknown error';
    sendJson(res, { success: false, error: message }, 500);
  });
  return app;
}

/**
 * Configure and start the Express server
 * @param port - The port to listen on
 * @returns A promise that resolves to the actual port the server is listening to
 */
export async function startServer(port: number): Promise<number> {
  const app = createApp();

  // Initialize the database
  await appDb.initialize();

  // Start the server
  return await new Promise<number>((resolve) => {
    const server = app.listen(port, '0.0.0.0', () => {
      const address = server.address();
      const actualPort = typeof address === 'object' && address ? (address.port as number) : port;
      resolve(actualPort);
    });

    // Graceful shutdown hooks
    const close = async () => new Promise<void>((r) => server.close(() => r()));
    process.on('SIGINT', () => { close().then(() => process.exit(0)); });
    process.on('SIGTERM', () => { close().then(() => process.exit(0)); });
  });
}
