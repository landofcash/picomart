export type SolidityAddress = `0x${string}`;

/** Legacy 4/8/8-byte packed entity address, independent of retired SDK methods. */
export function hederaEntityIdToSolidityAddress(value: string): SolidityAddress | null {
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value)) return null;
  const [shard, realm, number] = value.split(".").map(BigInt);
  if (shard >= 2n ** 32n || realm >= 2n ** 64n || number >= 2n ** 64n) return null;
  return `0x${shard.toString(16).padStart(8,"0")}${realm.toString(16).padStart(16,"0")}${number.toString(16).padStart(16,"0")}`;
}

export function normalizeSolidityAddress(value: string): SolidityAddress | null {
  const trimmed = value.trim();
  if (!/^0x[0-9a-fA-F]{40}$/.test(trimmed)) {
    return null;
  }
  return trimmed.toLowerCase() as SolidityAddress;
}

export function solidityEntityAddressToId(value: string): string | null {
  const address = normalizeSolidityAddress(value);
  if (!address) {
    return null;
  }

  const bytes = address.slice(2);
  return [
    BigInt(`0x${bytes.slice(0, 8)}`),
    BigInt(`0x${bytes.slice(8, 24)}`),
    BigInt(`0x${bytes.slice(24)}`),
  ].join(".");
}
