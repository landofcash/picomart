import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PICOMART_TEMPO_CONFIG } from '@picomart/config';
import { isContractOwner, readConfiguredTokenStatus, validateTokenChange } from './tempoAdmin';

const mocks = vi.hoisted(() => ({ owner: vi.fn(), allowed: vi.fn(), verify: vi.fn(), decimals: vi.fn() }));
vi.mock('./tempoMarket', () => ({ marketContract: { owner: mocks.owner, allowedPaymentTokens: mocks.allowed }, marketRpc: {}, verifyMarketDeployment: mocks.verify }));
vi.mock('ethers', () => ({ Contract: class { decimals = mocks.decimals; } }));
const account = '0x' + 'ab'.repeat(20);
const token = PICOMART_TEMPO_CONFIG.paymentTokens[0];
beforeEach(() => {
  vi.resetAllMocks(); mocks.owner.mockResolvedValue(account); mocks.decimals.mockResolvedValue(6n);
  mocks.allowed.mockImplementation(async (address: string) => address === token.tokenId);
});
describe('token administration', () => {
  it('requires the live owner on the configured network', () => {
    expect(isContractOwner(account.toUpperCase(), PICOMART_TEMPO_CONFIG.network, account)).toBe(true);
    expect(isContractOwner(account, 'mainnet', account)).toBe(false);
    expect(isContractOwner(undefined, PICOMART_TEMPO_CONFIG.network, account)).toBe(false);
    expect(isContractOwner(account, PICOMART_TEMPO_CONFIG.network, null)).toBe(false);
  });
  it('reads every configured token, including tokens not yet allowed', async () => {
    const result = await readConfiguredTokenStatus();
    expect(result.map(t => t.tokenId)).toEqual(PICOMART_TEMPO_CONFIG.paymentTokens.map(t => t.tokenId));
    expect(result[0].allowed).toBe(true);
    expect(result.slice(1).every(t => !t.allowed)).toBe(true);
  });
  it('rejects unconfigured tokens and ownership changes before signing', async () => {
    await expect(validateTokenChange(account, '0x' + '12'.repeat(20), true)).rejects.toThrow('Only configured');
    mocks.owner.mockResolvedValue('0x' + 'cd'.repeat(20));
    await expect(validateTokenChange(account, token.tokenId, true)).rejects.toThrow('current contract owner');
  });
  it('checks deployment and six decimals when enabling, but permits disabling an incompatible token', async () => {
    await expect(validateTokenChange(account, token.tokenId, true)).resolves.toBeUndefined();
    expect(mocks.verify).toHaveBeenCalled();
    mocks.decimals.mockResolvedValue(18n);
    await expect(validateTokenChange(account, token.tokenId, true)).rejects.toThrow('6 decimals');
    await expect(validateTokenChange(account, token.tokenId, false)).resolves.toBeUndefined();
    mocks.verify.mockRejectedValue(new Error('Deployment mismatch'));
    await expect(validateTokenChange(account, token.tokenId, true)).rejects.toThrow('Deployment mismatch');
  });
});
