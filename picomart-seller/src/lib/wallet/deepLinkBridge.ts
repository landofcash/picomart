import type {EntryFunctionPayload} from "@/context/wallet/types";
import {buildConnectLink, buildSignAndSubmitLink, buildSignMessageLink} from "./petraDeepLink";
import {APP_KEY_PREFIX, APP_NAME} from "@/config";
import {
  base64EncodeUtf8Json,
  base64DecodeUtf8ToObj,
  bytesToHex,
  utf8ToBytes,
  randomNonce24,
  encryptAfter,
  generateEphemeralBoxKeyPair,
  hexToBytes,
  deriveSharedSecretAfter
} from './petraCrypto';

const RESULT_PREFIX = `${APP_KEY_PREFIX}-petra:result:`;
const PENDING_PREFIX = `${APP_KEY_PREFIX}-petra:pending:`;
const EPHEMERAL_SK_KEY = `${APP_KEY_PREFIX}-petra:ephemeralSecretKey`;
const SHARED_SECRET_KEY = `${APP_KEY_PREFIX}-petra:sharedEncryptionSecretKey`;
const EPHEMERAL_SK_PER_STATE = `${APP_KEY_PREFIX}-petra:eph:`; // + state
const LAST_PENDING_STATE_KEY = `${APP_KEY_PREFIX}-petra:lastPendingState`;

// Logging: funnel to reusable app logger as plain string for the 'petra' category
function logPetra(entry:unknown) {
  const msg = typeof entry === 'string' ? entry : JSON.stringify(entry);
  console.log('petra', msg);
}

function uuid(): string {
  const a = new Uint8Array(16);
  crypto.getRandomValues(a);
  // RFC4122 v4 format
  a[6] = (a[6] & 0x0f) | 0x40;
  a[8] = (a[8] & 0x3f) | 0x80;
  const seg = (i: number, l: number) => Array.from(a.slice(i, i + l)).map(b => b.toString(16).padStart(2, '0')).join('');
  return `${seg(0, 4)}-${seg(4, 2)}-${seg(6, 2)}-${seg(8, 2)}-${seg(10, 6)}`;
}

function currentOrigin(): string {
  if (typeof window === 'undefined') return '';
  return window.location.origin;
}

function currentPath(): string {
  if (typeof window === 'undefined') return '/';
  return window.location.pathname + window.location.search + window.location.hash;
}

export type DeepLinkAction = 'connect' | 'signMessage' | 'signAndSubmit';

export interface DeepLinkResult {
  ok: boolean;
  state: string;
  action: DeepLinkAction;
  address?: string;
  signature?: string; // hex or base64
  hash?: string;
  error?: string;
}

export function getRedirectUri(): string {
  return `${currentOrigin()}/wallet/petra/callback`;
}

function buildRedirectLink(action: DeepLinkAction, state: string): string {
  return `${getRedirectUri()}?action=${encodeURIComponent(action)}&state=${encodeURIComponent(state)}`;
}

function awaitResult(state: string, timeoutMs = 150000): Promise<DeepLinkResult> {
  return new Promise((resolve, reject) => {
    const key = RESULT_PREFIX + state;

    let to: ReturnType<typeof setTimeout> | null = null;
    const cleanup = () => {
      window.removeEventListener('storage', onStorage);
      if (to) {
        clearTimeout(to);
        to = null;
      }
    };

    const onStorage = (ev: StorageEvent) => {
      if (ev.key !== key) return;
      try {
        const val = ev.newValue;
        if (!val) return;
        const res: DeepLinkResult = JSON.parse(val);
        localStorage.removeItem(key);
        cleanup();
        logPetra({phase: 'awaitResult.storage', state, res});
        if (res.ok) resolve(res); else reject(new Error(res.error || 'Deep link failed'));
      } catch (e: unknown) {
        cleanup();
        logPetra({phase: 'awaitResult.error', state, error: e});
        reject(e);
      }
    };

    // Also, check immediately in case the callback already set it
    try {
      const pre = localStorage.getItem(key);
      if (pre) {
        const res: DeepLinkResult = JSON.parse(pre);
        localStorage.removeItem(key);
        logPetra({phase: 'awaitResult.pre', state, res});
        if (res.ok) resolve(res); else reject(new Error(res.error || 'Deep link failed'));
        return;
      }
    } catch (e: unknown) {
      logPetra({phase: 'awaitResult.preError', state, error: e});
    }

    window.addEventListener('storage', onStorage);

    to = setTimeout(() => {
      cleanup();
      logPetra({phase: 'awaitResult.timeout', state});
      reject(new Error('Deep link timed out'));
    }, timeoutMs);
  });
}

