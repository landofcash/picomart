export function seedStringToBytes32(seed: string): `0x${string}` {
  const buf = Buffer.from(seed, 'utf8');
  const out = Buffer.alloc(32);
  buf.copy(out, 0, 0, Math.min(buf.length, 32));
  return (`0x${out.toString('hex')}`) as `0x${string}`;
}

export function bytes32ToSeedString(bytes32: string): string {
  const clean = bytes32.startsWith('0x') ? bytes32.slice(2) : bytes32;
  const buf = Buffer.from(clean.padStart(64, '0'), 'hex');
  let end = buf.length;
  while (end > 0 && buf[end - 1] === 0) end--;
  return buf.subarray(0, end).toString('utf8');
}
