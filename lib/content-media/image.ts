import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import path from 'node:path';

export const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
export type NormalizedImage = { bytes: Buffer; mime: 'image/jpeg' | 'image/png' | 'image/webp'; width: number; height: number; sha256: string };
export class ImageValidationError extends Error {}

/** Await close even on failure: a rejected request must not leave native work running. */
export async function normalizeImage(input: Buffer, signal?: AbortSignal): Promise<NormalizedImage> {
  if (!input.length || input.length > MAX_IMAGE_BYTES) throw new ImageValidationError('Image input rejected');
  if (signal?.aborted) throw new Error('Image input interrupted');
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--max-old-space-size=64', path.join(process.cwd(), 'lib/content-media/decoder-worker.cjs')], {
      env: { LANG: 'C', TZ: 'UTC', NODE_ENV: 'production' }, stdio: ['pipe', 'pipe', 'pipe'],
    });
    let failed = false;
    let size = 0;
    let stderrSize = 0;
    let headerEnd = -1;
    const chunks: Buffer[] = [];
    const stop = () => { failed = true; child.kill('SIGKILL'); };
    const timer = setTimeout(stop, 10000);
    signal?.addEventListener('abort', stop, { once: true });
    if (signal?.aborted) stop();
    child.on('error', () => { failed = true; });
    child.stdin.on('error', stop);
    child.stdout.on('error', stop);
    child.stderr.on('error', stop);
    child.stderr.on('data', (chunk: Buffer) => { stderrSize += chunk.length; if (stderrSize > 8192) stop(); });
    child.stdout.on('data', (chunk: Buffer) => {
      const previous = size;
      size += chunk.length;
      if (size > MAX_IMAGE_BYTES + 4096) { stop(); return; }
      if (headerEnd < 0) {
        const newline = chunk.indexOf(10);
        if (newline >= 0) headerEnd = previous + newline;
        if ((headerEnd < 0 && size >= 4096) || headerEnd >= 4096) { stop(); return; }
      }
      chunks.push(chunk);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', stop);
      try {
        if (!failed && !stderrSize && (code === 10 || code === 11)) throw new ImageValidationError('Image format or limits rejected');
        if (failed || code !== 0 || stderrSize || headerEnd < 0) throw new Error('decoder');
        const output = Buffer.concat(chunks, size);
        const header = JSON.parse(output.subarray(0, headerEnd).toString('utf8'));
        const bytes = output.subarray(headerEnd + 1);
        const mime = ({ jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' } as const)[header.format as 'jpeg' | 'png' | 'webp'];
        if (!mime || !bytes.length || bytes.length > MAX_IMAGE_BYTES || header.size !== bytes.length || !Number.isInteger(header.width) || !Number.isInteger(header.height) || header.width < 1 || header.height < 1 || header.width > 4096 || header.height > 4096 || header.width * header.height > 12000000 || createHash('sha256').update(bytes).digest('hex') !== header.sha256) throw new Error('result');
        resolve({ bytes, mime, width: header.width, height: header.height, sha256: header.sha256 });
      } catch (error) { reject(error instanceof ImageValidationError ? error : new Error('Image processing failed')); }
    });
    child.stdin.end(input);
  });
}
