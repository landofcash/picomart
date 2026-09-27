import express from 'express';
import walletsRouter from './api/wallets.routes';
import productsRouter from './api/products.routes';
import ordersRouter from './api/orders.routes';
import { requireNetwork } from '../middleware/requireNetwork';

const router = express.Router({ mergeParams: true });

// Ensure network is present on all API routes
router.use(requireNetwork);
router.use('/wallets', walletsRouter);
router.use('/catalogs', productsRouter);
router.use('/orders', ordersRouter);

export default router;
