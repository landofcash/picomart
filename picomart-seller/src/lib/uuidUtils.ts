/**
 * Core UUID utility functions for converting between UUID strings, byte arrays, and base64url encoding
 */

/**
 * Converts a UUID string to a 16-byte Uint8Array
 * @param uuid The UUID string to convert (e.g., "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx")
 * @returns A 16-byte Uint8Array representation of the UUID
 */
export function uuidToBytes(uuid: string): Uint8Array {
  const hex = uuid.replace(/-/g, '')
  const bytes = new Uint8Array(16)
  for (let i = 0; i < 16; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  }
  return bytes
}

/**
 * Converts a 16-byte Uint8Array to a UUID string
 * @param uuidBytes A 16-byte Uint8Array representing a UUID
 * @returns A standard UUID string (e.g., "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx")
 */
export function bytesToUuid(uuidBytes: Uint8Array): string {
  if (uuidBytes.length !== 16) {
    throw new Error('UUID bytes must be exactly 16 bytes long')
  }

  const hex = Array.from(uuidBytes)
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('')

  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32)
  ].join('-')
}

/**
 * Generate a compact, URL-safe 22-character base64-encoded UUID.
 * @param uuid The UUID string to encode
 * @returns A URL-safe base64 encoded string (22 characters)
 */
export function encodeBase64Uuid(uuid: string): string {
  const bytes = uuidToBytes(uuid)
  const binary = String.fromCharCode(...bytes)
  const base64 = btoa(binary)
  // Convert to base64url and remove padding
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

/**
 * Decode a URL-safe 22-character base64-encoded UUID back into a standard 36-character UUID string.
 * @param base64Uuid The base64url encoded UUID string (22 characters)
 * @returns A standard UUID string
 */
export function decodeBase64Uuid(base64Uuid: string): string {
  // Convert from base64url to standard base64
  const base64 = base64Uuid.replace(/-/g, "+").replace(/_/g, "/") + "=="
  const binary = atob(base64)

  // Convert binary string to Uint8Array
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }

  return bytesToUuid(bytes)
}
