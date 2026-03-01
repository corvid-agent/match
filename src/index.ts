// -- Types ----------------------------------------------------------------

/** A guard function that narrows the input type. */
export type Guard<T, N extends T = T> = (value: T) => value is N;

/** A predicate function that tests a value. */
export type Predicate<T> = (value: T) => boolean;

/** A handler that transforms a matched value into a result. */
export type Handler<T, R> = (value: T) => R;

/** A handler that receives both the matched value and extracted data. */
export type ExtractHandler<T, E, R> = (value: T, extracted: E) => R;

/** Pattern for matching values — a literal, predicate, guard, or constructor. */
export type Pattern<T> =
  | T
  | Predicate<T>
  | Guard<T, T>
  | { new (...args: any[]): T };

/** Extracts the narrowed type from a pattern. */
export type PatternType<T, P> = P extends Guard<T, infer N>
  ? N
  : P extends { new (...args: any[]): infer I }
    ? I
    : T;

/** A single arm in a match expression: [pattern, handler]. */
export type Arm<T, R> = readonly [Pattern<T>, Handler<T, R>];

/** An arm with an extracting pattern that passes match data to the handler. */
export type ExtractArm<T, E, R> = readonly [
  ExtractingPattern<T, E>,
  ExtractHandler<T, E, R>,
];

/** Configuration for discriminated union matching. */
export interface MatchOptions {
  /** The discriminant property name. Defaults to "type". */
  key?: string;
}

// -- Extracting pattern protocol --------------------------------------------

const EXTRACT = Symbol("match.extract");

/**
 * A pattern that extracts data on match, passing it to the handler.
 * Implement `[EXTRACT](value)` returning the extracted data or `undefined`
 * if the pattern does not match.
 */
export interface ExtractingPattern<T, E> {
  [EXTRACT](value: T): E | undefined;
}

/** @internal Check whether a pattern implements the extracting protocol. */
function isExtractingPattern<T>(
  p: unknown,
): p is ExtractingPattern<T, unknown> {
  return (
    typeof p === "object" &&
    p !== null &&
    EXTRACT in p &&
    typeof (p as any)[EXTRACT] === "function"
  );
}

// -- Wildcard ---------------------------------------------------------------

const WILDCARD = Symbol("match.wildcard");

/**
 * Wildcard pattern that matches any value.
 * Use as the catch-all arm in a match expression.
 *
 * @example
 * ```ts
 * match(value, [
 *   [42, () => "the answer"],
 *   [_, (v) => `got: ${v}`],
 * ]);
 * ```
 */
export const _: unique symbol = WILDCARD as any;

// -- Helpers ----------------------------------------------------------------

/** @internal Test whether a pattern matches a value. */
function testPattern<T>(pattern: Pattern<T>, value: T): boolean {
  // Wildcard
  if (pattern === WILDCARD) return true;

  // Predicate or guard function
  if (typeof pattern === "function") {
    // Constructor check: has .prototype and isn't a plain arrow function
    const fn = pattern as Function;
    if (
      fn.prototype !== undefined &&
      fn.prototype !== Function.prototype &&
      fn.prototype.constructor === fn
    ) {
      return value instanceof (fn as new (...args: any[]) => any);
    }
    return (pattern as Predicate<T>)(value);
  }

  // Deep equality for objects/arrays
  if (
    typeof pattern === "object" &&
    pattern !== null &&
    typeof value === "object" &&
    value !== null
  ) {
    return deepPartialMatch(pattern, value);
  }

  // Strict equality for primitives
  return Object.is(pattern, value);
}

