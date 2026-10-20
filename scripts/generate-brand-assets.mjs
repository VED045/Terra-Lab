// One canonical SVG; all binary variants are reproducible derivatives.
import sharp from 'sharp';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
const source = await readFile('apps/web/public/brand/network-tower.svg');
const sizes = [16, 32, 48];
const entries = await Promise.all(
  sizes.map((size) => sharp(source).resize(size, size).png().toBuffer()),
);
const header = Buffer.alloc(6 + 16 * entries.length);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(entries.length, 4);
let offset = header.length;
entries.forEach((png, i) => {
  const n = 6 + i * 16;
  header[n] = sizes[i];
  header[n + 1] = sizes[i];
  header.writeUInt16LE(1, n + 4);
  header.writeUInt16LE(32, n + 6);
  header.writeUInt32LE(png.length, n + 8);
  header.writeUInt32LE(offset, n + 12);
  offset += png.length;
});
await writeFile('apps/web/app/favicon.ico', Buffer.concat([header, ...entries]));
await sharp(source).resize(180, 180).png().toFile('apps/web/app/apple-icon.png');
await mkdir('services/api/terralab/assets', { recursive: true });
await sharp(source).resize(256, 256).png().toFile('services/api/terralab/assets/network-tower.png');
console.log('Generated favicon, Apple icon and report logo from the canonical network tower SVG.');
