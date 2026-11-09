import { describe, it, expect } from "vitest";
import { serialize, generateModule } from "./serialize-checked.js";
import { z } from "zod";

interface RecordedCall {
  method: string;
  args: unknown[];
}

/** Chainable `z` stub that records every method call and its arguments. */
function createZStub(calls: RecordedCall[]): unknown {
  const zStub: unknown = new Proxy(function () {}, {
    get(_target, property) {
      if (typeof property !== "string") return undefined;
      return (...args: unknown[]) => {
        calls.push({ method: property, args });
        return zStub;
      };
    },
  });
  return zStub;
}

/**
 * Parse and run a generated expression against the stub.
 *
 * `new Function` hands the source to the JS engine's parser, so syntax
 * errors such as `-2**31` (unary minus on the left-hand side of `**`) fail
 * here instead of being hidden behind a string-equality assertion.
 */
function evaluate(code: string): RecordedCall[] {
  const calls: RecordedCall[] = [];
  new Function("z", `return (${code});`)(createZStub(calls));
  return calls;
}

/** Parse and run every statement in a generated ESM module. */
function evaluateModule(code: string): RecordedCall[] {
  const calls: RecordedCall[] = [];
  const body = code
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("import "))
    .join("\n")
    .replace(/\bexport\s+const\b/g, "const");
  new Function("z", body)(createZStub(calls));
  return calls;
}

function methods(code: string): string[] {
  return evaluate(code).map((call) => call.method);
}

function argumentOf(code: string, method: string): unknown {
  const call = evaluate(code).find((c) => c.method === method);
  expect(call, `missing .${method}() in: ${code}`).toBeDefined();
  return call!.args[0];
}