/** @internal Deep partial match — every key in pattern must match in value. */
function deepPartialMatch(pattern: any, value: any): boolean {
  if (Object.is(pattern, value)) return true;
  if (pattern === null || value === null) return false;
  if (typeof pattern !== "object" || typeof value !== "object") return false;

  if (Array.isArray(pattern)) {
    if (!Array.isArray(value)) return false;
    if (pattern.length !== value.length) return false;
    return pattern.every((p, i) => deepPartialMatch(p, i < value.length ? value[i] : undefined));
  }

  const keys = Object.keys(pattern);
  return keys.every((k) => deepPartialMatch(pattern[k], value[k]));
}

// -- match() ----------------------------------------------------------------

/**
 * Match a value against a list of pattern arms.
 *
 * Each arm is a `[pattern, handler]` tuple. The first matching pattern wins.
 * Throws if no pattern matches (use `_` wildcard for exhaustive matching).
 *
 * @example
 * ```ts
 * const result = match(status, [
 *   [200, () => "ok"],
 *   [404, () => "not found"],
 *   [(s) => s >= 500, () => "server error"],
 *   [_, () => "unknown"],
 * ]);
 * ```
 */
export function match<T, R>(
  value: T,
  arms: ReadonlyArray<Arm<T, R> | ExtractArm<T, any, R>>,
): R {
  for (const [pattern, handler] of arms) {
    if (isExtractingPattern<T>(pattern)) {
      const extracted = pattern[EXTRACT](value);
      if (extracted !== undefined) {
        return (handler as ExtractHandler<T, any, R>)(value, extracted);
      }
      continue;
    }
    if (testPattern(pattern as Pattern<T>, value)) {
      return (handler as Handler<T, R>)(value);
    }
  }
  throw new MatchError(value);
}

// -- matchAsync() -----------------------------------------------------------

/**
 * Async variant of `match`. Handlers can return promises.
 *
 * @example
 * ```ts
 * const data = await matchAsync(action, [
 *   ["fetch", async () => await fetchData()],
 *   ["cache", async () => await readCache()],
 *   [_, async () => null],
 * ]);
 * ```
 */
export async function matchAsync<T, R>(
  value: T,
  arms: ReadonlyArray<
    | readonly [Pattern<T>, (value: T) => R | Promise<R>]
    | readonly [ExtractingPattern<T, any>, (value: T, extracted: any) => R | Promise<R>]
  >,
): Promise<R> {
  for (const [pattern, handler] of arms) {
    if (isExtractingPattern<T>(pattern)) {
      const extracted = pattern[EXTRACT](value);
      if (extracted !== undefined) {
        return (handler as (v: T, e: any) => R | Promise<R>)(value, extracted);
      }
      continue;
    }
    if (testPattern(pattern as Pattern<T>, value)) {
      return (handler as (v: T) => R | Promise<R>)(value);
    }
  }
  throw new MatchError(value);
}

// -- matchType() ------------------------------------------------------------

/**
 * Match a discriminated union by its tag property.
 *
 * Provides a cleaner API for tagged unions — supply an object mapping
 * each tag to its handler. Optionally provide a `_` key for the default.
 *
 * @example
 * ```ts
 * type Action =
 *   | { type: "increment"; amount: number }
 *   | { type: "reset" };
 *
 * const next = matchType(action, {
 *   increment: (a) => state + a.amount,
 *   reset: () => 0,
 * });
 * ```
 */
export function matchType<
  T extends Record<string, any>,
  K extends string,
  H extends Partial<{ [Tag in T[K & keyof T]]: (value: T) => any }> & { _?: (value: T) => any },
>(
  value: T,
  handlers: H,
  options?: MatchOptions,
): ReturnType<Exclude<H[keyof H], undefined>> {
  const key = (options?.key ?? "type") as keyof T;
  const tag = value[key] as string;
  const handler = (handlers as any)[tag] ?? (handlers as any)._;
  if (!handler) {
    throw new MatchError(value, `No handler for tag "${tag}"`);
  }
  return handler(value);
}

// -- when() -----------------------------------------------------------------

