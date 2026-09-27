import { Request, Response } from "express";
import { addMessage, getMessages } from "../stores/messages.store";
import { decodeMessageV1, encodeMessageV1 } from "../proto/messageCodec";

export async function postMessage(req: Request, res: Response) {
  const seedParam = req.params.seed;
  const { sender, encrypted, prevHash } = req.body;

  if (!seedParam) return res.status(400).json({ error: "seed is required" });
  if (!sender || typeof sender !== "string") return res.status(400).json({ error: "sender is required" });
  if (!encrypted || typeof encrypted !== "string") return res.status(400).json({ error: "encrypted is required (base64)" });
  if (!prevHash || typeof prevHash !== "string") return res.status(400).json({ error: "prevHash is required (0x..)" });

  const seed = parseSeed(seedParam);
  const prev = parseHex32(prevHash);
  const encryptedBytes = parseBase64(encrypted);

  // Build protobuf DTO
  const dto = {
    v: 1,
    seed,
    sender,
    prevHash: prev,
    encrypted: encryptedBytes,
  };

  // Encode raw protobuf bytes (these bytes are what you will later send to HCS)
  const raw = await encodeMessageV1(dto);

  // Store raw bytes in mock store
  const stored = addMessage(seed, raw);

  // Optional sanity check: decode back
  const decoded = await decodeMessageV1(raw);

  console.log("[MSG][STORE]", {
    network: req.params.network,
    seed: seed.toString("base64"),
    sender,
    prevHash,
    rawBytes: raw.length,
    msgHash: "0x" + stored.msgHash.toString("hex"),
    encryptedBytes: encryptedBytes.length,
  });

  return res.json({
    ok: true,
    seed: seed.toString("base64"),
    rawBytes: raw.length,
    msgHash: "0x" + stored.msgHash.toString("hex"),
    decoded: {
      v: decoded.v,
      sender: decoded.sender,
      prevHash: "0x" + decoded.prevHash.toString("hex"),
      encryptedBytes: decoded.encrypted.length,
      seedBytes: decoded.seed.length,
    },
  });
}

export async function getMessagesBySeed(req: Request, res: Response) {
  const seedParam = req.params.seed;
  if (!seedParam) return res.status(400).json({ error: "seed is required" });

  const seed = parseSeed(seedParam);
  const stored = getMessages(seed);

  const messages = await Promise.all(
    stored.map(async (m) => {
      const decoded = await decodeMessageV1(m.raw);
      return {
        msgHash: "0x" + m.msgHash.toString("hex"),
        createdAt: m.createdAt,
        rawBytes: m.raw.length,
        decoded: {
          v: decoded.v,
          sender: decoded.sender,
          prevHash: "0x" + decoded.prevHash.toString("hex"),
          encryptedBytes: decoded.encrypted.length,
          seed: decoded.seed.toString("base64"),
        },
      };
    })
  );

  return res.json({
    ok: true,
    seed: seed.toString("base64"),
    count: messages.length,
    messages,
  });
}

/* ---------------- parsing helpers ---------------- */

function parseHex32(v: string): Buffer {
  const s = v.startsWith("0x") ? v.slice(2) : v;
  if (!/^[0-9a-fA-F]{64}$/.test(s)) {
    throw new Error("prevHash must be 32 bytes hex (0x + 64 hex chars)");
  }
  return Buffer.from(s, "hex");
}

function parseBase64(v: string): Buffer {
  // Accept base64 / base64url
  const b64 = v.replace(/-/g, "+").replace(/_/g, "/");
  const buf = Buffer.from(b64, "base64");
  if (!buf.length) throw new Error("encrypted must be valid base64");
  return buf;
}

/**
 * Seed route param: you decide the format; this accepts:
 * - base64/base64url (recommended)
 * - hex "0x..." (optional)
 */
function parseSeed(seedParam: string): Buffer {
  if (seedParam.startsWith("0x")) {
    const hex = seedParam.slice(2);
    const buf = Buffer.from(hex, "hex");
    if (buf.length !== 22) throw new Error("seed must decode to exactly 22 bytes");
    return buf;
  }

  const b64 = seedParam.replace(/-/g, "+").replace(/_/g, "/");
  const buf = Buffer.from(b64, "base64");
  if (buf.length !== 22) throw new Error("seed must decode to exactly 22 bytes (base64)");
  return buf;
}
