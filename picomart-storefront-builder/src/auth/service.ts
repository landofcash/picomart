import {randomBytes, randomUUID} from 'node:crypto';
import {verifyMessage} from 'ethers';
import type {Config, Network} from '../config.ts';
import {TEMPO_CHAIN_ID,TEMPO_CONTRACT_ADDRESS} from '../tempo.ts';
import {ApiError} from '../domain/errors.ts';
import {ChallengeSchema, SessionSchema, type Challenge, type Session} from '../domain/records.ts';
import {Journal} from '../storage/journal.ts';
import {sha256} from '../storage/bunny.ts';
import type {IdentityProvider} from './identity.ts';

export class AuthService {
  readonly journal: Journal;
  readonly identity: IdentityProvider;
  readonly config: Config;
  readonly now: () => number;
  constructor(journal: Journal, identity: IdentityProvider, config: Config, now: () => number = Date.now) {
    this.journal = journal; this.identity = identity; this.config = config; this.now = now;
  }
  async challenge(network: Network, accountId: string, origin: string) {
    const identity = await this.identity.account(network, accountId);
    const id = randomUUID(), issuedAt = new Date(this.now()).toISOString(), expiresAt = new Date(this.now() + this.config.challengeTtl).toISOString();
    const message = [
      'Picomart Storefront Builder sign in',
      'Sign this message to manage your storefronts. This does not authorize a transaction.',
      `Origin: ${origin}`, `Account: ${accountId}`, `Network: ${network}`,
      `Chain ID: ${TEMPO_CHAIN_ID}`, `Contract: ${TEMPO_CONTRACT_ADDRESS}`, `Challenge: ${id}`, `Issued At: ${issuedAt}`, `Expires At: ${expiresAt}`,
    ].join('\n');
    const value = ChallengeSchema.parse({schemaVersion: 2, kind: 'challenge', id, network, ownerAccountId: accountId, origin, signerAddress: identity.signerAddress,
      recordVersion: 1, createdAt: issuedAt, updatedAt: issuedAt, expiresAt, consumedAt: null, message});
    const data = {challengeId: id, accountId, network, chainId:TEMPO_CHAIN_ID, contractAddress:TEMPO_CONTRACT_ADDRESS, origin, message, expiresAt, issuedAt};
    await this.journal.transact(null, async () => ({changes: [value], result: {status: 201, data}}));
    return data;
  }
  async verify(network: Network, accountId: string, challengeId: string, signature: string, origin: string) {
    const identity = await this.identity.account(network, accountId);
    const token = randomBytes(32).toString('base64url'), tokenHash = sha256(token);
    const result = await this.journal.transact(null, async () => {
      const challenge = this.journal.get<Challenge>('challenge', network, accountId, challengeId);
      if (!challenge || challenge.origin !== origin || challenge.consumedAt || Date.parse(challenge.expiresAt) <= this.now()) throw new ApiError(401, 'invalid_or_expired_challenge');
      let signer: string;
      try { signer = verifyMessage(challenge.message, signature).toLowerCase(); }
      catch { throw new ApiError(401, 'invalid_signature'); }
      if (signer !== challenge.signerAddress || signer !== identity.signerAddress) throw new ApiError(401, 'invalid_signature');
      const now = new Date(this.now()).toISOString();
      const session = SessionSchema.parse({schemaVersion: 2, kind: 'session', id: tokenHash, network, ownerAccountId: accountId, origin, signerAddress: signer,
        recordVersion: 1, createdAt: now, updatedAt: now, expiresAt: new Date(this.now() + this.config.sessionTtl).toISOString(), revokedAt: null});
      return {changes: [{...challenge, recordVersion: challenge.recordVersion + 1, updatedAt: now, consumedAt: now}, session],
        result: {status: 200, data: {accountId, network, expiresAt: session.expiresAt}}};
    });
    // Only the hash is persisted; the credential exists in this response and client memory.
    return {...result.data as object, token};
  }
  current(session: Session): Session {
    const current = this.journal.get<Session>('session', session.network, session.ownerAccountId, session.id);
    if (!current || current.revokedAt || Date.parse(current.expiresAt) <= this.now()) throw new ApiError(401, 'session_expired');
    return current;
  }
  async authenticate(network: Network, authorization: string | undefined, origin: string): Promise<Session> {
    const match = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(authorization || '');
    if (!match) throw new ApiError(401, 'authentication_required');
    const tokenHash = sha256(match[1]);
    const found = this.journal.list<Session>('session', value => value.network === network && value.id === tokenHash && value.origin === origin)[0];
    if (!found) throw new ApiError(401, 'invalid_session');
    const session = this.current(found), identity = await this.identity.account(network, session.ownerAccountId);
    if (identity.signerAddress !== session.signerAddress) throw new ApiError(401, 'account_key_changed');
    return this.current(session);
  }
  async logout(session: Session) {
    await this.journal.transact(null, async () => {
      const current = this.current(session), now = new Date(this.now()).toISOString();
      return {changes: [{...current, recordVersion: current.recordVersion + 1, updatedAt: now, revokedAt: now}], result: {status: 200, data: {signedOut: true}}};
    });
  }
}
