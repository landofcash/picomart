export async function sha256(data: Uint8Array): Promise<Uint8Array> {
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    return new Uint8Array(hashBuffer);
}

export function b64ToBytes(base64: string): Uint8Array {
    // Use browser-native atob() to decode base64 to binary string
    const binaryString = atob(base64);
    // Convert binary string to Uint8Array
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
}

export function b64FromBytes(bytes: Uint8Array): string {
    // Convert Uint8Array to binary string
    let binaryString = '';
    for (let i = 0; i < bytes.length; i++) {
        binaryString += String.fromCharCode(bytes[i]);
    }
    // Use browser-native btoa() to encode binary string to base64
    return btoa(binaryString);
}

export function hexToBytes(hex: string): Uint8Array {
    if (hex.startsWith('0x')) {
        hex = hex.slice(2);
    }
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < bytes.length; i++) {
        bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
    }
    return bytes;
}

export const hashCryptoKeyToB64 = async (key: CryptoKey): Promise<string> => {
    const exportedKey = await crypto.subtle.exportKey("raw", key);
    const byteArray = new Uint8Array(exportedKey);
    const hash = await sha256(byteArray);
    return b64FromBytes(hash);
}

export function uint16ArrayToBytes(ids: number[]): Uint8Array {
    const bytes = new Uint8Array(ids.length * 2);
    ids.forEach((id, i) => {
        bytes[i * 2] = (id >> 8) & 0xff;
        bytes[i * 2 + 1] = id & 0xff;
    });
    return bytes;
}

export function bytesToUint16Array(buf: Uint8Array): number[] {
    const ids = [];
    for (let i = 0; i < buf.length; i += 2) {
        ids.push((buf[i] << 8) + buf[i + 1]);
    }
    return ids;
}