import path from "path";
import protobuf from "protobufjs";

export type MessageV1Dto = {
  v: number;
  seed: Buffer;       // 22 bytes
  sender: string;
  prevHash: Buffer;   // 32 bytes
  encrypted: Buffer;  // any length
};

let _MessageV1: protobuf.Type | null = null;

async function getMessageType(): Promise<protobuf.Type> {
  if (_MessageV1) return _MessageV1;

  const protoPath = path.join(process.cwd(), "src", "proto", "message.proto");
  const root = await protobuf.load(protoPath);
  const t = root.lookupType("picomart.hcs.MessageV1");
  _MessageV1 = t as protobuf.Type;
  return _MessageV1;
}

export async function encodeMessageV1(dto: MessageV1Dto): Promise<Buffer> {
  validateMessage(dto);

  const MessageV1 = await getMessageType();

  // protobufjs prefers Uint8Array for bytes fields
  const payload = {
    v: dto.v,
    seed: dto.seed,
    sender: dto.sender,
    prev_hash: dto.prevHash,
    encrypted: dto.encrypted,
  };

  const err = MessageV1.verify(payload);
  if (err) throw new Error(`MessageV1 verify failed: ${err}`);

  const message = MessageV1.create(payload);
  const bytes = MessageV1.encode(message).finish();
  return Buffer.from(bytes);
}

export async function decodeMessageV1(raw: Buffer): Promise<MessageV1Dto> {
  const MessageV1 = await getMessageType();
  const decoded = MessageV1.decode(raw) as any;

  const dto: MessageV1Dto = {
    v: decoded.v ?? 0,
    seed: Buffer.from(decoded.seed ?? []),
    sender: String(decoded.sender ?? ""),
    prevHash: Buffer.from(decoded.prev_hash ?? []),
    encrypted: Buffer.from(decoded.encrypted ?? []),
  };

  validateDecodedMessage(dto);
  return dto;
}

function validateMessage(dto: MessageV1Dto) {
  if (dto.v !== 1) throw new Error("MessageV1.v must be 1");
  if (!Buffer.isBuffer(dto.seed) || dto.seed.length !== 22) throw new Error("seed must be 22 bytes");
  if (typeof dto.sender !== "string" || dto.sender.length === 0) throw new Error("sender is required");
  if (!Buffer.isBuffer(dto.prevHash) || dto.prevHash.length !== 32) throw new Error("prev_hash must be 32 bytes");
  if (!Buffer.isBuffer(dto.encrypted) || dto.encrypted.length === 0) throw new Error("encrypted is required");
}

function validateDecodedMessage(dto: MessageV1Dto) {
  // same rules as encoding (plus allow v=1 only for now)
  validateMessage(dto);
}
