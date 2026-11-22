#!/usr/bin/env node
/**
 * Fail the deployment if secret material survived into the uploaded output.
 *
 *   node scripts/check-secrets-in-bundle.mjs
 *   npm run check:secrets-in-bundle
 *
 * Context: a literal `process.env.NAME` read is folded by Next at build time,
 * so building with `.env.local` present shipped its values inside the Worker
 * script. The app now reads configuration through `src/lib/env.ts`, and the
 * hosted build must run with no `.env.local` present.
 *
 * This is the proof step. Values come from the environment and from
 * `.env.local` when that file exists, then every text file in the generated
 * deployment output is searched for them. Run it AFTER a build, i.e. after the
 * build that had no `.env.local` in the tree.
 *
 * `GEMINI_MODEL` is not a credential, and its built-in default is compiled in on
 * purpose (`src/lib/constants.ts`); a match equal to that default is reported
 * as expected. A *different* configured model id appearing in the bundle is a
 * real embed and fails, exactly like a key or a token would.
 *
 * Values are never printed — only variable names, files and counts.
 * Exit status: 0 = clean, 1 = secret material embedded, 2 = nothing to scan.
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

/** Unambiguous Google API key shape, as a value-independent second check. */
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

/** The built-in model id that is expected to be compiled into the bundle. */
function compiledModelDefault() {
  try {
    const source = readFileSync('src/lib/constants.ts', 'utf8');
    return /DEFAULT_GEMINI_MODEL\s*=\s*'([^']+)'/.exec(source)?.[1] ?? null;
  } catch {
    return null;
  }
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

const modelDefault = compiledModelDefault();
const known = new Map();
const fromDotEnv = parseDotEnv('.env.local');

for (const name of SERVER_ONLY_NAMES) {
  const candidates = [process.env[name], fromDotEnv[name]];
  const value = candidates.find((candidate) => candidate && candidate.length >= MIN_VALUE_LENGTH);
  if (value) known.set(name, value);
}

const scannedFiles = [...new Set(BUILD_DIRS.flatMap(filesUnder))];
if (scannedFiles.length === 0) {
  console.error('check-secrets-in-bundle: no deployment output found.');
  console.error(`Looked for: ${BUILD_DIRS.join(', ')}. Build first.`);
  process.exit(2);
}

const assetFiles = new Set(ASSET_DIRS.flatMap(filesUnder));
const failures = [];
const expected = [];
const counts = new Map([...known.keys()].map((name) => [name, 0]));
let bytes = 0;

for (const file of scannedFiles) {
  const text = textOf(file);
  if (text === null) continue;
  bytes += text.length;
  const where = relative(process.cwd(), file);

  for (const [name, value] of known) {
    let index = text.indexOf(value);
    let hits = 0;
    while (index !== -1) {
      hits += 1;
      const line = text.slice(0, index).split('\n').length;
      const isCompiledDefault = name === 'GEMINI_MODEL' && value === modelDefault;
      const entry = { where, name, line, kind: isCompiledDefault ? 'compiled default' : 'value' };
      (isCompiledDefault ? expected : failures).push(entry);
      index = text.indexOf(value, index + value.length);
    }
    counts.set(name, (counts.get(name) ?? 0) + hits);
  }

  const shapes = text.match(GOOGLE_KEY_SHAPE) ?? [];
  for (const shape of shapes) {
    const line = text.slice(0, text.indexOf(shape)).split('\n').length;
    failures.push({ where, name: 'Google API key shape', line, kind: 'shape' });
  }

  // A server-only variable name inside anything the browser downloads is a
  // design error even when the value itself is absent.
  if (assetFiles.has(file)) {
    for (const name of SERVER_ONLY_NAMES) {
      if (text.includes(name)) failures.push({ where, name, kind: 'name in asset' });
    }
  }
}

console.log('Secret scan of deployment output');
console.log(
  `  files scanned: ${scannedFiles.length} (${(bytes / 1024 / 1024).toFixed(2)} MiB of text)`,
);
for (const name of SERVER_ONLY_NAMES) {
  const value = known.get(name);
  if (!value) {
    console.log(`  ${name}: no value available — name/shape scan only, 0 name hits`);
    continue;
  }
  const label =
    name === 'GEMINI_MODEL' && value === modelDefault
      ? `equals the compiled-in default (${modelDefault}), so occurrences are expected`
      : 'searched for its exact value';
  console.log(`  ${name}: value known (${value.length} chars) — ${label}; hits: ${counts.get(name)}`);
}
console.log(`  Google API key shape: ${failures.filter((e) => e.kind === 'shape').length} hit(s)`);

if (expected.length > 0) {
  const files = [...new Set(expected.map((entry) => entry.where))];
  console.log(`\nNOTE: ${expected.length} expected hit(s) in ${files.length} file(s):`);
  for (const file of files) console.log(`  ${file}  (compiled default model id)`);
}

if (failures.length > 0) {
  console.error('\nFAIL: secret material found in deployment output');
  for (const item of failures) {
    console.error(`  ${item.where}:${item.line}  ${item.name} (${item.kind})`);
  }
  process.exit(1);
}

console.log('\nPASS: no secret value and no server-only variable name in the deployment output');
