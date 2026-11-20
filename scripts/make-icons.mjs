/**
 * Generates the PWA icons procedurally (no image dependencies, no network).
 * Run with: node scripts/make-icons.mjs
 */
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([length, typeBuf, data, crc]);
}

function encodePng(width, height, rgba) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const BG = [11, 79, 98];
const FG = [255, 255, 255];
const ACCENT = [111, 211, 232];

function roundedBar(x, y, w, h, r) {
  const cx = Math.min(Math.max(x, 0), w);
  const cy = Math.min(Math.max(y, 0), h);
  if (cx >= w || cy >= h) return false;
  const dx = Math.min(cx, w - cx);
  const dy = Math.min(cy, h - cy);
  if (dx >= r || dy >= r) return true;
  return (dx - r) ** 2 + (dy - r) ** 2 <= r * r;
}

function draw(size, maskable) {
  const rgba = Buffer.alloc(size * size * 4);
  // Maskable icons must keep content inside the inner 80% safe zone.
  const scale = maskable ? 0.72 : 1;
  const bars = [
    { cx: 0.5, cy: 0.42, w: 0.52, h: 0.085 },
    { cx: 0.46, cy: 0.55, w: 0.4, h: 0.085 },
    { cx: 0.56, cy: 0.68, w: 0.3, h: 0.085 },
  ];
  const dot = { cx: 0.7, cy: 0.28, r: 0.075 };

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const nx = (x + 0.5) / size;
      const ny = (y + 0.5) / size;
      // Map into the design space around the centre.
      const dx = (nx - 0.5) / scale + 0.5;
      const dy = (ny - 0.5) / scale + 0.5;

      let colour = BG;
      for (const bar of bars) {
        const left = dx - (bar.cx - bar.w / 2);
        const top = dy - (bar.cy - bar.h / 2);
        if (roundedBar(left, top, bar.w, bar.h, bar.h / 2)) colour = FG;
      }
      if ((dx - dot.cx) ** 2 + (dy - dot.cy) ** 2 <= dot.r ** 2) colour = ACCENT;

      const offset = (y * size + x) * 4;
      rgba[offset] = colour[0];
      rgba[offset + 1] = colour[1];
      rgba[offset + 2] = colour[2];
      rgba[offset + 3] = 255;
    }
  }
  return encodePng(size, size, rgba);
}

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(join(OUT_DIR, 'icon-192.png'), draw(192, false));
writeFileSync(join(OUT_DIR, 'icon-512.png'), draw(512, false));
writeFileSync(join(OUT_DIR, 'maskable-512.png'), draw(512, true));
console.log('icons written to public/icons');
