import { CompactSign, compactVerify, importJWK, importPKCS8 } from "jose";
import { base64UrlToBytes, bytesToBase64Url } from "./binary.js";

export type QuoteKey = CryptoKey | Uint8Array;

const TYPE = "picomart-order-quote+jws";

export async function importQuotePrivateKey(pkcs8: string): Promise<QuoteKey> {
  return importPKCS8(pkcs8, "EdDSA");
}

export async function importQuotePublicKey(publicKeyBase64Url: string): Promise<QuoteKey> {
  return importJWK({ kty: "OKP", crv: "Ed25519", x: publicKeyBase64Url }, "EdDSA");
}

export async function signQuoteDigest(digest: string, kid: string, key: QuoteKey): Promise<string> {
  const compact = await new CompactSign(new TextEncoder().encode(digest))
    .setProtectedHeader({ alg: "EdDSA", kid, typ: TYPE })
    .sign(key);
  const [protected64, , signature] = compact.split(".");
  return `${protected64}..${signature}`;
}

export async function verifyQuoteDigestJws(
  detached: string,
  digest: string,
  keys: ReadonlyMap<string, QuoteKey>,
): Promise<string> {
  const parts = detached.split(".");
  if (parts.length !== 3 || parts[1] !== "") throw new Error("Quote JWS must be detached compact serialization");
  const protectedHeader = JSON.parse(new TextDecoder().decode(base64UrlToBytes(parts[0]))) as Record<string, unknown>;
  if (Object.keys(protectedHeader).sort().join(",") !== "alg,kid,typ" ||
      protectedHeader.alg !== "EdDSA" || protectedHeader.typ !== TYPE || typeof protectedHeader.kid !== "string") {
    throw new Error("Unsupported quote JWS protected header");
  }
  const key = keys.get(protectedHeader.kid);
  if (!key) throw new Error("Unknown quote signing key");
  const payload64 = bytesToBase64Url(new TextEncoder().encode(digest));
  const attached = `${parts[0]}.${payload64}.${parts[2]}`;
  const result = await compactVerify(attached, key, { algorithms: ["EdDSA"] });
  if (new TextDecoder().decode(result.payload) !== digest) throw new Error("Quote JWS payload mismatch");
  return protectedHeader.kid;
}
