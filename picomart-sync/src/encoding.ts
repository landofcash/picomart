export function bytesToBase64(bytes: Uint8Array | string): string {
  if (typeof bytes === 'string') {
    const clean = bytes.startsWith('0x') ? bytes.slice(2) : bytes;
    return Buffer.from(clean, 'hex').toString('base64');
  }
  return Buffer.from(bytes).toString('base64');
}

export function bytes32ToHex(bytes32: string): `0x${string}` {
  const clean = bytes32.startsWith('0x') ? bytes32 : (`0x${bytes32}`);
  return clean as `0x${string}`;
}

export function isZeroAddress(addr: string): boolean {
  return addr.toLowerCase() === '0x0000000000000000000000000000000000000000';
}
