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

  // In v4, z.preprocess compiles to pipe(ZodTransform, schema); the
  // serializer must rebuild a valid z.preprocess() call, not leak the
  // raw transform marker. Full worst-case coverage:
  // test/pipe-preprocess.test.ts
  it("serializes z.preprocess() to a valid z.preprocess call", () => {
    const result = serialize(z.preprocess((val) => String(val), z.string()));
    expect(result).toBe(
      "z.preprocess((x) => x /* preprocess placeholder */, z.string())",
    );
    expect(result).not.toContain("/* transform */");
  });
});
