/**
 * First-load JavaScript budget.
 *
 * Reads the real server-rendered HTML, collects every script the browser loads
 * before hydration, gzips each file and prints a table plus the total. Turbopack
 * builds do not print route sizes, so this measures what actually ships.
 *
 * Usage: node scripts/client-bundle-size.mjs [url]   (default :3110)
 */
import { gzipSync } from 'node:zlib';
import { readFileSync } from 'node:fs';

const base = (process.argv[2] ?? 'http://127.0.0.1:3110').replace(/\/$/, '');
const html = await (await fetch(`${base}/`)).text();

const sources = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((match) => match[1]);
const unique = [...new Set(sources)];
const rows = [];
let total = 0;

for (const src of unique) {
  const url = new URL(src, base);
  const local = `.next/${url.pathname.replace(/^\/_next\//, '')}`;
  let gz;
  try {
    gz = gzipSync(readFileSync(local)).length;
  } catch {
    gz = gzipSync(Buffer.from(await (await fetch(url)).arrayBuffer())).length;
  }
  total += gz;
  rows.push({ file: url.pathname.split('/').pop(), kib: +(gz / 1024).toFixed(1) });
}

rows.sort((a, b) => b.kib - a.kib);
console.log(`${unique.length} first-load scripts from ${base}/`);
for (const row of rows)
  console.log(`  ${String(row.kib).padStart(6)} KiB gz  ${row.file}`);
console.log(
  `  ${String((total / 1024).toFixed(1)).padStart(6)} KiB gz  TOTAL first-load JavaScript`,
);
