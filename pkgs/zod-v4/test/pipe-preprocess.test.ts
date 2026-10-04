import { describe, it, expect } from "vitest";
import { z } from "zod";
import { serialize } from "../src/index.js";

/**
 * Worst-case regression suite for v4 pipe/transform/preprocess.
 *
 * In Zod v4 both `.transform()` and `z.preprocess()` compile down to an
 * internal pipe:
 *   - `.transform(fn)`      -> pipe(schema,     ZodTransform)
 *   - `z.preprocess(fn, s)` -> pipe(ZodTransform, schema)
 *
 * The bar for every generated snippet:
 *   1. no raw `/* transform *\/` marker leaks into the output
 *   2. it is a syntactically valid expression (evaluable)
 *   3. it rebuilds a working Zod schema (safeParse callable)
 *   4. serialization is idempotent: serialize(eval(serialize(s))) === serialize(s)
 */

function expectRebuildable(schema: unknown): {
  code: string;
  rebuilt: z.ZodType;
} {
  const code = serialize(schema);
  expect(code, `raw transform marker leaked into:\n${code}`).not.toContain(
    "/* transform */",
  );
  const rebuilt = new Function("z", `return (${code});`)(z) as z.ZodType;
  expect(typeof rebuilt?.safeParse, `not a schema:\n${code}`).toBe("function");
  const second = serialize(rebuilt);
  expect(
    second,
    `serialization not idempotent:\n 1st: ${code}\n 2nd: ${second}`,
  ).toBe(code);
  return { code, rebuilt };
}

describe("zod-v4 preprocess (pipe with ZodTransform input)", () => {
  it("serializes flat z.preprocess() to a valid call (issue #4)", () => {
    const { code, rebuilt } = expectRebuildable(
      z.preprocess((val) => String(val), z.string()),
    );
    expect(code).toBe(
      "z.preprocess((x) => x /* preprocess placeholder */, z.string())",
    );
    expect(rebuilt.safeParse("hello").success).toBe(true);
  });

  it("serializes the exact issue #4 repro (preprocess inside object)", () => {
    const { code } = expectRebuildable(
      z.object({
        items: z.preprocess((val) => String(val), z.array(z.string())),
      }),
    );
    expect(code).toBe(`z.object({
  items: z.preprocess((x) => x /* preprocess placeholder */, z.array(z.string())),
})`);
  });

  it("serializes nested preprocess (preprocess of preprocess)", () => {
    const { code, rebuilt } = expectRebuildable(
      z.preprocess(
        (v) => v,
        z.preprocess((v) => String(v), z.string()),
      ),
    );
    expect(code).toContain("z.preprocess(");
    expect(rebuilt.safeParse("x").success).toBe(true);
  });

  it("preserves constraints on the preprocess output schema", () => {
    const { code, rebuilt } = expectRebuildable(
      z.preprocess((v) => v, z.string().min(5).max(10)),
    );
    expect(code).toContain(".min(5)");
    expect(code).toContain(".max(10)");
    expect(rebuilt.safeParse("abc").success).toBe(false); // below min
    expect(rebuilt.safeParse("abcdef").success).toBe(true);
  });

  it("serializes preprocess whose output schema is itself a transform chain", () => {
    const { code, rebuilt } = expectRebuildable(
      z.preprocess(
        (v) => v,
        z.string().transform((s) => s.length),
      ),
    );
    expect(code).toContain("z.preprocess(");
    expect(code).toContain(".transform(");
    expect(rebuilt.safeParse("hello").success).toBe(true);
  });

  it("serializes preprocess whose output schema is a union", () => {
    const { code, rebuilt } = expectRebuildable(
      z.preprocess((v) => v, z.union([z.string(), z.number()])),
    );
    expect(code).toContain("z.union([z.string(), z.number()])");
    expect(rebuilt.safeParse("x").success).toBe(true);
    expect(rebuilt.safeParse(42).success).toBe(true);
  });

  it("serializes preprocess inside arrays of objects with correct indentation", () => {
    const { code } = expectRebuildable(
      z.array(z.object({ n: z.preprocess((v) => Number(v), z.number()) })),
    );
    expect(code).toBe(`z.array(z.object({
  n: z.preprocess((x) => x /* preprocess placeholder */, z.number()),
}))`);
  });

  it("serializes deeply nested preprocess with correct indentation", () => {
    const { code, rebuilt } = expectRebuildable(
      z.object({
        a: z.object({
          b: z.preprocess((v) => v, z.array(z.object({ c: z.string() }))),
        }),
      }),
    );
    expect(code).toContain("b: z.preprocess(");
    expect(rebuilt.safeParse({ a: { b: [{ c: "x" }] } }).success).toBe(true);
  });

  it("serializes a triple chain: preprocess -> transform -> pipe with constraints", () => {
    const { code, rebuilt } = expectRebuildable(
      z.preprocess(
        (v) => v,
        z
          .string()
          .transform((s) => s.trim())
          .pipe(z.string().min(1)),
      ),
    );
    expect(code).toContain("z.preprocess(");
    expect(code).toContain(".pipe(");
    expect(rebuilt.safeParse("ok").success).toBe(true);
  });
});

