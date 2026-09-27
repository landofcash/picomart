import express from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { requireWalletParam } from '../../middleware/validators';
import { getBuyerOrders, getOrderBySeed, getOrderX402Evidence, getSellerOrders, listAllOrders } from '../../controllers/orders.controller';

const router = express.Router({ mergeParams: true });

// GET /api/v1/:network/orders
router.get('/', asyncHandler(listAllOrders));

// GET /api/v1/:network/orders/buyer/:wallet
router.get('/buyer/:wallet', requireWalletParam, asyncHandler(getBuyerOrders));

// GET /api/v1/:network/orders/seller/:wallet
router.get('/seller/:wallet', requireWalletParam, asyncHandler(getSellerOrders));
router.get('/:orderSeed/x402-evidence', asyncHandler(getOrderX402Evidence));
router.get('/:orderSeed', asyncHandler(getOrderBySeed));

export default router;
