import { z } from 'zod';

/**
 * Disable zod's JIT fast path everywhere.
 *
 * By default zod probes support with `Function("")`, which a strict
 * `script-src` policy blocks. The probe is caught and zod falls back, but Chrome
 * still logs a CSP violation (Lighthouse "inspector-issues"), and building code
 * at runtime is exactly what `unsafe-eval` exists for. Running jitless means no
 * dynamic code generation happens anywhere in this app, on server or client.
 *
 * This module must be imported before the first schema parse; it has no exports
 * by design so it reads as an intentional side effect.
 */
z.config({ jitless: true });
