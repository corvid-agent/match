import { describe, test, expect } from "bun:test";
import {
  match,
  matchAsync,
  matchType,
  when,
  _,
  instanceOf,
  shape,
  allOf,
  anyOf,
  not,
  regex,
  isString,
  isNumber,
  isBoolean,
  isNullish,
  isArray,
  MatchError,
} from "../src/index";

// -- match() ----------------------------------------------------------------

describe("match", () => {
  test("matches literal values", () => {
    expect(match(1, [[1, () => "one"]])).toBe("one");
    expect(match("hello", [["hello", () => "hi"]])).toBe("hi");
    expect(match(true, [[true, () => "yes"]])).toBe("yes");
  });

  test("matches first arm that fits", () => {
    const result = match(2, [
      [1, () => "one"],
      [2, () => "two"],
      [2, () => "also two"],
    ]);
    expect(result).toBe("two");
  });

  test("passes matched value to handler", () => {
    const result = match(42, [[42, (v) => v * 2]]);
    expect(result).toBe(84);
  });

  test("matches with predicate functions", () => {
    const result = match(15, [
      [(n: number) => n > 10, () => "big"],
      [_, () => "small"],
    ]);
    expect(result).toBe("big");
  });

  test("matches with wildcard", () => {
    const result = match("anything", [
      [_, (v) => `got: ${v}`],
    ]);
    expect(result).toBe("got: anything");
  });

  test("wildcard catches unmatched values", () => {
    const result = match(99, [
      [1, () => "one"],
      [2, () => "two"],
      [_, () => "other"],
    ]);
    expect(result).toBe("other");
  });

  test("throws MatchError when no pattern matches", () => {
    expect(() => match(3, [[1, () => "one"]])).toThrow(MatchError);
  });

  test("MatchError contains the unmatched value", () => {
    try {
      match(42, [[1, () => "one"]]);
    } catch (err) {
      expect(err).toBeInstanceOf(MatchError);
      expect((err as MatchError).value).toBe(42);
      expect((err as MatchError).message).toContain("42");
    }
  });

  test("MatchError formats strings with quotes", () => {
    try {
      match("oops", [[1 as any, () => ""]]);
    } catch (err) {
      expect((err as MatchError).message).toContain('"oops"');
    }
  });

  test("MatchError formats objects as JSON", () => {
    try {
      match({ x: 1 }, [[{ y: 2 } as any, () => ""]]);
    } catch (err) {
      expect((err as MatchError).message).toContain('{"x":1}');
    }
  });

  test("matches NaN with predicate", () => {
    const result = match(NaN, [
      [(v: number) => Number.isNaN(v), () => "nan"],
      [_, () => "number"],
    ]);
    expect(result).toBe("nan");
  });

  test("matches null and undefined", () => {
    expect(match(null, [[null, () => "null"]])).toBe("null");
    expect(match(undefined, [[undefined, () => "undef"]])).toBe("undef");
  });

  test("matches object shape as pattern", () => {
    type Ev = { type: string; x: number };
    const result = match<Ev, string>({ type: "click", x: 10 }, [
      [{ type: "click", x: 10 } as Ev, () => "exact click"],
      [_, () => "other"],
    ]);
    expect(result).toBe("exact click");
  });

  test("partial object match with deep equality", () => {
    type Obj = { a: number; b: { c: number } };
    const result = match<Obj, string>({ a: 1, b: { c: 2 } }, [
      [{ a: 1, b: { c: 2 } } as Obj, () => "deep match"],
      [_, () => "no match"],
    ]);
    expect(result).toBe("deep match");
  });

  test("array pattern matches by equality", () => {
    const result = match<number[], string>([1, 2, 3], [
      [[1, 2, 3], () => "matched"],
      [_, () => "no"],
    ]);
    expect(result).toBe("matched");
  });

  test("array pattern does not match different length", () => {
    const result = match<number[], string>([1, 2], [
      [[1, 2, 3], () => "three"],
      [_, () => "other"],
    ]);
    expect(result).toBe("other");
  });
});

// -- matchAsync() -----------------------------------------------------------

describe("matchAsync", () => {
  test("resolves async handlers", async () => {
    const result = await matchAsync(1, [
      [1, async () => "one"],
    ]);
    expect(result).toBe("one");
  });

  test("works with sync handlers too", async () => {
    const result = await matchAsync(2, [
      [2, () => "two"],
    ]);
    expect(result).toBe("two");
  });

  test("throws MatchError when no pattern matches", async () => {
    await expect(
      matchAsync(99, [[1, async () => "one"]]),
    ).rejects.toThrow(MatchError);
  });

  test("handles async operations in handlers", async () => {
    const result = await matchAsync("fetch", [
      [
        "fetch",
        async () => {
          await new Promise((r) => setTimeout(r, 10));
          return "data";
        },
      ],
      [_, async () => null],
    ]);
    expect(result).toBe("data");
  });
});

