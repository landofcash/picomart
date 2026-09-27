import { Request, Response } from 'express';
import { randomUUID } from 'crypto';
import axios from 'axios';
import { sendJson } from '../utils/respond';
import { ApiResponse } from '../types/types';
import '../config';
import {
  Blockchain,
  CircleUserControlledWalletsClient,
  initiateUserControlledWalletsClient
} from '@circle-fin/user-controlled-wallets';

function notImplemented(res: Response, name: string) {
  const response: ApiResponse<any> = {
    success: true,
    data: { message: `${name} not implemented yet` },
  } as any;
  sendJson(res, response);
}

// Lazy Circle client singleton
let circleClient: CircleUserControlledWalletsClient | null = null;
function getCircleClient() {
  if (!circleClient) {
    const apiKey = process.env.CIRCLE_API_KEY;
    if (!apiKey) throw new Error('Missing CIRCLE_API_KEY');
    circleClient = initiateUserControlledWalletsClient({ apiKey });
  }
  return circleClient;
}

// Simple in-memory user token cache
const userTokenCache = new Map<string, { userToken: string; encryptionKey: string; exp: number }>();


// Users
export async function createUser(_req: Request, res: Response) {
  try {
    const client = getCircleClient();
    const userId = randomUUID();
    const response = await client.createUser({ userId });
    const user = { id: response.data?.id??userId, userId };
    sendJson(res, { success: true, data: { user } } satisfies ApiResponse<any>);
  } catch (err: any) {
    sendJson(res, { success: false, error: err?.message || 'Failed to create user' } satisfies ApiResponse<never>, 500);
  }
}

export const getUser = (_req: Request, res: Response) => notImplemented(res, 'getUser');

export async function createUserToken(req: Request, res: Response) {
  try {
    const { userId } = (req.body || {}) as { userId?: string };
    if (!userId) return sendJson(res, { success: false, error: 'userId is required' } satisfies ApiResponse<never>, 400);

    const now = Math.floor(Date.now() / 1000);
    const cached = userTokenCache.get(userId);
    if (cached && cached.exp - now > 60) {
      return sendJson(res, { success: true, data: { userToken: cached.userToken, encryptionKey: cached.encryptionKey, cached: true, expiresIn: cached.exp - now } } satisfies ApiResponse<any>);
    }

    const client = getCircleClient();
    const response = await client.createUserToken({ userId });
    const userToken = response?.data?.userToken;
    const encryptionKey = response?.data?.encryptionKey;
    if (!userToken || !encryptionKey) {
      return sendJson(res, { success: false, error: 'Failed to create user token' } satisfies ApiResponse<never>, 500);
    }
    const exp = now + 3500; // ~58 minutes
    userTokenCache.set(userId, { userToken, encryptionKey, exp });
    sendJson(res, { success: true, data: { userToken, encryptionKey, cached: false, expiresIn: exp - now } } satisfies ApiResponse<any>);
  } catch (err: any) {
    sendJson(res, { success: false, error: err?.message || 'Failed to create user token' } satisfies ApiResponse<never>, 500);
  }
}

export const listWallets = (_req: Request, res: Response) => notImplemented(res, 'listWallets');
export const getWallet = (_req: Request, res: Response) => notImplemented(res, 'getWallet');

// Addresses
export const createAddress = (_req: Request, res: Response) => notImplemented(res, 'createAddress');
export const listAddresses = (_req: Request, res: Response) => notImplemented(res, 'listAddresses');

// Balances
export const getBalances = (_req: Request, res: Response) => notImplemented(res, 'getBalances');

// Transactions
export const createTransaction = (_req: Request, res: Response) => notImplemented(res, 'createTransaction');
export const getTransaction = (_req: Request, res: Response) => notImplemented(res, 'getTransaction');
export const listTransactions = (_req: Request, res: Response) => notImplemented(res, 'listTransactions');