export async function startConnect(): Promise<string> {
  const state = uuid();
  const originPath = currentPath();
  const record = {action: 'connect', createdAt: Date.now(), origin: originPath};

  localStorage.setItem(PENDING_PREFIX + state, JSON.stringify(record));
  localStorage.setItem(LAST_PENDING_STATE_KEY, state);
  // Persist intent so WalletContext attempts external reconnect after reload
  localStorage.setItem(`${APP_KEY_PREFIX}-walletKind`, 'external');
  localStorage.setItem(`${APP_KEY_PREFIX}-externalProviderId`, 'petra');

  // Generate ephemeral NaCl box keypair and store secret for callback
  const kp = generateEphemeralBoxKeyPair();
  const ephSkHex = bytesToHex(kp.secretKey);
  sessionStorage.setItem(EPHEMERAL_SK_KEY, ephSkHex); // keep for same-context resume
  localStorage.setItem(EPHEMERAL_SK_PER_STATE + state, ephSkHex); // per-state fallback for fresh context
  localStorage.setItem(PENDING_PREFIX + state, JSON.stringify({...record, ephSkHex}));

  const data = {
    appInfo: {domain: currentOrigin(), name: APP_NAME},
    redirectLink: buildRedirectLink('connect', state),
    dappEncryptionPublicKey: bytesToHex(kp.publicKey),
  };
  const dataB64 = base64EncodeUtf8Json(data);
  logPetra({phase: 'startConnect', state, data});
  window.location.replace(buildConnectLink(dataB64));
  const res = await awaitResult(state);
  if (!res.ok || !res.address) throw new Error(res.error || 'Connect failed');
  return res.address;
}

export async function startSignMessage(message: string): Promise<string> {
  const state = uuid();
  const originPath = currentPath();
  const record = {action: 'signMessage', createdAt: Date.now(), origin: originPath, message};
  localStorage.setItem(PENDING_PREFIX + state, JSON.stringify(record));
  localStorage.setItem(LAST_PENDING_STATE_KEY, state);

  const sharedHex = sessionStorage.getItem(SHARED_SECRET_KEY) || localStorage.getItem(SHARED_SECRET_KEY);
  if (!sharedHex) throw new Error('Petra not connected: missing shared encryption key');

  const nonce = randomNonce24();
  const cipher = encryptAfter(utf8ToBytes(message), nonce, hexToBytes(sharedHex));

  const data = {
    appInfo: {domain: currentOrigin(), name: APP_NAME},
    redirectLink: buildRedirectLink('signMessage', state),
    payload: bytesToHex(cipher),
    nonce: bytesToHex(nonce),
  };
  const dataB64 = base64EncodeUtf8Json(data);
  logPetra({phase: 'startSignMessage', state, data: {...data, payload: '[hex]', nonce: '[hex]'}});
  window.location.replace(buildSignMessageLink(dataB64));
  const res = await awaitResult(state);
  if (!res.ok || !res.signature) throw new Error(res.error || 'Sign message failed');
  return res.signature;
}

export async function startSignAndSubmit(payload: EntryFunctionPayload): Promise<string> {
  const state = uuid();
  const originPath = currentPath();
  const record = {action: 'signAndSubmit', createdAt: Date.now(), origin: originPath, payload};
  localStorage.setItem(PENDING_PREFIX + state, JSON.stringify(record));
  localStorage.setItem(LAST_PENDING_STATE_KEY, state);

  const sharedHex = sessionStorage.getItem(SHARED_SECRET_KEY) || localStorage.getItem(SHARED_SECRET_KEY);
  if (!sharedHex) throw new Error('Petra not connected: missing shared encryption key');

  const payloadJson = JSON.stringify({
    type: 'entry_function_payload',
    function: payload.function,
    type_arguments: payload.type_arguments ?? [],
    arguments: payload.arguments,
  });
  const nonce = randomNonce24();
  const cipher = encryptAfter(utf8ToBytes(payloadJson), nonce, hexToBytes(sharedHex));

  const data = {
    appInfo: {domain: currentOrigin(), name: APP_NAME},
    redirectLink: buildRedirectLink('signAndSubmit', state),
    payload: bytesToHex(cipher),
    nonce: bytesToHex(nonce),
  };
  const dataB64 = base64EncodeUtf8Json(data);
  logPetra({phase: 'startSignAndSubmit', state, data: {...data, payload: '[hex]', nonce: '[hex]'}});
  window.location.replace(buildSignAndSubmitLink(dataB64));
  const res = await awaitResult(state);
  if (!res.ok || !res.hash) throw new Error(res.error || 'Transaction failed');
  return res.hash;
}

