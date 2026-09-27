import { createHash } from "crypto";

export type StoredMessage = {
  seedKey: string;     // stable string key (base64)
  raw: Buffer;         // protobuf bytes (what you'd send to HCS)
  msgHash: Buffer;     // sha256(raw)
  createdAt: number;
};

const bySeed = new Map<string, StoredMessage[]>();

export function sha256(data: Buffer): Buffer {
  return createHash("sha256").update(data).digest();
}

export function seedToKey(seed: Buffer): string {
  return seed.toString("base64"); // stable, compact key
}

export function addMessage(seed: Buffer, raw: Buffer): StoredMessage {
  const seedKey = seedToKey(seed);
  const msgHash = sha256(raw);

  const item: StoredMessage = {
    seedKey,
    raw,
    msgHash,
    createdAt: Date.now(),
  };

  const list = bySeed.get(seedKey) ?? [];
  list.push(item);
  bySeed.set(seedKey, list);

  return item;
}

export function getMessages(seed: Buffer): StoredMessage[] {
  return bySeed.get(seedToKey(seed)) ?? [];
}
