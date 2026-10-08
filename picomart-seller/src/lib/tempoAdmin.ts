import { Contract } from 'ethers';
import { PICOMART_TEMPO_CONFIG } from '@picomart/config';
import { marketContract, marketRpc, verifyMarketDeployment } from './tempoMarket';

export function isContractOwner(account: string | undefined, network: string, owner: string | null) {
  return network === PICOMART_TEMPO_CONFIG.network && !!account && !!owner && account.toLowerCase() === owner.toLowerCase();
}

export async function readContractOwner(): Promise<string> {
  await verifyMarketDeployment();
  return String(await marketContract.owner()).toLowerCase();
}

export async function readConfiguredTokenStatus() {
  return Promise.all(PICOMART_TEMPO_CONFIG.paymentTokens.map(async token => ({
    ...token, allowed: Boolean(await marketContract.allowedPaymentTokens(token.tokenId)),
  })));
}

export async function validateTokenChange(account: string, tokenAddress: string, allowed: boolean) {
  const token = PICOMART_TEMPO_CONFIG.paymentTokens.find(t => t.tokenId.toLowerCase() === tokenAddress.toLowerCase());
  if (!token) throw new Error('Only configured payment tokens can be managed here.');
  if (!isContractOwner(account, PICOMART_TEMPO_CONFIG.network, await readContractOwner()))
    throw new Error('Only the current contract owner can manage tokens.');
  if (allowed) {
    const contract = new Contract(token.tokenId, ['function decimals() view returns(uint8)'], marketRpc);
    if (Number(await contract.decimals()) !== 6 || token.decimals !== 6)
      throw new Error('Payment tokens must have 6 decimals on-chain and in configuration.');
  }
}