// -- matchType() ------------------------------------------------------------

describe("matchType", () => {
  type Action =
    | { type: "increment"; amount: number }
    | { type: "decrement"; amount: number }
    | { type: "reset" };

  test("matches by type discriminant", () => {
    const action: Action = { type: "increment", amount: 5 };
    const result = matchType(action, {
      increment: (a) => `+${a.amount}`,
      decrement: (a) => `-${a.amount}`,
      reset: () => "0",
    });
    expect(result).toBe("+5");
  });

  test("matches reset action", () => {
    const action: Action = { type: "reset" };
    const result = matchType(action, {
      increment: () => "inc",
      decrement: () => "dec",
      reset: () => "reset!",
    });
    expect(result).toBe("reset!");
  });

  test("uses default handler with _ key", () => {
    const action: Action = { type: "reset" };
    const result = matchType(action, {
      increment: () => "inc",
      _: () => "default",
    });
    expect(result).toBe("default");
  });

  test("throws when no handler and no default", () => {
    const action: Action = { type: "reset" };
    expect(() =>
      matchType(action, {
        increment: () => "inc",
      }),
    ).toThrow(MatchError);
  });

  test("supports custom discriminant key", () => {
    type Event = { kind: "click" } | { kind: "hover" };
    const event: Event = { kind: "click" };
    const result = matchType(
      event,
      {
        click: () => "clicked",
        hover: () => "hovered",
      },
      { key: "kind" },
    );
    expect(result).toBe("clicked");
  });
});

// -- when() builder ---------------------------------------------------------

describe("when", () => {
  test("basic is() matching", () => {
    const result = when(1)
      .is(1, () => "one")
      .is(2, () => "two")
      .run();
    expect(result).toBe("one");
  });

  test("otherwise() provides default and auto-runs", () => {
    const result = when(99)
      .is(1, () => "one")
      .otherwise(() => "other");
    expect(result).toBe("other");
  });

  test("in() matches set membership", () => {
    const result = when("blue")
      .in(["red", "blue", "green"], () => "primary-ish")
      .otherwise(() => "other");
    expect(result).toBe("primary-ish");
  });

  test("in() does not match non-members", () => {
    const result = when("purple")
      .in(["red", "blue"], () => "primary")
      .otherwise(() => "other");
    expect(result).toBe("other");
  });

  test("range() matches inclusive numeric range", () => {
    const result = when(85)
      .range(90, 100, () => "A")
      .range(80, 89, () => "B")
      .range(70, 79, () => "C")
      .otherwise(() => "F");
    expect(result).toBe("B");
  });

  test("range() includes boundaries", () => {
    expect(when(90).range(90, 100, () => "hit").otherwise(() => "miss")).toBe("hit");
    expect(when(100).range(90, 100, () => "hit").otherwise(() => "miss")).toBe("hit");
  });

  test("range() excludes non-numbers", () => {
    const result = when("hello" as any)
      .range(0, 100, () => "in range")
      .otherwise(() => "not a number");
    expect(result).toBe("not a number");
  });

  test("guard() narrows type", () => {
    const value: unknown = "hello";
    const result = when(value)
      .guard(isString, (s) => s.toUpperCase())
      .guard(isNumber, (n) => n.toFixed(2))
      .otherwise(() => "unknown");
    expect(result).toBe("HELLO");
  });

  test("throws MatchError when run() has no match", () => {
    expect(() =>
      when(42).is(1, () => "one").run(),
    ).toThrow(MatchError);
  });

  test("chaining multiple patterns", () => {
    const classify = (n: number) =>
      when(n)
        .is(0, () => "zero")
        .is(1, () => "one")
        .range(2, 9, () => "single digit")
        .range(10, 99, () => "double digit")
        .otherwise(() => "big");

    expect(classify(0)).toBe("zero");
    expect(classify(1)).toBe("one");
    expect(classify(5)).toBe("single digit");
    expect(classify(42)).toBe("double digit");
    expect(classify(100)).toBe("big");
  });
});

// -- Utility matchers -------------------------------------------------------