describe("zod-v4 transform (pipe with ZodTransform output)", () => {
  it("serializes .transform()", () => {
    const { code, rebuilt } = expectRebuildable(
      z.string().transform((s) => s.length),
    );
    expect(code).toBe(
      "z.string().transform((x) => x /* transform placeholder */)",
    );
    expect(rebuilt.safeParse("hello").success).toBe(true);
  });

  it("serializes transform followed by pipe", () => {
    const { code, rebuilt } = expectRebuildable(
      z
        .string()
        .transform((s) => s.length)
        .pipe(z.string().min(1)),
    );
    expect(code).toBe(
      "z.string().transform((x) => x /* transform placeholder */).pipe(z.string().min(1))",
    );
    // Placeholder identity keeps data a string, so the string tail parses.
    expect(rebuilt.safeParse("hello").success).toBe(true);
  });

  it("serializes a plain pipe (schema -> schema)", () => {
    const { code, rebuilt } = expectRebuildable(
      z.string().pipe(z.string().min(2)),
    );
    expect(code).toBe("z.string().pipe(z.string().min(2))");
    expect(rebuilt.safeParse("abc").success).toBe(true);
  });

  it("serializes a modifier before pipe", () => {
    const { code, rebuilt } = expectRebuildable(
      z.string().optional().pipe(z.string().min(1)),
    );
    expect(code).toBe("z.string().optional().pipe(z.string().min(1))");
    expect(rebuilt.safeParse("abc").success).toBe(true);
  });
});

describe("zod-v4 standalone ZodTransform", () => {
  it("serializes standalone z.transform() as a valid expression", () => {
    const { code, rebuilt } = expectRebuildable(z.transform((v) => String(v)));
    expect(code).toBe("z.transform((x) => x /* transform placeholder */)");
    expect(typeof rebuilt.safeParse).toBe("function");
  });

  it("serializes standalone transform piped into a schema", () => {
    const { code, rebuilt } = expectRebuildable(
      z.transform((v) => String(v)).pipe(z.string()),
    );
    // pipe(ZodTransform, schema) is structurally z.preprocess(fn, out);
    // the serializer rebuilds the canonical preprocess form.
    expect(code).toBe(
      "z.preprocess((x) => x /* preprocess placeholder */, z.string())",
    );
    expect(rebuilt.safeParse("x").success).toBe(true);
  });

  it("serializes transform piped into transform", () => {
    const { code, rebuilt } = expectRebuildable(
      z.transform((v) => String(v)).pipe(z.transform((v) => Number(v))),
    );
    expect(code).toBe(
      "z.preprocess((x) => x /* preprocess placeholder */, z.transform((x) => x /* transform placeholder */))",
    );
    expect(typeof rebuilt.safeParse).toBe("function");
  });
});

describe("zod-v4 hostile callbacks (worst case)", () => {
  // Placeholder mode intentionally drops callback semantics. These tests
  // pin the guarantee that IS made: the emitted code always stays
  // syntactically valid and rebuildable, no matter how hostile the
  // original callback is (closures, multiple params, default values).
  it("closure-capturing callback still yields rebuildable code", () => {
    const factor = 10;
    const { code, rebuilt } = expectRebuildable(
      z.preprocess((v) => Number(v) * factor, z.number()),
    );
    expect(code).toContain("z.preprocess(");
    // Placeholder identity passes data through unchanged: numbers still
    // parse, and the closure arithmetic (v * factor) is intentionally
    // not preserved.
    expect(rebuilt.safeParse(5).success).toBe(true);
    expect(rebuilt.safeParse("x").success).toBe(false);
  });

  it("multi-param callback with ctx still yields rebuildable code", () => {
    const { code, rebuilt } = expectRebuildable(
      z.string().transform((s, _ctx) => s),
    );
    expect(code).toBe(
      "z.string().transform((x) => x /* transform placeholder */)",
    );
    expect(rebuilt.safeParse("x").success).toBe(true);
  });
});