export function readPending(state: string) {
  const key = PENDING_PREFIX + state;
  const s = localStorage.getItem(key) ?? sessionStorage.getItem(key);
  if (!s) return null;
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

export function handlePetraCallback(): void {
  try {
    const url = new URL(window.location.href);
    const sp = url.searchParams;
    const state = sp.get('state') || '';
    const response = sp.get('response') || '';
    const actionParam = (sp.get('action') as DeepLinkAction | null);
    const pending = state ? readPending(state) : null;
    const action: DeepLinkAction = actionParam || pending?.action || 'connect';
    const key = RESULT_PREFIX + state;

    const finish = (res:unknown, redirectToOrigin = true) => {
      localStorage.setItem(key, JSON.stringify(res));
      localStorage.setItem(LAST_PENDING_STATE_KEY, state);
      logPetra({phase: 'callbackFinish', state, action, res});
      const originPath = pending?.origin || '/';
      if (redirectToOrigin) {
        window.location.replace(originPath);
      }
    };

    if (!state) {
      finish({ok: false, state: '', action, error: 'Missing state'});
      return;
    }

    if (response !== 'approved') {
      const error = sp.get('error') || 'User rejected or wallet error';
      finish({ok: false, state, action, error});
      return;
    }

    // Approved flow
    const dataB64 = sp.get('data');
    if (!dataB64) {
      finish({ok: false, state, action, error: 'Missing data'});
      return;
    }
    logPetra({dataB64});
    const data = base64DecodeUtf8ToObj<{
      petraPublicEncryptedKey:string,
      address:string,
      signature:string,
      hash:string,
    }>(dataB64);
    if (action === 'connect') {
      const petraPubHex: string | undefined = data?.petraPublicEncryptedKey;
      if (!petraPubHex) {
        finish({ok: false, state, action, error: 'Missing petraPublicEncryptedKey in data'});
        return;
      }
      const ephFromSession = sessionStorage.getItem(EPHEMERAL_SK_KEY);
      const ephFromLocal = localStorage.getItem(EPHEMERAL_SK_PER_STATE + state);
      const ephFromPending = pending && pending.ephSkHex ? String(pending.ephSkHex) : null;
      const ephHex = ephFromSession || ephFromLocal || ephFromPending;
      if (!ephHex) {
        logPetra({
          phase: 'callback.noEph',
          state,
          haveSession: !!ephFromSession,
          haveLocal: !!ephFromLocal,
          havePending: !!ephFromPending
        });
        finish({ok: false, state, action, error: 'Missing ephemeral secret key'});
        return;
      }
      try {
        const shared = deriveSharedSecretAfter(petraPubHex, hexToBytes(ephHex));
        const sharedHex = bytesToHex(shared);
        sessionStorage.setItem(SHARED_SECRET_KEY, sharedHex);
        localStorage.setItem(SHARED_SECRET_KEY, sharedHex);
        sessionStorage.removeItem(EPHEMERAL_SK_KEY);
        localStorage.removeItem(EPHEMERAL_SK_PER_STATE + state);
        localStorage.removeItem(PENDING_PREFIX + state);

      } catch (e: unknown) {
        finish({ok: false, state, action, error: e});
        return;
      }
      const address = data?.address || undefined;
      if (address) {
        localStorage.setItem(`${APP_KEY_PREFIX}-petra:last_address`, address);
        localStorage.setItem(`${APP_KEY_PREFIX}-walletKind`, 'external');
        localStorage.setItem(`${APP_KEY_PREFIX}-externalProviderId`, 'petra');
      }
      finish({ok: true, state, action, address});
      return;
    }

    if (action === 'signMessage') {
      const signature = data?.signature || undefined;
      if (!signature) {
        finish({ok: false, state, action, error: 'Missing signature'});
        return;
      }
      finish({ok: true, state, action, signature});
      return;
    }

    if (action === 'signAndSubmit') {
      const hash = data?.hash || undefined;
      if (!hash) {
        finish({ok: false, state, action, error: 'Missing transaction hash'});
        return;
      }
      finish({ok: true, state, action, hash});
      return;
    }

    finish({ok: false, state, action, error: 'Unknown action'});
  } catch (e) {
    logPetra({phase: 'callbackCrashed', error: e});
    // As a last resort, try to redirect home
    window.location.replace('/');
  }
}
