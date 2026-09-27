import { getAddress, ZeroAddress } from 'ethers';
import { tempoIdToSeed, tempoSeedToId } from '@picomart/order-protocol/tempo-protocol';

/** Public identity only; this does not authenticate a caller or resolve aliases. */
export function tempoAddress(value: string): string {
  if (!/^0x[0-9a-f]{40}$/i.test(value)) throw new Error('A 20-byte EVM address is required');
  const address = getAddress(value);
  if (address === ZeroAddress) throw new Error('A nonzero EVM address is required');
  return address.toLowerCase();
}

export function tempoEntityId(value: string): string {
  const id = /^0x[0-9a-f]{32}$/i.test(value) ? value.toLowerCase() : tempoSeedToId(value);
  tempoIdToSeed(id); // Reject zero and noncanonical seeds.
  return id;
}
