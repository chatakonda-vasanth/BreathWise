/**
 * Next.js startup hook (stable in Next 16). Runs once per server instance, so
 * the environment report and the development limiter warning appear at startup
 * rather than on the first request.
 *
 * The check reads variable names only; it never logs a value.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { reportEnv } = await import('./lib/shared/envCheck');
  reportEnv();
}