describe("Number Formatting", () => {
  describe("Semantic Methods", () => {
    it("should convert min(0) with inclusive to nonnegative()", () => {
      expect(methods(serialize(z.number().min(0)))).toEqual([
        "number",
        "nonnegative",
      ]);
    });

    it("should convert min(0) without inclusive to positive()", () => {
      expect(methods(serialize(z.number().positive()))).toEqual([
        "number",
        "positive",
      ]);
    });

    it("should detect safe() for MIN/MAX_SAFE_INTEGER", () => {
      expect(
        methods(
          serialize(z.number().min(-9007199254740991).max(9007199254740991)),
        ),
      ).toEqual(["number", "safe"]);
    });

    it("should be disabled when semanticMethods is false", () => {
      const code = serialize(z.number().min(0), {
        optimizations: { semanticMethods: false },
      });
      expect(methods(code)).toEqual(["number", "min"]);
      expect(argumentOf(code, "min")).toBe(0);
    });
  });

  describe("Scientific Notation", () => {
    const numberBoundaries: Array<
      [method: "min" | "max", input: number, expected: number]
    > = [
      ["max", 9007199254740991, Number.MAX_SAFE_INTEGER],
      ["min", -9007199254740991, Number.MIN_SAFE_INTEGER],
      ["max", 2147483647, 2147483647],
      ["min", -2147483648, -2147483648],
      ["max", 32767, 32767],
      ["min", -32768, -32768],
      ["max", 127, 127],
      ["min", -128, -128],
      ["max", 65535, 65535],
      ["max", 255, 255],
      ["max", 65536, 65536],
      ["max", 4294967295, 4294967295],
      ["max", 4294967296, 4294967296],
    ];

    it.each(numberBoundaries)(
      "parses number boundary %s(%s)",
      (method, input, expected) => {
        const code =
          method === "min"
            ? serialize(z.number().min(input))
            : serialize(z.number().max(input));
        expect(code).not.toContain(String(input));
        expect(argumentOf(code, method)).toBe(expected);
      },
    );

    const bigintBoundaries: Array<[method: "min" | "max", input: bigint]> = [
      ["max", 9223372036854775807n],
      ["min", -9223372036854775808n],
      ["max", 18446744073709551615n],
      ["max", 256n],
      ["min", -256n],
      ["max", 65536n],
      ["min", -65536n],
      ["max", 4294967296n],
      ["min", -4294967296n],
      ["max", 18446744073709551616n],
      ["min", -18446744073709551616n],
      ["max", 255n],
      ["min", -255n],
      ["max", 65535n],
      ["min", -65535n],
      ["max", 4294967295n],
      ["min", -4294967295n],
    ];

    it.each(bigintBoundaries)(
      "parses bigint boundary %s(%s)",
      (method, input) => {
        const code =
          method === "min"
            ? serialize(z.bigint().min(input))
            : serialize(z.bigint().max(input));
        expect(code).not.toContain(input.toString());
        expect(argumentOf(code, method)).toBe(input);
      },
    );

    it("formats multipleOf values through the same safe path", () => {
      const numberCode = serialize(z.number().multipleOf(2147483647));
      expect(numberCode).not.toContain("2147483647");
      expect(argumentOf(numberCode, "multipleOf")).toBe(2147483647);

      const bigintCode = serialize(z.bigint().multipleOf(9223372036854775807n));
      expect(bigintCode).not.toContain("9223372036854775807");
      expect(argumentOf(bigintCode, "multipleOf")).toBe(9223372036854775807n);
    });

    it("preserves -0 when the formatter is enabled", () => {
      const code = serialize(z.number().max(-0), {
        optimizations: { semanticMethods: false },
      });
      expect(argumentOf(code, "max")).toBe(-0);
    });

    it("should be disabled when scientificNotation is false", () => {
      const numberCode = serialize(z.number().max(2147483647), {
        optimizations: { scientificNotation: false },
      });
      expect(numberCode).toContain("2147483647");
      expect(argumentOf(numberCode, "max")).toBe(2147483647);

      const bigintCode = serialize(z.bigint().max(9223372036854775807n), {
        optimizations: { scientificNotation: false },
      });
      expect(bigintCode).toContain("9223372036854775807");
      expect(argumentOf(bigintCode, "max")).toBe(9223372036854775807n);
    });
  });

  describe("BigInt Formatting", () => {
    it("should keep n suffix for regular BigInt", () => {
      const code = serialize(z.bigint().min(123n));
      expect(argumentOf(code, "min")).toBe(123n);
    });
  });

  describe("Combined Features", () => {
    it("should handle integer with safe range", () => {
      const code = serialize(
        z.number().int().min(-9007199254740991).max(9007199254740991),
      );
      expect(methods(code)).toEqual(["number", "int", "safe"]);
    });

    it("should handle INT32 range with int()", () => {
      const code = serialize(z.number().int().min(-2147483648).max(2147483647));
      expect(methods(code)).toEqual(["number", "int", "min", "max"]);
      expect(argumentOf(code, "min")).toBe(-2147483648);
      expect(argumentOf(code, "max")).toBe(2147483647);
    });
  });

  describe("Module Generation", () => {
    it("should not extract constants", () => {
      const schemas = {
        UserId: z.number().int().max(2147483647),
        PostId: z.number().int().max(2147483647),
        CommentId: z.number().int().max(2147483647),
      };

      const result = generateModule(schemas);

      // 不应该定义常量
      expect(result).not.toContain("const MAX_INT32");

      // 每条生成的 statement 都必须能被 JS 引擎解析并执行
      const calls = evaluateModule(result);
      expect(calls.map((call) => call.method)).toEqual([
        "number",
        "int",
        "max",
        "number",
        "int",
        "max",
        "number",
        "int",
        "max",
      ]);
      for (const call of calls.filter((c) => c.method === "max")) {
        expect(call.args[0]).toBe(2147483647);
      }
    });
  });

  describe("Drizzle ORM Patterns", () => {
    // 常见的 Drizzle 模式
    it("should handle Drizzle integer column pattern", () => {
      const code = serialize(
        z.number().int().min(-9007199254740991).max(9007199254740991),
      );
      expect(methods(code)).toEqual(["number", "int", "safe"]);
    });

    it("should handle Drizzle smallint pattern", () => {
      const code = serialize(z.number().int().min(-32768).max(32767));
      expect(methods(code)).toEqual(["number", "int", "min", "max"]);
      expect(argumentOf(code, "min")).toBe(-32768);
      expect(argumentOf(code, "max")).toBe(32767);
    });

    it("should handle Drizzle bigint pattern", () => {
      const code = serialize(
        z.bigint().min(-9223372036854775808n).max(9223372036854775807n),
      );
      expect(methods(code)).toEqual(["bigint", "min", "max"]);
      expect(argumentOf(code, "min")).toBe(-9223372036854775808n);
      expect(argumentOf(code, "max")).toBe(9223372036854775807n);
    });
  });

  describe("No Guessing", () => {
    // 确保不再做任何猜测
    it("should NOT guess percentage for 0-100", () => {
      const code = serialize(z.number().min(0).max(100));
      expect(methods(code)).toEqual(["number", "nonnegative", "max"]);
      expect(argumentOf(code, "max")).toBe(100);
      expect(code).not.toContain("PERCENTAGE");
    });

    it("should NOT guess HTTP status for 100-599", () => {
      const code = serialize(z.number().int().min(100).max(599));
      expect(methods(code)).toEqual(["number", "int", "min", "max"]);
      expect(argumentOf(code, "min")).toBe(100);
      expect(argumentOf(code, "max")).toBe(599);
      expect(code).not.toContain("HTTP");
      expect(code).not.toContain("STATUS");
    });

    it("should NOT guess port for 0-65535", () => {
      const code = serialize(z.number().int().min(0).max(65535));
      expect(methods(code)).toEqual(["number", "int", "nonnegative", "max"]);
      expect(argumentOf(code, "max")).toBe(65535);
      expect(code).not.toContain("PORT");
    });
  });
});
