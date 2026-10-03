import { exportJWK, exportPKCS8, generateKeyPair } from "jose";

const { privateKey, publicKey } = await generateKeyPair("Ed25519", { extractable: true });
const [pkcs8, jwk] = await Promise.all([exportPKCS8(privateKey), exportJWK(publicKey)]);
console.log(JSON.stringify({
  PICOMART_QUOTE_SIGNING_KID: `picomart-tempo-moderato-v2-${new Date().toISOString().slice(0, 10)}`,
  PICOMART_QUOTE_SIGNING_KEY_PKCS8: pkcs8,
  PICOMART_QUOTE_PUBLIC_KEY: jwk.x,
}, null, 2));
