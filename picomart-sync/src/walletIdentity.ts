import type { HederaNetworkConfig } from './hederaConfig';

type MirrorAccountResponse = {
  account?: string;
  alias?: string | null;
  evm_address?: string | null;
};

const ACCOUNT_ID_PATTERN = /^\d+\.\d+\.\d+$/;
const EVM_ADDRESS_PATTERN = /^0x[a-f0-9]{40}$/i;

export function normalizeWalletId(wallet: string): string {
  return wallet.trim().toLowerCase();
}

export function isHederaAccountId(wallet: string): boolean {
  return ACCOUNT_ID_PATTERN.test(wallet.trim());
}

export function isEvmAddress(wallet: string): boolean {
  return EVM_ADDRESS_PATTERN.test(wallet.trim());
}

export async function resolveWalletAliases(
  net: HederaNetworkConfig | undefined,
  wallet: string,
): Promise<string[]> {
  const aliases = new Set<string>();
  const normalizedWallet = normalizeWalletId(wallet);
  if (!normalizedWallet) {
    return [];
  }

  aliases.add(normalizedWallet);

  if (!net?.mirrorNodeUrl || (!isHederaAccountId(normalizedWallet) && !isEvmAddress(normalizedWallet))) {
    return [...aliases];
  }

  try {
    const baseUrl = net.mirrorNodeUrl.replace(/\/$/, '');
    const response = await fetch(`${baseUrl}/api/v1/accounts/${normalizedWallet}`);

    if (response.status === 404) {
      return [...aliases];
    }

    if (!response.ok) {
      throw new Error(`Mirror node error ${response.status}`);
    }

    const data = await response.json() as MirrorAccountResponse;
    for (const candidate of [data.account, data.alias, data.evm_address]) {
      const normalizedCandidate = candidate ? normalizeWalletId(candidate) : '';
      if (normalizedCandidate) {
        aliases.add(normalizedCandidate);
      }
    }
  } catch (error) {
    console.warn(`Failed to resolve Hedera wallet aliases for ${wallet}:`, error);
  }

  return [...aliases];
}