describe("instanceOf", () => {
  test("matches class instances", () => {
    const result = match<Error, string>(new TypeError("oops"), [
      [instanceOf(TypeError) as any, () => "type"],
      [instanceOf(RangeError) as any, () => "range"],
      [_, () => "other"],
    ]);
    expect(result).toBe("type");
  });

  test("does not match wrong class", () => {
    const result = match<Error, string>(new RangeError("oops"), [
      [instanceOf(TypeError) as any, () => "type"],
      [_, () => "other"],
    ]);
    expect(result).toBe("other");
  });

  test("matches subclasses", () => {
    class Base {}
    class Child extends Base {}
    const result = match<Base, string>(new Child(), [
      [instanceOf(Base) as any, () => "base or child"],
      [_, () => "other"],
    ]);
    expect(result).toBe("base or child");
  });
});

describe("shape", () => {
  test("matches partial object shape", () => {
    type User = { name: string; age: number; role: string };
    const user: User = { name: "Alice", age: 30, role: "admin" };
    const result = match<User, string>(user, [
      [shape({ role: "admin" }), () => "admin"],
      [_, () => "user"],
    ]);
    expect(result).toBe("admin");
  });

  test("matches nested shape", () => {
    type Obj = { a: { b: number }; c: string };
    const obj: Obj = { a: { b: 42 }, c: "hello" };
    const result = match<Obj, string>(obj, [
      [shape({ a: { b: 42 } }), () => "deep match"],
      [_, () => "no"],
    ]);
    expect(result).toBe("deep match");
  });

  test("does not match when shape differs", () => {
    type User = { name: string; age: number };
    const user: User = { name: "Bob", age: 25 };
    const result = match<User, string>(user, [
      [shape({ name: "Alice" }), () => "alice"],
      [_, () => "not alice"],
    ]);
    expect(result).toBe("not alice");
  });
});

describe("allOf", () => {
  test("matches when all patterns match", () => {
    const result = match(15, [
      [allOf((n: number) => n > 10, (n: number) => n < 20), () => "teen"],
      [_, () => "other"],
    ]);
    expect(result).toBe("teen");
  });

  test("does not match when any pattern fails", () => {
    const result = match(25, [
      [allOf((n: number) => n > 10, (n: number) => n < 20), () => "teen"],
      [_, () => "other"],
    ]);
    expect(result).toBe("other");
  });
});

describe("anyOf", () => {
  test("matches when any pattern matches", () => {
    const result = match(200, [
      [anyOf(200, 201, 204), () => "success"],
      [_, () => "other"],
    ]);
    expect(result).toBe("success");
  });

  test("matches second alternative", () => {
    const result = match(201, [
      [anyOf(200, 201, 204), () => "success"],
      [_, () => "other"],
    ]);
    expect(result).toBe("success");
  });

  test("does not match when none match", () => {
    const result = match(500, [
      [anyOf(200, 201, 204), () => "success"],
      [_, () => "other"],
    ]);
    expect(result).toBe("other");
  });
});

describe("not", () => {
  test("inverts a literal pattern", () => {
    const result = match(5, [
      [not(0), () => "non-zero"],
      [_, () => "zero"],
    ]);
    expect(result).toBe("non-zero");
  });

  test("matches zero against not(0)", () => {
    const result = match(0, [
      [not(0), () => "non-zero"],
      [_, () => "zero"],
    ]);
    expect(result).toBe("zero");
  });

  test("inverts a predicate", () => {
    const result = match(5, [
      [not((n: number) => n > 10), () => "small"],
      [_, () => "big"],
    ]);
    expect(result).toBe("small");
  });
});

// -- Built-in guards --------------------------------------------------------

describe("built-in guards", () => {
  test("isString", () => {
    expect(isString("hello")).toBe(true);
    expect(isString(42)).toBe(false);
    expect(isString(null)).toBe(false);
  });

  test("isNumber", () => {
    expect(isNumber(42)).toBe(true);
    expect(isNumber(0)).toBe(true);
    expect(isNumber(NaN)).toBe(false);
    expect(isNumber("42")).toBe(false);
  });

  test("isBoolean", () => {
    expect(isBoolean(true)).toBe(true);
    expect(isBoolean(false)).toBe(true);
    expect(isBoolean(0)).toBe(false);
  });

  test("isNullish", () => {
    expect(isNullish(null)).toBe(true);
    expect(isNullish(undefined)).toBe(true);
    expect(isNullish(0)).toBe(false);
    expect(isNullish("")).toBe(false);
  });

  test("isArray", () => {
    expect(isArray([])).toBe(true);
    expect(isArray([1, 2])).toBe(true);
    expect(isArray("hello")).toBe(false);
    expect(isArray({})).toBe(false);
  });

  test("guards work with match()", () => {
    const value: unknown = 42;
    const result = match<unknown, string>(value, [
      [isString as any, () => "string"],
      [isNumber as any, () => "number"],
      [_, () => "other"],
    ]);
    expect(result).toBe("number");
  });
});