// Challenges
export async function pinWithWallets(req: Request, res: Response) {
  try {
    const { userToken, blockchains, metadata, accountType, idempotencyKey } = (req.body || {}) as {
      userToken?: string;
      blockchains?: string[];
      metadata?: { name?: string }[];
      accountType?: 'EOA' | 'SCA';
      idempotencyKey?: string;
    };
    if (!userToken) {
      return sendJson(res, { success: false, error: 'userToken is required' } satisfies ApiResponse<never>, 400);
    }
    if (!blockchains || !Array.isArray(blockchains) || blockchains.length < 1) {
      return sendJson(res, { success: false, error: 'blockchains is required' } satisfies ApiResponse<never>, 400);
    }
    const client = getCircleClient();
    const response = await (client as any).createUserPinWithWallets({ userToken, blockchains, metadata, accountType, idempotencyKey });
    console.log('createUserPinWithWallets response:', response.data);
    const challengeId = response?.data?.challengeId;
    if (!challengeId) return sendJson(res, { success: false, error: 'Failed to create PIN + wallets challenge' } satisfies ApiResponse<never>, 500);
    sendJson(res, { success: true, data: { challengeId } } satisfies ApiResponse<any>);
  } catch (err: any) {
    sendJson(res, { success: false, error: err?.message || 'Failed to create PIN + wallets challenge' } satisfies ApiResponse<never>, 500);
  }
}

export async function getChallengeStatus(req: Request, res: Response) {
  try {
    const challengeId = req.params.challengeId;
    const userToken = String((req.query as any)?.userToken || '');
    if (!challengeId) return sendJson(res, { success: false, error: 'challengeId is required' } satisfies ApiResponse<never>, 400);
    if (!userToken) return sendJson(res, { success: false, error: 'userToken is required' } satisfies ApiResponse<never>, 400);
    const client = getCircleClient();
    const response = await (client as any).getUserChallenge({ userToken, challengeId });
    console.log('getUserChallenge response:', response.data);
    const challenge = response?.data?.challenge;
    sendJson(res, { success: true, data: { challenge } } satisfies ApiResponse<any>);
  } catch (err: any) {
    sendJson(res, { success: false, error: err?.message || 'Failed to get challenge' } satisfies ApiResponse<never>, 500);
  }
}

export async function verifyPinChallenge(req: Request, res: Response) {
  try {
    const { userToken, challengeId, encryptedPin } = (req.body || {}) as { userToken?: string; challengeId?: string; encryptedPin?: string };
    if (!userToken) return sendJson(res, { success: false, error: 'userToken is required' } satisfies ApiResponse<never>, 400);
    if (!challengeId) return sendJson(res, { success: false, error: 'challengeId is required' } satisfies ApiResponse<never>, 400);
    if (!encryptedPin) return sendJson(res, { success: false, error: 'encryptedPin is required' } satisfies ApiResponse<never>, 400);
    const baseUrl = 'https://api.circle.com/v1/w3s';
    const url = `${baseUrl}/users/challenges/${encodeURIComponent(challengeId)}/verify`;
    const apiKey = process.env.CIRCLE_API_KEY;
    if (!apiKey) throw new Error('Missing CIRCLE_API_KEY');
    const r = await axios.post(url, { encryptedPin }, { headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}`, 'X-User-Token': userToken } });
    sendJson(res, { success: true, data: { ok: true, submitted: true, response: r.data } } satisfies ApiResponse<any>);
  } catch (err: any) {
    const status = err?.response?.status || 500;
    const details = err?.response?.data || err?.message || 'Failed to submit PIN challenge';
    sendJson(res, { success: false, error: typeof details === 'string' ? details : JSON.stringify(details) } satisfies ApiResponse<never>, status);
  }
}

export const createChallenge = (_req: Request, res: Response) => notImplemented(res, 'createChallenge');
export const completeChallenge = (_req: Request, res: Response) => notImplemented(res, 'completeChallenge');

// Webhooks
export const circleWebhook = (_req: Request, res: Response) => notImplemented(res, 'circleWebhook');
