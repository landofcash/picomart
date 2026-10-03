import {gzipSync, gunzipSync} from 'node:zlib';
import {safeRelative, sourcePath, type FileSet} from './files.ts';
import {limits} from './config.ts';

// Deliberately small USTAR subset: regular source files only, decoded into memory.
// No filesystem extraction, links, directories, PAX extensions, or executable loading.
function octal(header: Buffer, offset: number, length: number, value: number) {
  const text = value.toString(8).padStart(length - 1, '0');
  if (text.length >= length) throw new Error('Archive field overflow');
  header.write(text + '\0', offset, length, 'ascii');
}
export function packSource(files: FileSet): Buffer {
  const chunks: Buffer[] = []; let total = 0;
  if (files.size > 2000) throw new Error('Source file limit');
  for (const [name, bytes] of [...files].sort(([a], [b]) => a.localeCompare(b))) {
    safeRelative(name);
    if (!sourcePath(name) || bytes.length > limits().fileBytes || (total += bytes.length) > limits().sourceBytes) throw new Error('Source limit');
    const split = name.lastIndexOf('/'), prefix = Buffer.byteLength(name) > 100 ? name.slice(0, split) : '', leaf = prefix ? name.slice(split + 1) : name;
    if (Buffer.byteLength(prefix) > 155 || Buffer.byteLength(leaf) > 100) throw new Error('Archive path too long');
    const header = Buffer.alloc(512); header.write(leaf); header.write(prefix, 345);
    octal(header, 100, 8, 0o644); octal(header, 108, 8, 0); octal(header, 116, 8, 0);
    octal(header, 124, 12, bytes.length); octal(header, 136, 12, 0);
    header.fill(32, 148, 156); header[156] = 48; header.write('ustar\0', 257); header.write('00', 263);
    octal(header, 148, 8, header.reduce((sum, byte) => sum + byte, 0));
    chunks.push(header, bytes, Buffer.alloc((512 - bytes.length % 512) % 512));
  }
  return gzipSync(Buffer.concat([...chunks, Buffer.alloc(1024)]));
}
export function unpackSource(archive: Uint8Array): FileSet {
  if (archive.length > limits().sourceBytes) throw new Error('Archive limit');
  const bytes = gunzipSync(archive, {maxOutputLength: limits().sourceBytes + 2000 * 1024 + 1024});
  const files: FileSet = new Map(); let position = 0, total = 0;
  const text = (header: Buffer, start: number, end: number) => header.subarray(start, end).toString().split('\0')[0];
  const number = (header: Buffer, start: number, end: number) => {
    const value = text(header, start, end).trim();
    if (!/^[0-7]+$/.test(value)) throw new Error('Invalid archive number');
    return parseInt(value, 8);
  };
  while (position + 512 <= bytes.length) {
    const header = Buffer.from(bytes.subarray(position, position + 512)); position += 512;
    if (header.every(byte => byte === 0)) {
      if (bytes.length - position < 512 || bytes.subarray(position).some(byte => byte !== 0)) throw new Error('Invalid archive trailer');
      return files;
    }
    const checksum = number(header, 148, 156); header.fill(32, 148, 156);
    if (header.reduce((sum, byte) => sum + byte, 0) !== checksum || text(header, 257, 263) !== 'ustar' || header[156] !== 48 || text(header, 157, 257)) throw new Error('Unsupported archive entry');
    const prefix = text(header, 345, 500), name = safeRelative((prefix ? prefix + '/' : '') + text(header, 0, 100));
    const size = number(header, 124, 136), padded = Math.ceil(size / 512) * 512;
    if (!sourcePath(name) || files.has(name) || files.size >= 2000 || size > limits().fileBytes || (total += size) > limits().sourceBytes || position + padded > bytes.length) throw new Error('Invalid archive file');
    files.set(name, Buffer.from(bytes.subarray(position, position + size))); position += padded;
  }
  throw new Error('Incomplete source archive');
}
