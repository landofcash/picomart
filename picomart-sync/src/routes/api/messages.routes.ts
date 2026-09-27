import express from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { requireWalletParam } from '../../middleware/validators';
import {  postMessage,  getMessagesBySeed,} from '../../controllers/messages.controller';

const router = express.Router({ mergeParams: true });

/**
 * POST /api/v1/:network/messages/:seed
 * Body: { sender, encrypted, prevHash }
 */
router.post('/:seed', requireWalletParam, asyncHandler(postMessage));

/**
 * GET /api/v1/:network/messages/:seed
 * Returns a list of messages for a seed (mock)
 */
router.get('/:seed', asyncHandler(getMessagesBySeed));

export default router;
