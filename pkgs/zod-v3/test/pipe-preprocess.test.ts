import { describe, it, expect } from "vitest";
import { z } from "zod";
import { serialize } from "../src/index.js";

/**
 * Regression locks for v3 effects and pipe output.
 *
 * Bar for every generated snippet:
 *   1. syntactically valid expression (evaluable with z in scope)
 *   2. rebuilds a working Zod schema
 *   3. serialization is idempotent
 *
 * v3 z.preprocess -> ZodEffects (type "effects"); v3 .transform() ->
 * ZodEffects with transform effect; v3 .pipe() -> ZodPipeline.
 * Shared cast layer with v4 — these locks catch cross-version
 * regressions when the pipe/effect handling changes.
 */

function expectRebuildable(schema: unknown): {
  code: string;
  rebuilt: z.ZodType;
} {
  const code = serialize(schema);
  expect(code, `raw marker leaked into:\n${code}`).not.toContain(
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

describe("zod-v3 preprocess/pipe rebuild locks", () => {
  it("flat preprocess round-trips", () => {
    const { code, rebuilt } = expectRebuildable(
      z.preprocess((v) => String(v), z.string()),
    );
    expect(code).toBe(
      "z.preprocess((x) => x /* preprocess placeholder */, z.string())",
    );
    expect(rebuilt.safeParse("x").success).toBe(true);
  });

  it("nested preprocess inside object keeps exact shape", () => {
    const { code } = expectRebuildable(
      z.object({
        items: z.preprocess((v) => String(v), z.array(z.string())),
      }),
    );
    expect(code).toBe(`z.object({
  items: z.preprocess((x) => x /* preprocess placeholder */, z.array(z.string())),
})`);
  });

  it("double preprocess round-trips", () => {
    const { code } = expectRebuildable(
      z.preprocess(
        (v) => v,
        z.preprocess((v) => String(v), z.string()),
      ),
    );
    expect(code).toBe(
      "z.preprocess((x) => x /* preprocess placeholder */, z.preprocess((x) => x /* preprocess placeholder */, z.string()))",
    );
  });

  it("constraints on preprocess output are preserved", () => {
    const { code } = expectRebuildable(
      z.preprocess((v) => v, z.string().min(5)),
    );
    expect(code).toBe(
      "z.preprocess((x) => x /* preprocess placeholder */, z.string().min(5))",
    );
  });

  it("transform, pipe, modifier->pipe, transform->pipe round-trip", () => {
    expect(serialize(z.string().transform((s) => s.length))).toBe(
      "z.string().transform((x) => x /* transform placeholder */)",
    );
    expect(serialize(z.string().pipe(z.number()))).toBe(
      "z.string().pipe(z.number())",
    );
    expect(serialize(z.string().optional().pipe(z.number()))).toBe(
      "z.string().optional().pipe(z.number())",
    );
    const { rebuilt } = expectRebuildable(
      z
        .string()
        .transform((s) => s.length)
        .pipe(z.string().min(1)),
    );
    expect(rebuilt.safeParse("123").success).toBe(true);
  });

  it("refine and superRefine round-trip", () => {
    expect(serialize(z.string().refine((s) => s.length > 0))).toBe(
      "z.string().refine((x) => true /* refinement placeholder */)",
    );
    const { rebuilt } = expectRebuildable(
      z.string().superRefine((_v, _ctx) => {}),
    );
    expect(rebuilt.safeParse("x").success).toBe(true);
  });
});
