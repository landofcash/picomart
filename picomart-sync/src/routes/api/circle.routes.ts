import express from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import {
  // Extra Circle helpers
  createUserToken,
  pinWithWallets,
  getChallengeStatus,
  verifyPinChallenge,
  // Users
  createUser,
  getUser,
  // Wallets
  listWallets,
  getWallet,
  // Addresses
  createAddress,
  listAddresses,
  // Balances
  getBalances,
  // Transactions
  createTransaction,
  getTransaction,
  listTransactions,
  // Challenges
  createChallenge,
  completeChallenge,
  // Webhooks
  circleWebhook,
} from '../../controllers/circle.controller';

const router = express.Router({ mergeParams: true });

// Circle UCW helpers
router.post('/users/token', asyncHandler(createUserToken));
router.post('/users/pin-with-wallets', asyncHandler(pinWithWallets));
router.get('/users/challenges/:challengeId', asyncHandler(getChallengeStatus));
router.post('/users/challenges/pin/verify', asyncHandler(verifyPinChallenge));

// Users
router.post('/users', asyncHandler(createUser));
router.get('/users/:userId', asyncHandler(getUser));

// Wallets
router.get('/wallets', asyncHandler(listWallets));
router.get('/wallets/:walletId', asyncHandler(getWallet));

// Addresses
router.post('/wallets/:walletId/addresses', asyncHandler(createAddress));
router.get('/wallets/:walletId/addresses', asyncHandler(listAddresses));

// Balances
router.get('/wallets/:walletId/balances', asyncHandler(getBalances));

// Transactions
router.post('/transactions', asyncHandler(createTransaction));
router.get('/transactions/:transactionId', asyncHandler(getTransaction));
router.get('/wallets/:walletId/transactions', asyncHandler(listTransactions));

// Challenges
router.post('/challenges', asyncHandler(createChallenge));
router.post('/challenges/:challengeId/complete', asyncHandler(completeChallenge));

// Webhooks (mock placeholder)
router.post('/webhooks/circle', asyncHandler(circleWebhook));

export default router;
