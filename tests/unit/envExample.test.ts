import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * `.env.example` is documentation only if it is true, so this test keeps it
 * honest in both directions:
 *
 *  - every variable the code reads is documented (a new secret cannot ship
 *    undocumented);
 *  - every variable documented is read somewhere (no dead configuration that
 *    looks like a supported knob).
 *
 * `NODE_ENV` and `NEXT_RUNTIME` are runtime flags supplied by the platform, not
 * deployment configuration, so they are excluded.
 */

const ROOT = join(__dirname, '..', '..');
const PLATFORM_FLAGS = new Set(['NODE_ENV', 'NEXT_RUNTIME']);

function sourceFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) sourceFiles(full, found);
    else if (full.endsWith('.ts') || full.endsWith('.tsx')) found.push(full);
  }
  return found;
}

function envNamesReadByCode(): Set<string> {
  const names = new Set<string>();
  const patterns = [
    /readEnv\(\s*'([A-Z][A-Z0-9_]*)'/g,
    /process\.env\.([A-Z][A-Z0-9_]*)/g,
  ];
  for (const file of sourceFiles(join(ROOT, 'src'))) {
    const source = readFileSync(file, 'utf8');
    for (const pattern of patterns) {
      for (const match of source.matchAll(pattern)) {
        if (match[1] && !PLATFORM_FLAGS.has(match[1])) names.add(match[1]);
      }
    }
  }
  return names;
}

function envNamesDocumented(): Set<string> {
  const names = new Set<string>();
  const example = readFileSync(join(ROOT, '.env.example'), 'utf8');
  // Matches both `NAME=` and the commented-out `# NAME=`, because a documented
  // optional knob is written the second way.
  for (const match of example.matchAll(/^#?\s*([A-Z][A-Z0-9_]*)=/gm)) {
    if (match[1]) names.add(match[1]);
  }
  return names;
}

describe('.env.example', () => {
  it('documents every variable the code reads', () => {
    const read = envNamesReadByCode();
    expect(read.size).toBeGreaterThan(0);
    const undocumented = [...read]
      .filter((name) => !envNamesDocumented().has(name))
      .sort();
    expect(undocumented).toEqual([]);
  });

  it('documents nothing the code never reads', () => {
    const read = envNamesReadByCode();
    const unused = [...envNamesDocumented()].filter((name) => !read.has(name)).sort();
    expect(unused).toEqual([]);
  });

  it('never contains a value that looks like a real credential', () => {
    const example = readFileSync(join(ROOT, '.env.example'), 'utf8');
    expect(example).not.toMatch(/AIza[0-9A-Za-z_-]{30,}/);
    for (const match of example.matchAll(/^([A-Z][A-Z0-9_]*)=(.*)$/gm)) {
      const [, name, value] = match;
      if (name && /KEY|TOKEN|SECRET/.test(name)) {
        expect(value?.trim(), `${name} must be blank in the example`).toBe('');
      }
    }
  });
});
