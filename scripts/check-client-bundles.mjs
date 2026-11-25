/**
 * Build-output secret scan.
 *
 * Proves that no server secret reaches the client bundle:
 *  1. greps every file under .next/static (what the browser downloads) for the
 *     current values of the secret env vars, if they are set;
 *  2. greps for provider key shapes (Google API keys, Upstash tokens);
 *  3. fails if any server-only env var name is inlined into a client chunk.
 *
 * Usage: node scripts/check-client-bundles.mjs
 */
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';

const TARGETS = ['.next/static'];

const SECRET_ENV = [
  'GEMINI_API_KEY',
  'UPSTASH_REDIS_REST_TOKEN',
  'UPSTASH_REDIS_REST_URL',
];

const SECRET_PATTERNS = [
  { name: 'Google API key', pattern: /AIza[0-9A-Za-z_-]{30,}/ },
  { name: 'Bearer token literal', pattern: /Bearer\s+[A-Za-z0-9._-]{20,}/ },
  { name: 'Upstash token shape', pattern: /AX[A-Za-z0-9]{20,}/ },
];

const SERVER_ONLY_NAMES = SECRET_ENV;

const TEXT_EXTENSIONS = new Set([
  '.js',
  '.mjs',
  '.cjs',
  '.json',
  '.css',
  '.map',
  '.txt',
  '.html',
]);

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stats = statSync(full);
    if (stats.isDirectory()) walk(full, out);
    else out.push({ path: full, size: stats.size });
  }
  return out;
}

let scanned = 0;
let bytes = 0;
const findings = [];

for (const target of TARGETS) {
  if (!existsSync(target)) {
    console.error(`Missing ${target}. Run "npm run build" first.`);
    process.exit(2);
  }
  for (const file of walk(target)) {
    if (!TEXT_EXTENSIONS.has(extname(file.path))) continue;
    const content = readFileSync(file.path, 'utf8');
    scanned += 1;
    bytes += file.size;

    for (const name of SECRET_ENV) {
      const value = process.env[name];
      if (value && value.length >= 8 && content.includes(value)) {
        findings.push(`${file.path}: contains the value of ${name}`);
      }
    }
    for (const pattern of SECRET_PATTERNS) {
      if (pattern.pattern.test(content)) {
        findings.push(`${file.path}: matches pattern "${pattern.name}"`);
      }
    }
    for (const name of SERVER_ONLY_NAMES) {
      if (content.includes(name)) {
        findings.push(`${file.path}: references server-only variable ${name}`);
      }
    }
  }
}

console.log(
  `Scanned ${scanned} client files (${(bytes / 1024).toFixed(1)} KiB) under ${TARGETS.join(', ')}`,
);
for (const name of SECRET_ENV) {
  console.log(
    `  ${name}: ${process.env[name] ? 'set — searched for its value' : 'not set — shape scan only'}`,
  );
}

if (findings.length > 0) {
  console.error('\nFAIL: possible secret exposure in client bundles');
  for (const finding of findings) console.error(`  - ${finding}`);
  process.exit(1);
}

console.log(
  '\nPASS: no secrets, tokens or server-only variable names found in client bundles.',
);