/**
 * Build a match expression fluently using a builder pattern.
 *
 * @example
 * ```ts
 * const label = when(statusCode)
 *   .is(200, () => "ok")
 *   .is(404, () => "not found")
 *   .range(500, 599, () => "server error")
 *   .otherwise(() => "unknown")
 *   .run();
 * ```
 */
export function when<T>(value: T): WhenBuilder<T, never> {
  return new WhenBuilder(value);
}

/**
 * Fluent match builder.
 *
 * Chain `.is()`, `.in()`, `.range()`, `.guard()` calls to add arms,
 * then call `.otherwise()` or `.run()` to execute.
 */
export class WhenBuilder<T, R> {
  private value: T;
  private arms: Array<Arm<T, any>> = [];

  /** @internal */
  constructor(value: T) {
    this.value = value;
  }

  /**
   * Add an arm that matches a specific pattern.
   *
   * @example
   * ```ts
   * when(x).is(42, () => "the answer")
   * ```
   */
  is<R2>(pattern: Pattern<T>, handler: Handler<T, R2>): WhenBuilder<T, R | R2> {
    this.arms.push([pattern, handler]);
    return this as unknown as WhenBuilder<T, R | R2>;
  }

  /**
   * Add an arm that matches if the value is in a set.
   *
   * @example
   * ```ts
   * when(color).in(["red", "blue"], () => "primary")
   * ```
   */
  in<R2>(values: readonly T[], handler: Handler<T, R2>): WhenBuilder<T, R | R2> {
    this.arms.push([(v: T) => values.includes(v), handler]);
    return this as unknown as WhenBuilder<T, R | R2>;
  }

  /**
   * Add an arm that matches if a numeric value is in a range (inclusive).
   *
   * @example
   * ```ts
   * when(score).range(90, 100, () => "A")
   * ```
   */
  range<R2>(
    min: number,
    max: number,
    handler: Handler<T, R2>,
  ): WhenBuilder<T, R | R2> {
    this.arms.push([
      (v: T) => typeof v === "number" && v >= min && v <= max,
      handler,
    ]);
    return this as unknown as WhenBuilder<T, R | R2>;
  }

  /**
   * Add an arm with a guard function.
   *
   * @example
   * ```ts
   * when(value).guard(isString, (s) => s.toUpperCase())
   * ```
   */
  guard<N extends T, R2>(
    guard: Guard<T, N>,
    handler: Handler<N, R2>,
  ): WhenBuilder<T, R | R2> {
    this.arms.push([guard as Pattern<T>, handler as Handler<T, R2>]);
    return this as unknown as WhenBuilder<T, R | R2>;
  }

  /**
   * Set the default handler (must be last, makes matching exhaustive).
   * Automatically calls `run()` and returns the result.
   *
   * @example
   * ```ts
   * const result = when(x)
   *   .is(1, () => "one")
   *   .otherwise(() => "other");
   * ```
   */
  otherwise<R2>(handler: Handler<T, R2>): R | R2 {
    this.arms.push([_ as unknown as Pattern<T>, handler]);
    return this.run() as R | R2;
  }

  /**
   * Execute the match. Throws `MatchError` if no arm matches.
   *
   * @example
   * ```ts
   * const result = when(x).is(1, () => "one").run();
   * ```
   */
  run(): R {
    return match(this.value, this.arms);
  }
}

// -- Utility matchers -------------------------------------------------------

/**
 * Create a pattern that matches if the value is an instance of the given class.
 *
 * @example
 * ```ts
 * match(err, [
 *   [instanceOf(TypeError), () => "type error"],
 *   [instanceOf(RangeError), () => "range error"],
 *   [_, () => "unknown error"],
 * ]);
 * ```
 */
export function instanceOf<C extends abstract new (...args: any[]) => any>(
  ctor: C,
): Guard<unknown, InstanceType<C>> {
  return ((value: unknown): value is InstanceType<C> =>
    value instanceof ctor) as Guard<unknown, InstanceType<C>>;
}

