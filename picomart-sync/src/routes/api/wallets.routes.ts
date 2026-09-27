import express from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { listWallets } from '../../controllers/wallets.controller';

const router = express.Router({ mergeParams: true });

// GET /api/v1/:network/wallets
router.get('/', asyncHandler(listWallets));

export default router;
