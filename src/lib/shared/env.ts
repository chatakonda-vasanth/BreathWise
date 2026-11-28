/**
 * Runtime-only reads of server configuration.
 *
 * Why this module exists: a literal `process.env` read of a secret name is
 * visible to the bundler at build time, and Next replaces it with whatever value
 * it loaded from `.env.local`. That baked every secret into the Worker bundle —
 * the value sat in `deploy-entry.js` even though no browser ever received it.
 *
 * Reading through a dynamic key (`runtime.process?.env?.[name]`) is a plain
 * property lookup the bundler cannot fold, so the bundle carries only the
 * variable *name*. The value is resolved inside the running Worker, where
 * Cloudflare's `nodejs_compat` exposes Sites secrets as `process.env` entries.
 * The same call works under `node` (local dev and tests), where `process.env`
 * is the real environment.
 */

interface ProcessLike {
  env?: Record<string, string | undefined>;
}

/**
 * Server-side configuration value, read at request time, or `undefined`.
 *
 * Never log, echo or return the result: every caller treats it as a secret
 * until it has been validated.
 */
export function readEnv(name: string): string | undefined {
  const runtime = (globalThis as { process?: ProcessLike }).process;
  const value = runtime?.env?.[name];
  return typeof value === 'string' ? value : undefined;
}
