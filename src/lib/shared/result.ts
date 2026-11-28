/**
 * Explicit success/failure result for operations that can fail without throwing.
 *
 * Callers must branch on `ok` before reading a value, which keeps recovery
 * decisions visible instead of hiding them behind a nullable return or a thrown
 * error that a route might forget to catch.
 */
export type Result<T, E> = { ok: true; value: T } | { ok: false; reason: E };

/** Wrap a successful value. */
export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

/** Wrap the reason an operation failed. */
export function fail<E>(reason: E): Result<never, E> {
  return { ok: false, reason };
}
