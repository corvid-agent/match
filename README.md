# @corvid-agent/match

[![CI](https://github.com/corvid-agent/match/actions/workflows/ci.yml/badge.svg)](https://github.com/corvid-agent/match/actions/workflows/ci.yml)
![Zero Dependencies](https://img.shields.io/badge/dependencies-0-brightgreen)

Type-safe pattern matching with exhaustive checks, guards, and result extraction. Zero deps. TypeScript-first.

Brings the power of Rust's `match` and functional pattern matching to TypeScript — with full type inference, discriminated union support, and a fluent builder API.

## Install

```bash
npm install @corvid-agent/match
```

## Quick Start

```ts
import { match, _ } from "@corvid-agent/match";

const label = match(statusCode, [
  [200, () => "OK"],
  [404, () => "Not Found"],
  [(s) => s >= 500, () => "Server Error"],
  [_, () => "Unknown"],
]);
```

## Features

### Literal Matching

Match exact values with strict equality (`Object.is`):

```ts
match(color, [
  ["red", () => "#ff0000"],
  ["green", () => "#00ff00"],
  ["blue", () => "#0000ff"],
  [_, () => "#000000"],
]);
```

### Predicate Matching

Use functions to test values:

```ts
match(age, [
  [(a) => a < 13, () => "child"],
  [(a) => a < 20, () => "teen"],
  [(a) => a < 65, () => "adult"],
  [_, () => "senior"],
]);
```

### Discriminated Unions with `matchType`

Clean matching for tagged unions — no boilerplate:

```ts
import { matchType } from "@corvid-agent/match";

type Action =
  | { type: "increment"; amount: number }
  | { type: "decrement"; amount: number }
  | { type: "reset" };

const nextState = matchType(action, {
  increment: (a) => state + a.amount,
  decrement: (a) => state - a.amount,
  reset: () => 0,
});
```

Custom discriminant key:

```ts
matchType(event, { click: handler, hover: handler }, { key: "kind" });
```

### Fluent Builder with `when`

Chain patterns with a readable builder API:

```ts
import { when } from "@corvid-agent/match";

const grade = when(score)
  .range(90, 100, () => "A")
  .range(80, 89, () => "B")
  .range(70, 79, () => "C")
  .range(60, 69, () => "D")
  .otherwise(() => "F");
```

Builder methods:

```ts
when(value)
  .is(pattern, handler)       // match a pattern
  .in([a, b, c], handler)     // match set membership
  .range(min, max, handler)   // match numeric range (inclusive)
  .guard(typeguard, handler)  // match with type narrowing
  .otherwise(handler)         // default (auto-runs)
  .run()                      // execute without default (may throw)
```

### Combinators

Compose patterns with `allOf`, `anyOf`, and `not`:

```ts
import { allOf, anyOf, not } from "@corvid-agent/match";

match(status, [
  [anyOf(200, 201, 204), () => "success"],
  [allOf((s) => s >= 400, (s) => s < 500), () => "client error"],
  [not(0), () => "non-zero"],
  [_, () => "other"],
]);
```

### Shape Matching

Match objects by partial structure:

```ts
import { shape } from "@corvid-agent/match";

match(event, [
  [shape({ type: "click", button: 0 }), () => "left click"],
  [shape({ type: "click" }), () => "other click"],
  [shape({ type: "keydown" }), () => "key press"],
  [_, () => "unknown event"],
]);
```

### Instance Matching

Match class instances:

```ts
import { instanceOf } from "@corvid-agent/match";

match(error, [
  [instanceOf(TypeError), () => "type error"],
  [instanceOf(RangeError), () => "range error"],
  [_, () => "unknown error"],
]);
```

### Built-in Guards

Type-narrowing guards for common checks:

```ts
import { isString, isNumber, isBoolean, isNullish, isArray } from "@corvid-agent/match";

const result = when(input)
  .guard(isString, (s) => s.toUpperCase())
  .guard(isNumber, (n) => n.toFixed(2))
  .guard(isNullish, () => "empty")
  .guard(isArray, (a) => a.join(", "))
  .otherwise(() => "unknown");
```

### Async Matching

Handlers can return promises:

```ts
import { matchAsync } from "@corvid-agent/match";

const data = await matchAsync(source, [
  ["api", async () => await fetchFromAPI()],
  ["cache", async () => await readCache()],
  [_, async () => null],
]);
```

## Exhaustive Matching

If no pattern matches, `match` throws a `MatchError`:

```ts
import { MatchError } from "@corvid-agent/match";

try {
  match(value, [[1, () => "one"]]);
} catch (err) {
  if (err instanceof MatchError) {
    console.log(err.value);   // the unmatched value
    console.log(err.message); // "No matching pattern for value: ..."
  }
}
```

Use the `_` wildcard as a catch-all to ensure exhaustive matching.

## API Reference

### `match(value, arms)`

Match a value against an array of `[pattern, handler]` arms. Returns the result of the first matching handler.

### `matchAsync(value, arms)`

Async variant — handlers can return `Promise<R>`.

### `matchType(value, handlers, options?)`

Match a discriminated union by tag. `handlers` is an object mapping tags to handlers. Use `_` key for default.

| Option | Type     | Default  | Description               |
| ------ | -------- | -------- | ------------------------- |
| `key`  | `string` | `"type"` | The discriminant property. |

### `when(value)`

Create a fluent match builder. Chain `.is()`, `.in()`, `.range()`, `.guard()`, then `.otherwise()` or `.run()`.

### Combinators

| Function             | Description                            |
| -------------------- | -------------------------------------- |
| `anyOf(...patterns)` | Matches if ANY pattern matches (OR).   |
| `allOf(...patterns)` | Matches if ALL patterns match (AND).   |
| `not(pattern)`       | Matches if the pattern does NOT match. |
| `shape(partial)`     | Matches by partial object structure.   |
| `instanceOf(ctor)`   | Matches class instances.               |

### Guards

| Guard       | Matches                         |
| ----------- | ------------------------------- |
| `isString`  | `typeof v === "string"`         |
| `isNumber`  | `typeof v === "number"` (not NaN) |
| `isBoolean` | `typeof v === "boolean"`        |
| `isNullish` | `v === null \|\| v === undefined` |
| `isArray`   | `Array.isArray(v)`              |

### `_` (wildcard)

Matches any value. Use as the last arm for exhaustive matching.

### `MatchError`

Thrown when no pattern matches. Has a `.value` property containing the unmatched value.

## License

MIT
