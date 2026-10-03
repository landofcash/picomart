import {decrypt, encrypt} from "eciesjs";
import {b64ToBytes} from "@/utils/encoding.ts";
import {CompressedSecp256k1PublicKeySchema} from "@picomart/order-protocol";

function tryDecodeBase64(value: string): Uint8Array | null {
    try {
        const bytes = b64ToBytes(value);
        return bytes.length > 0 ? bytes : null;
    } catch {
        return null;
    }
}

export function normalizePublicKeyBase64(publicKeyBase64: string): string {
    const trimmed = publicKeyBase64.trim();
    if (!trimmed) {
        throw new Error("Seller public key is missing.");
    }

    const canonical = CompressedSecp256k1PublicKeySchema.safeParse(trimmed);
    if (canonical.success) {
        return canonical.data;
    }

    const decodedBytes = tryDecodeBase64(trimmed);
    if (decodedBytes) {
        const nested = new TextDecoder().decode(decodedBytes).trim();
        const legacy = CompressedSecp256k1PublicKeySchema.safeParse(nested);
        if (legacy.success) {
            return legacy.data;
        }
    }

    throw new Error("Seller public key is invalid.");
}

/**
 * Generates a random AES-GCM key (256-bit).
 * @returns {Promise<CryptoKey>} AES CryptoKey
 */
export async function generateAESKey(): Promise<CryptoKey> {
    return await crypto.subtle.generateKey(
        { name: "AES-GCM", length: 256 },
        true,
        ["encrypt", "decrypt"]
    );
}

/**
 * Encrypts a given text using AES-GCM.
 * @param {CryptoKey} key - AES key
 * @param {string} text - Text to encrypt
 * @returns {Promise<string>} Base64 encoded IV + Ciphertext
 */
export async function encryptAES(key: CryptoKey, text: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(text);
    const iv = crypto.getRandomValues(new Uint8Array(12)); // 12-byte IV for AES-GCM

    const encrypted = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv },
        key,
        data
    );

    return (
        btoa(String.fromCharCode(...iv)) +
        ":" +
        btoa(String.fromCharCode(...new Uint8Array(encrypted)))
    );
}

/**
 * Decrypts a base64 encoded AES-GCM encrypted string.
 * @param {CryptoKey} key - AES key
 * @param {string} encrypted - Base64 encoded IV + Ciphertext (format: base64_iv:base64_ciphertext)
 * @returns {Promise<string>} Decrypted plaintext
 */
export async function decryptAES(key: CryptoKey, encrypted: string): Promise<string> {
    const [ivB64, ciphertextB64] = encrypted.split(":");
    const iv = Uint8Array.from(atob(ivB64), c => c.charCodeAt(0));
    const ciphertext = Uint8Array.from(atob(ciphertextB64), c => c.charCodeAt(0));

    const decrypted = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv },
        key,
        ciphertext
    );

    const decoder = new TextDecoder();
    return decoder.decode(decrypted);
}

/**
 * Encrypts an AES key using ECIES with secp256k1.
 * @param {string} publicKeyHex - Receiver's public key (Base64)
 * @param {CryptoKey} aesKey - AES key to encrypt
 * @returns {Promise<string>} Encrypted AES key (Base64)
 */
export async function encryptWithECIES(publicKeyHex: string, aesKey: CryptoKey): Promise<string> {
    // Export the AES key as raw bytes
    const exportedKey = await crypto.subtle.exportKey("raw", aesKey);
    const aesKeyBytes = new Uint8Array(exportedKey);

    const normalizedPublicKey = normalizePublicKeyBase64(publicKeyHex);
    const publicKeyBuffer = b64ToBytes(normalizedPublicKey);

    // Encrypt AES key with ECIES (secp256k1)
    const encryptedAESKey = encrypt(publicKeyBuffer, aesKeyBytes);

    // Return encrypted AES key as Base64
    return Buffer.from(encryptedAESKey).toString("base64");
}

/**
 * Decrypts a Base64-encoded AES key using ECIES with secp256k1.
 * @param {string} privateKeyBase64 - Your private key (Base64)
 * @param {string} encryptedBase64 - Encrypted AES key (Base64)
 * @returns {Promise<CryptoKey>} Decrypted AES CryptoKey
 */
export async function decryptWithECIES(privateKeyBase64: string, encryptedBase64: string): Promise<CryptoKey> {
    const privateKeyBuffer = Buffer.from(privateKeyBase64, "base64");
    const encryptedBytes = Buffer.from(encryptedBase64, "base64");

    // Decrypt AES key bytes using ECIES
    const decryptedAESBytes = decrypt(privateKeyBuffer, encryptedBytes);

    // Import as AES-GCM CryptoKey
    return await crypto.subtle.importKey(
        "raw",
        new Uint8Array(decryptedAESBytes),
        { name: "AES-GCM" },
        true,
        ["encrypt", "decrypt"]
    );
}

