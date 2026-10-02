// One input per process. No environment credentials or application modules belong here.
const MAX = 3 * 1024 * 1024;
const OPTIONS = { limitInputPixels: 12000000, limitInputChannels: 4, failOn: 'warning', unlimited: false };

function containerFormat(bytes) {
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    let offset = 8;
    let ended = false;
    let first = true;
    while (offset + 12 <= bytes.length) {
      const length = bytes.readUInt32BE(offset);
      const type = bytes.toString('ascii', offset + 4, offset + 8);
      if (length > bytes.length - offset - 12 || (first && type !== 'IHDR')) throw Error('container');
      if (['acTL', 'fcTL', 'fdAT'].includes(type)) throw Error('animation');
      first = false;
      offset += 12 + length;
      if (type === 'IEND') { ended = length === 0; break; }
    }
    if (!ended || offset !== bytes.length) throw Error('container');
    return 'png';
  }
  if (bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') {
    if (bytes.readUInt32LE(4) + 8 !== bytes.length) throw Error('container');
    let offset = 12;
    let images = 0;
    while (offset + 8 <= bytes.length) {
      const type = bytes.toString('ascii', offset, offset + 4);
      const length = bytes.readUInt32LE(offset + 4);
      if (length > bytes.length - offset - 8) throw Error('container');
      if (type === 'ANIM' || type === 'ANMF' || (type === 'VP8X' && (length !== 10 || (bytes[offset + 8] & 2)))) throw Error('animation');
      if (type === 'VP8 ' || type === 'VP8L') images++;
      offset += 8 + length + (length % 2);
    }
    if (offset !== bytes.length || images !== 1) throw Error('container');
    return 'webp';
  }
  if (bytes.length >= 4 && bytes[0] === 255 && bytes[1] === 216) {
    let offset = 2;
    let scan = false;
    while (offset < bytes.length) {
      if (scan) {
        while (offset < bytes.length && bytes[offset] !== 255) offset++;
      }
      if (bytes[offset++] !== 255) throw Error('container');
      while (bytes[offset] === 255) offset++;
      const marker = bytes[offset++];
      if (scan && (marker === 0 || (marker >= 208 && marker <= 215))) continue;
      if (marker === 217) { if (offset !== bytes.length) throw Error('frames'); return 'jpeg'; }
      if (marker === 216 || marker === undefined || offset + 2 > bytes.length) throw Error('container');
      const length = bytes.readUInt16BE(offset);
      if (length < 2 || length > bytes.length - offset) throw Error('container');
      if (marker === 226 && bytes.toString('ascii', offset + 2, offset + 6) === 'MPF\0') throw Error('frames');
      offset += length;
      scan = marker === 218;
    }
    throw Error('container');
  }
  throw Error('format');
}

function validateMetadata(metadata, format) {
  if (metadata.format !== format || !metadata.width || !metadata.height || metadata.width > 4096 || metadata.height > 4096 || metadata.width * metadata.height > 12000000 || (metadata.pages || 1) !== 1) throw Error('limits');
}

async function normalize(input) {
  const format = containerFormat(input);
  const { default: sharp } = await import('socrates-media-sharp');
  const { createHash } = await import('node:crypto');
  sharp.cache(false);
  sharp.concurrency(1);
  const metadata = await sharp(input, OPTIONS).metadata();
  validateMetadata(metadata, format);
  let pipeline = sharp(input, OPTIONS).autoOrient().toColourspace('srgb').timeout({ seconds: 3 });
  pipeline = format === 'jpeg' ? pipeline.jpeg({ quality: 90, chromaSubsampling: '4:4:4' }) : format === 'png' ? pipeline.png({ compressionLevel: 6 }) : pipeline.webp({ quality: 90, effort: 4 });
  const chunks = [];
  let size = 0;
  for await (const chunk of pipeline) {
    size += chunk.length;
    if (size > MAX) { pipeline.destroy(); throw Error('output'); }
    chunks.push(chunk);
  }
  const bytes = Buffer.concat(chunks, size);
  const verified = await sharp(bytes, OPTIONS).metadata();
  validateMetadata(verified, containerFormat(bytes));
  if (verified.exif || verified.icc || verified.iptc || verified.xmp || verified.orientation) throw Error('metadata');
  // A second full decode verifies the re-encoded output, not just its header.
  await sharp(bytes, OPTIONS).timeout({ seconds: 3 }).stats();
  const header = Buffer.from(JSON.stringify({ format, width: verified.width, height: verified.height, size, sha256: createHash('sha256').update(bytes).digest('hex') }) + '\n');
  if (header.length > 4096) throw Error('header');
  process.stdout.write(header);
  process.stdout.end(bytes);
}

let size = 0;
const chunks = [];
process.stdin.on('error', () => { process.exitCode = 10; });
process.stdin.on('data', (chunk) => {
  size += chunk.length;
  if (size > MAX) process.exit(10);
  chunks.push(chunk);
});
process.stdin.on('end', () => {
  if (!size) { process.exitCode = 10; return; }
  normalize(Buffer.concat(chunks, size)).catch(() => { process.exitCode = 11; });
});