// -- regex() ----------------------------------------------------------------

describe("regex", () => {
  test("matches a simple pattern", () => {
    const result = match("hello123", [
      [regex(/^\d+$/), () => "digits"],
      [regex(/^[a-z]+\d+$/), (v) => `alphaNum: ${v}`],
      [_, () => "other"],
    ]);
    expect(result).toBe("alphaNum: hello123");
  });

  test("extracts capture groups", () => {
    const result = match("10-20", [
      [regex(/^(\d+)-(\d+)$/), (v, [, start, end]) => ({ start, end })],
      [_, () => null],
    ]);
    expect(result).toEqual({ start: "10", end: "20" });
  });

  test("provides full match as first group element", () => {
    const result = match("abc", [
      [regex(/^(a)(b)(c)$/), (_v, groups) => groups[0]],
      [_, () => "no"],
    ]);
    expect(result).toBe("abc");
  });

  test("does not match non-matching strings", () => {
    const result = match("hello", [
      [regex(/^\d+$/), () => "digits"],
      [_, () => "fallback"],
    ]);
    expect(result).toBe("fallback");
  });

  test("does not match non-string values", () => {
    const result = match(42 as any, [
      [regex(/^\d+$/), () => "digits"],
      [_, () => "not a string"],
    ]);
    expect(result).toBe("not a string");
  });

  test("works with named capture groups", () => {
    const result = match("2026-03-01", [
      [regex(/^(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})$/), (_v, groups) => groups.groups],
      [_, () => null],
    ]);
    expect(result).toEqual({ year: "2026", month: "03", day: "01" });
  });

  test("handler can ignore groups", () => {
    const result = match("test", [
      [regex(/^test$/), (v) => `matched: ${v}`],
      [_, () => "no"],
    ]);
    expect(result).toBe("matched: test");
  });

  test("works with matchAsync", async () => {
    const result = await matchAsync("abc-123", [
      [regex(/^([a-z]+)-(\d+)$/), async (_v, [, letters, digits]) => ({ letters, digits })],
      [_, async () => null],
    ]);
    expect(result).toEqual({ letters: "abc", digits: "123" });
  });

  test("can mix regex arms with regular arms", () => {
    const result = match("42", [
      ["special" as any, () => "literal"],
      [regex(/^(\d+)$/), (_v, [, num]) => `number: ${num}`],
      [_, () => "other"],
    ]);
    expect(result).toBe("number: 42");
  });

  test("first matching regex wins", () => {
    const result = match("123", [
      [regex(/^(\d)(\d)(\d)$/), () => "three digits"],
      [regex(/^\d+$/), () => "any digits"],
      [_, () => "other"],
    ]);
    expect(result).toBe("three digits");
  });
});

// -- Edge cases -------------------------------------------------------------

describe("edge cases", () => {
  test("empty arms list throws", () => {
    expect(() => match(1, [])).toThrow(MatchError);
  });

  test("handles -0 vs 0 with Object.is", () => {
    // Object.is(-0, 0) is false
    const result = match(-0, [
      [0, () => "positive zero"],
      [_, () => "something else"],
    ]);
    expect(result).toBe("something else");
  });

  test("symbol values match by identity", () => {
    const sym = Symbol("test");
    const result = match(sym, [
      [sym, () => "found"],
      [_, () => "not found"],
    ]);
    expect(result).toBe("found");
  });

  test("constructor pattern matches instances", () => {
    class Foo {
      value: number;
      constructor(v: number) {
        this.value = v;
      }
    }
    const foo = new Foo(42);
    const result = match<any, string>(foo, [
      [Foo, () => "foo instance"],
      [_, () => "other"],
    ]);
    expect(result).toBe("foo instance");
  });

  test("deeply nested object matching", () => {
    type Deep = { a: { b: { c: { d: number } } } };
    const obj: Deep = { a: { b: { c: { d: 1 } } } };
    const result = match<Deep, string>(obj, [
      [{ a: { b: { c: { d: 1 } } } } as Deep, () => "deep"],
      [_, () => "no"],
    ]);
    expect(result).toBe("deep");
  });
});