/**
 * Create a pattern that matches values by partial shape.
 *
 * @example
 * ```ts
 * match(event, [
 *   [shape({ type: "click", button: 0 }), () => "left click"],
 *   [shape({ type: "click" }), () => "other click"],
 *   [_, () => "not a click"],
 * ]);
 * ```
 */
export function shape<T extends Record<string, any>>(
  partial: Partial<T>,
): Predicate<T> {
  return (value: T) => deepPartialMatch(partial, value);
}

/**
 * Create a pattern that matches if ALL sub-patterns match.
 *
 * @example
 * ```ts
 * match(n, [
 *   [allOf((n) => n > 0, (n) => n < 100), () => "1-99"],
 *   [_, () => "out of range"],
 * ]);
 * ```
 */
export function allOf<T>(...patterns: Pattern<T>[]): Predicate<T> {
  return (value: T) => patterns.every((p) => testPattern(p, value));
}

/**
 * Create a pattern that matches if ANY sub-pattern matches.
 *
 * @example
 * ```ts
 * match(status, [
 *   [anyOf(200, 201, 204), () => "success"],
 *   [anyOf(400, 422), () => "client error"],
 *   [_, () => "other"],
 * ]);
 * ```
 */
export function anyOf<T>(...patterns: Pattern<T>[]): Predicate<T> {
  return (value: T) => patterns.some((p) => testPattern(p, value));
}

/**
 * Create a pattern that matches if the sub-pattern does NOT match.
 *
 * @example
 * ```ts
 * match(n, [
 *   [not(0), () => "non-zero"],
 *   [_, () => "zero"],
 * ]);
 * ```
 */
export function not<T>(pattern: Pattern<T>): Predicate<T> {
  return (value: T) => !testPattern(pattern, value);
}

/**
 * Create a pattern that matches string values against a regular expression.
 * When matched, the handler receives the match groups as a second argument.
 *
 * @example
 * ```ts
 * match(input, [
 *   [regex(/^(\d+)-(\d+)$/), (v, [, start, end]) => ({ start, end })],
 *   [regex(/^\d+$/), (v) => ({ single: v })],
 *   [_, () => null],
 * ]);
 * ```
 */
export function regex(pattern: RegExp): ExtractingPattern<unknown, RegExpMatchArray> {
  return {
    [EXTRACT](value: unknown): RegExpMatchArray | undefined {
      if (typeof value !== "string") return undefined;
      const m = value.match(pattern);
      return m ?? undefined;
    },
  };
}

// -- Built-in guards --------------------------------------------------------

/** Guard that checks if a value is a string. */
export const isString: Guard<unknown, string> = (v): v is string =>
  typeof v === "string";

/** Guard that checks if a value is a number (excluding NaN). */
export const isNumber: Guard<unknown, number> = (v): v is number =>
  typeof v === "number" && !Number.isNaN(v);

/** Guard that checks if a value is a boolean. */
export const isBoolean: Guard<unknown, boolean> = (v): v is boolean =>
  typeof v === "boolean";

/** Guard that checks if a value is null or undefined. */
export const isNullish: Guard<unknown, null | undefined> = (
  v,
): v is null | undefined => v === null || v === undefined;

/** Guard that checks if a value is an array. */
export const isArray: Guard<unknown, unknown[]> = (v): v is unknown[] =>
  Array.isArray(v);

// -- Errors -----------------------------------------------------------------

/**
 * Error thrown when no pattern matches the input value.
 */
export class MatchError extends Error {
  /** The value that failed to match. */
  readonly value: unknown;

  constructor(value: unknown, message?: string) {
    const msg =
      message ?? `No matching pattern for value: ${formatValue(value)}`;
    super(msg);
    this.name = "MatchError";
    this.value = value;
  }
}

/** @internal Format a value for error messages. */
function formatValue(value: unknown): string {
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "object" && value !== null) {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}
