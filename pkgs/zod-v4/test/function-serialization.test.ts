/**
 * Tests for function serialization with purity checking
 */
import { describe, it, expect } from "vitest";
import { z } from "zod";
import { serialize } from "../src/index.js";

describe("Function Serialization", () => {
  describe("serializeFunctions: false (default)", () => {
    it("uses placeholders for transform", () => {
      const schema = z.string().transform((s) => s.toUpperCase());
      const result = serialize(schema);

      expect(result).toContain("z.string()");
      expect(result).toContain(".transform(");
      expect(result).toContain("/* transform placeholder */");
      expect(result).not.toContain("toUpperCase");
    });

    it("uses placeholders for preprocess", () => {
      const schema = z.preprocess((val) => String(val), z.string());
      const result = serialize(schema);

      expect(result).toContain("z.preprocess(");
      expect(result).toContain("/* preprocess placeholder */");
      expect(result).toContain("z.string()");
      expect(result).not.toContain("String(val)");
    });
  });

  describe("serializeFunctions: true", () => {
    it("serializes pure transform function", () => {
      const schema = z.string().transform((s) => s.toUpperCase());
      const result = serialize(schema, { serializeFunctions: true });

      expect(result).toContain("z.string()");
      expect(result).toContain(".transform(");
      expect(result).toContain("toUpperCase");
      expect(result).not.toContain("/* transform placeholder */");
    });

    it("serializes pure preprocess function", () => {
      const schema = z.preprocess((val) => String(val), z.string());
      const result = serialize(schema, { serializeFunctions: true });

      expect(result).toContain("z.preprocess(");
      expect(result).toContain("String(val)");
      expect(result).toContain("z.string()");
      expect(result).not.toContain("/* preprocess placeholder */");
    });

    it("serializes impure functions when forced", () => {
      const factor = 10;
      const schema = z.number().transform((x) => x * factor);
      const result = serialize(schema, { serializeFunctions: true });

      expect(result).toContain(".transform(");
      expect(result).toContain("factor");
      expect(result).not.toContain("/* transform placeholder */");
    });
  });

  describe("serializeFunctions: 'auto'", () => {
    it("serializes pure transform function", () => {
      const schema = z.string().transform((s) => s.toUpperCase());
      const result = serialize(schema, { serializeFunctions: "auto" });

      expect(result).toContain("z.string()");
      expect(result).toContain(".transform(");
      expect(result).toContain("toUpperCase");
      expect(result).not.toContain("/* transform placeholder */");
    });

    it("serializes pure preprocess function", () => {
      const schema = z.preprocess((val) => String(val), z.string());
      const result = serialize(schema, { serializeFunctions: "auto" });

      expect(result).toContain("z.preprocess(");
      expect(result).toContain("String(val)");
      expect(result).toContain("z.string()");
      expect(result).not.toContain("/* preprocess placeholder */");
    });

    it("uses placeholder for impure function with closure", () => {
      const factor = 10;
      const schema = z.number().transform((x) => x * factor);
      const result = serialize(schema, { serializeFunctions: "auto" });

      // Should use placeholder because function references external variable 'factor'
      expect(result).toContain(".transform(");
      expect(result).toContain("/* transform placeholder */");
      expect(result).not.toContain("factor");
    });

    it("uses placeholder for function with side effects", () => {
      const schema = z.string().transform((s) => {
        console.log(s);
        return s.toUpperCase();
      });
      const result = serialize(schema, { serializeFunctions: "auto" });

      // Should use placeholder because of console.log side effect
      expect(result).toContain(".transform(");
      expect(result).toContain("/* transform placeholder */");
      expect(result).not.toContain("console.log");
    });

    it("serializes pure function with complex logic", () => {
      const schema = z
        .array(z.string())
        .transform((arr) =>
          arr.map((s) => s.trim()).filter((s) => s.length > 0),
        );
      const result = serialize(schema, { serializeFunctions: "auto" });

      expect(result).toContain(".transform(");
      expect(result).toContain("trim");
      expect(result).toContain("filter");
      expect(result).toContain("map");
      expect(result).not.toContain("/* transform placeholder */");
    });

    it("serializes pure function with helper function", () => {
      const schema = z.number().transform((x) => {
        function helper(n: number) {
          return n * 2;
        }
        return helper(x);
      });
      const result = serialize(schema, { serializeFunctions: "auto" });

      expect(result).toContain(".transform(");
      expect(result).toContain("helper");
      expect(result).not.toContain("/* transform placeholder */");
    });

    it("serializes pure function with destructuring params", () => {
      const schema = z
        .object({ a: z.number(), b: z.number() })
        .transform(({ a, b }) => a + b);
      const result = serialize(schema, { serializeFunctions: "auto" });

      expect(result).toContain(".transform(");
      expect(result).toContain("a");
      expect(result).toContain("b");
      expect(result).not.toContain("/* transform placeholder */");
    });

    it("serializes pure function with nested destructuring params", () => {
      const schema = z
        .object({
          user: z.object({ name: z.string(), age: z.number() }),
        })
        .transform(({ user: { name, age } }) => `${name} is ${age}`);
      const result = serialize(schema, { serializeFunctions: "auto" });

      expect(result).toContain(".transform(");
      expect(result).toContain("name");
      expect(result).toContain("age");
      expect(result).not.toContain("/* transform placeholder */");
    });

    it("serializes pure function with Date constructor", () => {
      const schema = z.string().transform((s) => new Date(s));
      const result = serialize(schema, { serializeFunctions: "auto" });

      // Date constructor should be allowed (not considered a side effect)
      expect(result).toContain(".transform(");
      expect(result).toContain("new Date");
      expect(result).not.toContain("/* transform placeholder */");
    });

    it("serializes pure function with local object mutation", () => {
      const schema = z.object({ a: z.number() }).transform((obj) => {
        const result = { ...obj, computed: obj.a * 2 };
        return result;
      });
      const result = serialize(schema, { serializeFunctions: "auto" });

      // Local object creation and mutation should be allowed
      expect(result).toContain(".transform(");
      expect(result).toContain("computed");
      expect(result).not.toContain("/* transform placeholder */");
    });

    it("serializes pure function with template literals", () => {
      const schema = z.string().transform((name) => `Hello ${name}`);
      const result = serialize(schema, { serializeFunctions: "auto" });

      expect(result).toContain(".transform(");
      expect(result).toContain("Hello");
      expect(result).toContain("name");
      expect(result).not.toContain("/* transform placeholder */");
    });
  });

  describe("serializeFunctions: 'marked'", () => {
    it("serializes pure function without marker", () => {
      const schema = z.string().transform((s) => s.toUpperCase());
      const result = serialize(schema, { serializeFunctions: "marked" });

      expect(result).toContain("z.string()");
      expect(result).toContain(".transform(");
      expect(result).toContain("toUpperCase");
      expect(result).not.toContain("/* transform placeholder */");
      expect(result).not.toContain("@zod-codepen-impure");
    });

    it("adds marker for impure function with closure", () => {
      const factor = 10;
      const schema = z.number().transform((x) => x * factor);
      const result = serialize(schema, { serializeFunctions: "marked" });

      expect(result).toContain(".transform(");
      expect(result).toContain("@zod-codepen-impure");
      expect(result).toContain("/* transform placeholder */");
      expect(result).toContain('"vars":');
      expect(result).toContain('"factor"');
    });

    it("adds marker for function with side effects", () => {
      const schema = z.string().transform((s) => {
        console.log(s);
        return s.toUpperCase();
      });
      const result = serialize(schema, { serializeFunctions: "marked" });

      expect(result).toContain(".transform(");
      expect(result).toContain("@zod-codepen-impure");
      expect(result).toContain("/* transform placeholder */");
      expect(result).toContain('"vars":');
      // The source is preserved in metadata, but the placeholder doesn't contain the actual code
      expect(result).toContain('"console"'); // console is in the vars list
      expect(result).toContain("console.log"); // but the full source is in metadata
    });

    it("includes function source in marker metadata", () => {
      const factor = 10;
      const schema = z.number().transform((x) => x * factor);
      const result = serialize(schema, { serializeFunctions: "marked" });

      expect(result).toContain('"source":');
      // The source should contain the original function code
      expect(result).toMatch(/x\s*\*\s*factor/);
    });

    it("serializes pure preprocess without marker", () => {
      const schema = z.preprocess((val) => String(val), z.string());
      const result = serialize(schema, { serializeFunctions: "marked" });

      expect(result).toContain("z.preprocess(");
      expect(result).toContain("String(val)");
      expect(result).toContain("z.string()");
      expect(result).not.toContain("@zod-codepen-impure");
      expect(result).not.toContain("/* preprocess placeholder */");
    });

    it("adds marker for impure preprocess function", () => {
      const multiplier = 2;
      const schema = z.preprocess((x) => x * multiplier, z.number());
      const result = serialize(schema, { serializeFunctions: "marked" });

      expect(result).toContain("z.preprocess(");
      expect(result).toContain("@zod-codepen-impure");
      expect(result).toContain("/* preprocess placeholder */");
      expect(result).toContain('"multiplier"');
    });

    it("handles complex pure function without marker", () => {
      const schema = z
        .array(z.string())
        .transform((arr) =>
          arr.map((s) => s.trim()).filter((s) => s.length > 0),
        );
      const result = serialize(schema, { serializeFunctions: "marked" });

      expect(result).toContain(".transform(");
      expect(result).toContain("trim");
      expect(result).toContain("filter");
      expect(result).toContain("map");
      expect(result).not.toContain("@zod-codepen-impure");
    });
  });

  describe("Edge cases", () => {
    it("handles multiple transforms in a chain", () => {
      const schema = z
        .string()
        .transform((s) => s.trim())
        .transform((s) => s.toUpperCase());

      const resultDefault = serialize(schema);
      expect(resultDefault).toContain("/* transform placeholder */");

      const resultAuto = serialize(schema, { serializeFunctions: "auto" });
      expect(resultAuto).toContain("trim");
      expect(resultAuto).toContain("toUpperCase");
    });

    it("handles preprocess followed by transform", () => {
      const schema = z
        .preprocess((val) => String(val), z.string())
        .transform((s) => s.toUpperCase());

      const result = serialize(schema, { serializeFunctions: "auto" });
      expect(result).toContain("String(val)");
      expect(result).toContain("toUpperCase");
    });
  });
});
