#!/usr/bin/env node
/**
 * Fail the deployment if a secret value survived into the uploaded output.
 *
 *   node scripts/check-secrets-in-bundle.mjs
 *   npm run check:secrets-in-bundle
 *
 * Context: a literal `process.env.NAME` read is folded by Next at build time,
 * so building with `.env.local` present shipped its values inside the Worker
 * script. The app now reads configuration through `src/lib/env.ts`, and the
 * hosted build must run with no `.env.local` present.
 *
 * This check is the proof step: values are read from the environment and from
 * `.env.local` when that file exists, then searched for in the generated
 * deployment output. Run it AFTER a build that had no `.env.local` in the tree.
 *
 * A value is never printed — only the variable name, the file and the count.
 * Exit status: 0 = clean, 1 = a secret or a server-only variable name leaked,
 * 2 = nothing to scan.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const BUILD_DIRS = ['freebuff-sites-build', '.open-next'];
const ASSET_DIRS = ['freebuff-sites-build/assets', '.open-next/assets', 'public'];

/** Must match the server-side names in `.env.example`. */
const SERVER_ONLY_NAMES = [
  'GEMINI_API_KEY',
  'GEMINI_MODEL',
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',
  'APP_ORIGIN',
];

/** Unambiguous Google API key shape, as a second, value-independent check. */
const GOOGLE_KEY_SHAPE = /AIza[0-9A-Za-z_-]{30,}/g;

const MIN_VALUE_LENGTH = 8;

function parseDotEnv(path) {
  const values = {};
  if (!existsSync(path)) return values;
  for (const raw of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const index = line.indexOf('=');
    if (index < 1) continue;
    const name = line.slice(0, index).trim();
    let value = line.slice(index + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (value) values[name] = value;
  }
  return values;
}

function filesUnder(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...filesUnder(full));
    else out.push(full);
  }
  return out;
}

function textOf(path) {
  // Binary assets (images, fonts) cannot carry these values; skip them cheaply.
  if (/\.(png|jpe?g|gif|webp|ico|woff2?|ttf|otf|wasm|zip|gz|br)$/i.test(path)) return null;
  return readFileSync(path, 'latin1');
}

const known = new Map();
for (const name of SERVER_ONLY_NAMES) {
  const fromEnv = process.env[name];
  if (fromEnv && fromEnv.length >= MIN_VALUE_LENGTH) known.set(name, fromEnv);
}
for (const [name, value] of Object.entries(parseDotEnv('.env.local'))) {
  if (SERVER_ONLY_NAMES.includes(name) && value.length >= MIN_VALUE_LENGTH) {
    if (!known.has(name)) known.set(name, value);
  }
}

const scannedFiles = [...new Set(BUILD_DIRS.flatMap(filesUnder))];
if (scannedFiles.length === 0) {
  console.error('check-secrets-in-bundle: no deployment output found.');
  console.error(`Looked for: ${BUILD_DIRS.join(', ')}. Build first.`);
  process.exit(2);
}

const assetFiles = new Set(ASSET_DIRS.flatMap(filesUnder));
const leaks = [];
let bytes = 0;

for (const file of scannedFiles) {
  const text = textOf(file);
  if (text === null) continue;
  bytes += text.length;
  const where = relative(process.cwd(), file);

  for (const [name, value] of known) {
    const index = text.indexOf(value);
    if (index !== -1) {
      // Report the line number only; never the surrounding bytes.
      const line = text.slice(0, index).split('\n').length;
      leaks.push({ where, name, line, kind: 'value' });
    }
  }

  if (GOOGLE_KEY_SHAPE.test(text)) {
    leaks.push({ where, name: 'Google API key shape', kind: 'shape' });
  }
  GOOGLE_KEY_SHAPE.lastIndex = 0;

  // A server-only variable name in anything the browser can download is a
  // design error even when the value itself is absent.
  if (assetFiles.has(file)) {
    for (const name of SERVER_ONLY_NAMES) {
      if (text.includes(name)) leaks.push({ where, name, kind: 'name-in-asset' });
    }
  }
}

console.log('Secret scan of deployment output');
console.log(`  files scanned: ${scannedFiles.length} (${(bytes / 1024 / 1024).toFixed(2)} MiB of text)`);
for (const name of SERVER_ONLY_NAMES) {
  const value = known.get(name);
  console.log(
    value
      ? `  ${name}: value known (${value.length} chars) — searched for its exact value`
      : `  ${name}: no value available — name/shape scan only`,
  );
}
console.log(`  Google API key shape: searched (${leaks.filter((l) => l.kind === 'shape').length} hits)`);

if (leaks.length > 0) {
  console.error('\nFAIL: secret material found in deployment output');
  for (const leak of leaks) {
    const line = leak.line ? `:${leak.line}` : '';
    console.error(`  ${leak.where}${line}  ${leak.name} (${leak.kind})`);
  }
  process.exit(1);
}

console.log('\nPASS: no secret value and no server-only variable name in the deployment output');
