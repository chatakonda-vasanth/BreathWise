import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Load `.env.local` into `process.env` for the live AI tests.
 *
 * The tests call the real route handler in-process, so the key has to be in the
 * test process's environment. Values already present win (CI can inject the key
 * without a file), and nothing here ever prints a value.
 */
export function loadLocalEnv(): void {
  const file = join(process.cwd(), '.env.local');
  if (!existsSync(file)) return;

  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (!match) continue;

    const name = match[1];
    if (!name || process.env[name] !== undefined) continue;

    const value = (match[2] ?? '').trim().replace(/^(['"])(.*)\1$/, '$2');
    process.env[name] = value;
  }
}
