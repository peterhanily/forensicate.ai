import { closeSync, constants, fstatSync, lstatSync, openSync, readSync } from 'node:fs';
import { StringDecoder } from 'node:string_decoder';
import { MAX_SCAN_LENGTH, ScanInputTooLargeError } from './scanner.js';

const READ_CHUNK_BYTES = 64 * 1024;
// UTF-8 needs at most three bytes per UTF-16 code unit.
const MAX_SCAN_BYTES = MAX_SCAN_LENGTH * 3;
export const MAX_CONFIG_BYTES = 64 * 1024;
export const DEFAULT_MAX_FILE_BYTES = 512 * 1024;

class BoundedUtf8Reader {
  private readonly decoder = new StringDecoder('utf8');
  private readonly parts: string[] = [];
  private length = 0;
  bytesRead = 0;

  constructor(private readonly maxBytes: number) {}

  append(chunk: Uint8Array): void {
    this.bytesRead += chunk.byteLength;
    if (this.bytesRead > this.maxBytes) {
      throw new Error(`Input exceeds the ${this.maxBytes}-byte read limit`);
    }
    this.appendText(this.decoder.write(chunk));
  }

  private appendText(text: string): void {
    this.length += text.length;
    if (this.length > MAX_SCAN_LENGTH) {
      throw new ScanInputTooLargeError(this.length);
    }
    if (text) this.parts.push(text);
  }

  finish(): string {
    this.appendText(this.decoder.end());
    return this.parts.join('');
  }
}

function inputError(source: string, error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error);
  return new Error(`${source}: ${message}`);
}

/** Read a regular file in bounded chunks, rejecting symlinks and special files. */
export function readBoundedFile(path: string, maxBytes = DEFAULT_MAX_FILE_BYTES): string {
  let fd: number | undefined;
  try {
    if (!Number.isFinite(maxBytes) || maxBytes < 1) {
      throw new Error('File size limit must be a finite positive number');
    }
    const byteLimit = Math.min(Math.floor(maxBytes), MAX_SCAN_BYTES);
    const before = lstatSync(path);
    if (before.isSymbolicLink()) throw new Error('Symbolic links are not followed');
    if (!before.isFile()) throw new Error('Expected a regular file');

    // O_NONBLOCK prevents waiting on a FIFO substituted after lstat. Recheck the
    // opened descriptor so a changing file cannot bypass the regular-file check.
    fd = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0));
    const stats = fstatSync(fd);
    if (!stats.isFile()) throw new Error('Expected a regular file');
    if (stats.size > byteLimit) throw new Error(`Input exceeds the ${byteLimit}-byte read limit`);

    const reader = new BoundedUtf8Reader(byteLimit);
    const chunk = Buffer.allocUnsafe(Math.min(READ_CHUNK_BYTES, byteLimit + 1));
    while (true) {
      // Read one byte past the cap to detect files that grow while being read.
      const size = readSync(fd, chunk, 0, Math.min(chunk.length, byteLimit - reader.bytesRead + 1), null);
      if (size === 0) break;
      reader.append(chunk.subarray(0, size));
    }
    return reader.finish();
  } catch (error) {
    throw inputError(path, error);
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

/** Stop consuming stdin as soon as its decoded text or byte budget is exceeded. */
export async function readBoundedStdin(stream: AsyncIterable<Uint8Array>): Promise<string> {
  try {
    const reader = new BoundedUtf8Reader(MAX_SCAN_BYTES);
    for await (const chunk of stream) reader.append(chunk);
    return reader.finish();
  } catch (error) {
    throw inputError('stdin', error);
  }
}
