import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { sampleImage, sharp, loadMediaModule } from './fixtures/content-media-images.mjs';
const { normalizeImage, MAX_IMAGE_BYTES } = loadMediaModule('lib/content-media/image.ts');
for (const format of ['jpeg', 'png', 'webp']) test(`isolated ${format} decode preserves dimensions and strips metadata`, async () => {
  const input = await sharp(await sampleImage(format)).withMetadata({ orientation: 6 }).toFormat(format).toBuffer();
  const before = process.report.getReport().sharedObjects.filter(x => /vips|sharp.*node/.test(x));
  const result = await normalizeImage(input);
  const metadata = await sharp(result.bytes).metadata();
  assert.equal(result.width, 32); assert.equal(result.height, 64);
  assert.equal(metadata.format, format); assert.equal(metadata.exif, undefined); assert.equal(metadata.icc, undefined); assert.equal(metadata.orientation, undefined);
  assert.equal(createHash('sha256').update(result.bytes).digest('hex'), result.sha256);
  assert.deepEqual(process.report.getReport().sharedObjects.filter(x => /vips|sharp.*node/.test(x)), before);
  assert.equal(sharp.versions.sharp, '0.35.4');
});
test('malformed, oversized, unsupported and excessive dimensions fail with a fresh success afterward', async () => {
  for (const input of [Buffer.from('not an image'), Buffer.from('<svg/>'), Buffer.from('GIF89a'), Buffer.alloc(MAX_IMAGE_BYTES + 1), await sampleImage('png', 4097, 1), await sampleImage('png', 4000, 4000)]) {
    await assert.rejects(normalizeImage(input));
    assert.equal((await normalizeImage(await sampleImage())).width, 64);
  }
});
test('container animation is rejected before flattening', async () => {
  const jpeg = await sampleImage('jpeg');
  await assert.rejects(normalizeImage(Buffer.concat([jpeg, jpeg])));
  const png = await sampleImage();
  const chunk = Buffer.alloc(20); chunk.writeUInt32BE(8); chunk.write('acTL', 4); chunk.writeUInt32BE(2, 8);
  await assert.rejects(normalizeImage(Buffer.concat([png.subarray(0, 33), chunk, png.subarray(33)])));
  const webp = await sampleImage('webp');
  const anim = Buffer.alloc(14); anim.write('ANIM'); anim.writeUInt32LE(6, 4);
  const animated = Buffer.concat([webp, anim]); animated.writeUInt32LE(animated.length - 8, 4);
  await assert.rejects(normalizeImage(animated));
});
test('cancellation closes a process and permits the next invocation', async () => {
  const controller = new AbortController();
  const promise = normalizeImage(await sampleImage(), controller.signal);
  controller.abort();
  await assert.rejects(promise);
  assert.equal((await normalizeImage(await sampleImage())).height, 32);
});

test('crash, abnormal/partial/overflow output and watchdog failure close before recovery', async () => {
  const faults = [
    'process.exit(9)',
    'process.kill(process.pid,"SIGABRT")',
    'process.stdout.end("{partial")',
    'process.stdout.end(Buffer.alloc(4*1024*1024))',
    'process.stderr.write(Buffer.alloc(100000));setInterval(()=>{},1000)',
    'setInterval(()=>{},1000)',
  ];
  for (const fault of faults) {
    let closed = false;
    const faulty = loadMediaModule('lib/content-media/image.ts', { 'node:child_process': { spawn: (exe, _args, options) => {
      assert.deepEqual(Object.keys(options.env).sort(), ['LANG', 'NODE_ENV', 'TZ']);
      const child = spawn(exe, ['-e', fault], options);
      child.on('close', () => { closed = true; }); return child;
    } } });
    await assert.rejects(faulty.normalizeImage(await sampleImage()));
    assert.equal(closed, true);
    assert.equal((await normalizeImage(await sampleImage())).width, 64);
  }
});
test('normalized output cannot exceed the byte cap even when compressed input fits', async () => {
  const input = await sharp(randomBytes(4096 * 2929 * 3), { raw: { width: 4096, height: 2929, channels: 3 } }).jpeg({ quality: 10 }).toBuffer();
  assert.ok(input.length < MAX_IMAGE_BYTES);
  const result = await normalizeImage(input).catch(() => null);
  if (result) assert.ok(result.bytes.length <= MAX_IMAGE_BYTES);
});
