import { describe, test, expect } from "bun:test";
import { match, ok, err, _, MatchError, when } from "../src/result";
import type { Result } from "../src/result";

// -- Helpers ----

function mkOk<T>(value: T): Result<T, unknown> {
  return { ok: true, value };
}

function mkErr<E>(error: E): Result<unknown, E> {
  return { ok: false, error };
}

// -- Tests ----

describe("ok() pattern", () => {
  test("matches any Ok result", () => {
    const result = match(mkOk(42) as Result<number, string>, [
      [ok(), (r) => `ok: ${(r as { ok: true; value: number }).value}`],
      [err(), () => "err"],
    ]);
    expect(result).toBe("ok: 42");
  });

  test("matches Ok with guard", () => {
    const result = match(mkOk(42) as Result<number, string>, [
      [ok<number>((n) => n > 100), () => "big"],
      [ok<number>((n) => n > 0), () => "positive"],
      [ok(), () => "other ok"],
      [err(), () => "err"],
    ]);
    expect(result).toBe("positive");
  });

  test("guard rejects non-matching Ok values", () => {
    const result = match(mkOk(-5) as Result<number, string>, [
      [ok<number>((n) => n > 0), () => "positive"],
      [ok(), () => "non-positive ok"],
      [err(), () => "err"],
    ]);
    expect(result).toBe("non-positive ok");
  });

  test("does not match Err results", () => {
    const result = match(mkErr("fail") as Result<number, string>, [
      [ok(), () => "ok"],
      [err(), () => "err"],
    ]);
    expect(result).toBe("err");
  });
});

describe("err() pattern", () => {
  test("matches any Err result", () => {
    const result = match(mkErr("boom") as Result<number, string>, [
      [ok(), () => "ok"],
      [err(), (r) => `err: ${(r as { ok: false; error: string }).error}`],
    ]);
    expect(result).toBe("err: boom");
  });

  test("matches Err with guard", () => {
    const result = match(mkErr("NOT_FOUND") as Result<number, string>, [
      [ok(), () => "ok"],
      [err<string>((e) => e === "NOT_FOUND"), () => "not found"],
      [err(), () => "other error"],
    ]);
    expect(result).toBe("not found");
  });

  test("guard rejects non-matching Err values", () => {
    const result = match(mkErr("TIMEOUT") as Result<number, string>, [
      [ok(), () => "ok"],
      [err<string>((e) => e === "NOT_FOUND"), () => "not found"],
      [err(), () => "other error"],
    ]);
    expect(result).toBe("other error");
  });

  test("does not match Ok results", () => {
    const result = match(mkOk(42) as Result<number, string>, [
      [err(), () => "err"],
      [ok(), () => "ok"],
    ]);
    expect(result).toBe("ok");
  });
});

describe("combined ok/err patterns", () => {
  test("exhaustive matching", () => {
    function classify(r: Result<number, string>): string {
      return match(r, [
        [ok<number>((n) => n > 0), () => "positive"],
        [ok<number>((n) => n === 0), () => "zero"],
        [ok(), () => "negative"],
        [err<string>((e) => e.startsWith("fatal")), () => "fatal error"],
        [err(), () => "error"],
      ]);
    }

    expect(classify(mkOk(5) as Result<number, string>)).toBe("positive");
    expect(classify(mkOk(0) as Result<number, string>)).toBe("zero");
    expect(classify(mkOk(-3) as Result<number, string>)).toBe("negative");
    expect(classify(mkErr("fatal: disk full") as Result<number, string>)).toBe("fatal error");
    expect(classify(mkErr("timeout") as Result<number, string>)).toBe("error");
  });

  test("first match wins", () => {
    const result = match(mkOk(42) as Result<number, string>, [
      [ok(), () => "first"],
      [ok<number>((n) => n > 0), () => "second"],
      [err(), () => "err"],
    ]);
    expect(result).toBe("first");
  });

  test("throws MatchError when nothing matches", () => {
    // Only ok patterns, but value is Err — no catch-all
    expect(() =>
      match(mkErr("fail") as Result<number, string>, [
        [ok(), () => "ok"],
      ]),
    ).toThrow(MatchError);
  });
});

describe("wildcard fallback", () => {
  test("_ works as catch-all alongside ok/err", () => {
    const result = match(mkOk(42) as Result<number, string>, [
      [err(), () => "err"],
      [_, () => "wildcard"],
    ]);
    expect(result).toBe("wildcard");
  });
});

describe("when() builder with result patterns", () => {
  test("fluent matching on Result", () => {
    const result = when(mkOk(10) as Result<number, string>)
      .is(ok<number>((n) => n > 5), () => "big")
      .is(ok(), () => "small")
      .is(err(), () => "err")
      .run();
    expect(result).toBe("big");
  });

  test("otherwise with Result", () => {
    const result = when(mkErr("nope") as Result<number, string>)
      .is(ok(), () => "ok")
      .otherwise(() => "fallback");
    expect(result).toBe("fallback");
  });
});

describe("works with @corvid-agent/result shape", () => {
  // Simulates the full Result object shape from @corvid-agent/result
  // (with methods attached) — our patterns only check { ok, value, error }
  test("matches Result objects with methods", () => {
    const fullResult = {
      ok: true as const,
      value: 99,
      isOk: () => true,
      isErr: () => false,
      map: () => fullResult,
      unwrap: () => 99,
    };

    const result = match(fullResult as Result<number, string>, [
      [ok<number>((n) => n > 50), () => "big"],
      [ok(), () => "small"],
      [err(), () => "err"],
    ]);
    expect(result).toBe("big");
  });
});
