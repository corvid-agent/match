/**
 * @corvid-agent/match/result
 *
 * Optional integration helpers for Result<T, E> pattern matching.
 * Works with @corvid-agent/result or any compatible { ok, value, error } shape.
 *
 * This module is a sub-path export — the base package remains zero-dep.
 *
 * @example
 * ```ts
 * import { match, ok, err } from "@corvid-agent/match/result";
 *
 * const result = { ok: true, value: 42 } as Result<number, string>;
 *
 * match(result, [
 *   [ok((n) => n > 0), (r) => `positive: ${r.value}`],
 *   [ok(), (r) => `zero or negative: ${r.value}`],
 *   [err(), (r) => `error: ${r.error}`],
 * ]);
 * ```
 */

import { match, matchAsync, when, _, MatchError } from "./index.js";
import type { Predicate, Arm } from "./index.js";

// -- Result shape types (compatible with @corvid-agent/result) ----

/** An Ok result. */
export interface OkResult<T = unknown> {
  readonly ok: true;
  readonly value: T;
}

/** An Err result. */
export interface ErrResult<E = unknown> {
  readonly ok: false;
  readonly error: E;
}

/** A Result is either Ok or Err. */
export type Result<T = unknown, E = unknown> = OkResult<T> | ErrResult<E>;

// -- Pattern helpers ----

/**
 * Create a pattern that matches Ok results.
 *
 * - `ok()` — matches any Ok result
 * - `ok(guard)` — matches Ok results where guard(value) returns true
 *
 * @example
 * ```ts
 * ok()                      // matches any { ok: true }
 * ok((n) => n > 0)          // matches { ok: true, value: n } where n > 0
 * ok((s) => s.length > 3)   // matches Ok strings longer than 3
 * ```
 */
export function ok<T = unknown>(
  guard?: (value: T) => boolean,
): Predicate<Result<T, unknown>> {
  return ((result: Result<T, unknown>): boolean => {
    if (!result.ok) return false;
    if (guard) return guard(result.value);
    return true;
  }) as Predicate<Result<T, unknown>>;
}

/**
 * Create a pattern that matches Err results.
 *
 * - `err()` — matches any Err result
 * - `err(guard)` — matches Err results where guard(error) returns true
 *
 * @example
 * ```ts
 * err()                              // matches any { ok: false }
 * err((e) => e.code === "NOT_FOUND") // matches Err with specific code
 * err((e) => e instanceof TypeError) // matches TypeError errors
 * ```
 */
export function err<E = unknown>(
  guard?: (error: E) => boolean,
): Predicate<Result<unknown, E>> {
  return ((result: Result<unknown, E>): boolean => {
    if (result.ok) return false;
    if (guard) return guard(result.error);
    return true;
  }) as Predicate<Result<unknown, E>>;
}

// -- Re-exports for convenience ----

export { match, matchAsync, when, _, MatchError };
export type { Predicate, Arm };
