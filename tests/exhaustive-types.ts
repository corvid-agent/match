/**
 * Compile-time type tests for matchType exhaustive checking.
 *
 * Validate with: bunx tsc --noEmit -p tsconfig.check.json
 *
 * Lines marked @ts-expect-error MUST produce a type error.
 * If the error disappears, tsc will flag the unused directive.
 */

import { matchType } from "../src/index";

// -- Setup ------------------------------------------------------------------

type Action =
  | { type: "increment"; amount: number }
  | { type: "decrement"; amount: number }
  | { type: "reset" };

declare const action: Action;

type Event = { kind: "click"; x: number } | { kind: "hover" };

declare const event: Event;

// -- Exhaustive: all handlers present (should compile) ----------------------

matchType(action, {
  increment: (a) => a.amount,
  decrement: (a) => a.amount,
  reset: () => 0,
});

// -- With default: partial handlers + _ (should compile) --------------------

matchType(action, {
  increment: (a) => a.amount,
  _: () => 0,
});

// -- All handlers + default (should compile) --------------------------------

matchType(action, {
  increment: (a) => a.amount,
  decrement: (a) => a.amount,
  reset: () => 0,
  _: () => -1,
});

// -- Missing handler, no default (should error) -----------------------------

// @ts-expect-error — "reset" handler missing, no default "_"
matchType(action, {
  increment: (a) => a.amount,
  decrement: (a) => a.amount,
});

// @ts-expect-error — "decrement" and "reset" handlers missing, no default "_"
matchType(action, {
  increment: (a) => a.amount,
});

// @ts-expect-error — empty handlers, no default "_"
matchType(action, {});

// -- Custom key: exhaustive (should compile) --------------------------------

matchType(
  event,
  {
    click: (e) => e.x,
    hover: () => null,
  },
  { key: "kind" },
);

// -- Custom key: with default (should compile) ------------------------------

matchType(
  event,
  {
    click: (e) => e.x,
    _: () => null,
  },
  { key: "kind" },
);

// -- Custom key: missing handler (should error) -----------------------------

matchType(
  event,
  // @ts-expect-error — "hover" handler missing, no default "_"
  { click: (e: { kind: "click"; x: number }) => e.x },
  { key: "kind" },
);

// -- Handler receives narrowed type -----------------------------------------

matchType(action, {
  increment: (a) => {
    // a should be { type: "increment"; amount: number }
    const _amount: number = a.amount;
    const _type: "increment" = a.type;
    return _amount;
  },
  decrement: (a) => {
    const _amount: number = a.amount;
    const _type: "decrement" = a.type;
    return _amount;
  },
  reset: (a) => {
    const _type: "reset" = a.type;
    return 0;
  },
});

// -- Return type inference --------------------------------------------------

const numResult: number = matchType(action, {
  increment: (a) => a.amount,
  decrement: (a) => a.amount,
  reset: () => 0,
});

const strResult: string = matchType(action, {
  increment: () => "inc",
  decrement: () => "dec",
  reset: () => "res",
});

void numResult;
void strResult;
