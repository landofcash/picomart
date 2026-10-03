import { deflate, inflate } from 'pako';

export class TextCompressor {
    /**
     * Compress a UTF-8 string to a Uint8Array using deflate
     */
    static compress(text: string): Uint8Array {
        return deflate(text);
    }

    /**
     * Decompress a Uint8Array back into a UTF-8 string
     */
    static decompress(data: Uint8Array): string {
        return inflate(data, { to: 'string' });
    }

    /**
     * Get the number of bytes the compressed string would use
     */
    static getCompressedLength(text: string): number {
        const compressed = this.compress(text);
        return compressed.length;
    }
}
