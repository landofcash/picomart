import { ec as EC } from "elliptic";
import {b64FromBytes} from "@/utils/encoding.ts";
import {signPrefix} from "@/config.ts";

// Initialize elliptic curve secp256k1
const ec = new EC("secp256k1");

/**
 * Generates a deterministic private key based on a message signature.
 * Uses Web Crypto API instead of Node.js `crypto.createHash`.
 * @param signedMessage - The Base64-encoded signed message.
 * @returns { privateKey: string, publicKey: string }
 */
export const generateKeyPairFromB64 = async (signedMessage: string) => {
    // Convert Base64 signed message to a Uint8Array
    const messageBuffer = Uint8Array.from(atob(signedMessage), (c) => c.charCodeAt(0));
    return generateKeyPair(messageBuffer);
};

export const generateKeyPair= async (seedBuffer : Uint8Array)=>{
    // Generate SHA-256 hash using Web Crypto API
    const hashBuffer = await crypto.subtle.digest("SHA-256", seedBuffer);
    const hashHex = Array.from(new Uint8Array(hashBuffer))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
    const keyPair = ec.keyFromPrivate(hashHex);
    return {
        privateKey: b64FromBytes(new Uint8Array(keyPair.getPrivate().toArray())),
        publicKey: b64FromBytes(new Uint8Array(keyPair.getPublic(true, "array"))),
    };
}

export const getEncryptionSeed = (seed:string) => {
    return signPrefix + seed;
};