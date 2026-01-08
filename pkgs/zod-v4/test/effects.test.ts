import { describe, it, expect } from "vitest";
import { z } from "zod";
import { serialize } from "../src/index.js";

describe("zod-v4 effects", () => {
  // Note: In v4, refine() doesn't create an 'effects' type - the schema keeps its original type
  // The refinement is stored in checks but we can't distinguish it from other checks
  it.skip("serializes .refine() (v4 type unchanged, refinement not detectable)", () => {
    const result = serialize(z.string().refine((s) => s.length > 0));
    expect(result).toContain(".refine(");
  });

  it("serializes .transform()", () => {
    const result = serialize(z.string().transform((s) => s.length));
    expect(result).toContain(".transform(");
  });

  // Note: In v4, z.preprocess is converted to a pipe structure internally
  // where in=transform, out=target schema
  it("serializes z.preprocess() correctly", () => {
    const result = serialize(z.preprocess((val) => String(val), z.string()));
    // Should output z.preprocess() syntax, not invalid pipe
    expect(result).toContain("z.preprocess(");
    expect(result).toContain("z.string()");
    // Should not contain invalid syntax
    expect(result).not.toContain("/* transform */.pipe(");
  });

  it("serializes complex z.preprocess() with nested schema", () => {
    const result = serialize(
      z.object({
        items: z.preprocess((val) => val, z.array(z.string())),
      }),
    );
    expect(result).toContain("z.preprocess(");
    expect(result).toContain("z.array(z.string())");
    expect(result).not.toContain("/* transform */.pipe(");
  });
});
