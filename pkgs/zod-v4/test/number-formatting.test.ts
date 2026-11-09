import { describe, it, expect } from "vitest";
import { serialize } from "./serialize-checked.js";
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
 * errors such as `-2**31` fail here instead of being hidden behind a
 * string-equality assertion.
 */
function evaluate(code: string): RecordedCall[] {
  const calls: RecordedCall[] = [];
  new Function("z", `return (${code});`)(createZStub(calls));
  return calls;
}

function argumentOf(code: string, method: string): unknown {
  const call = evaluate(code).find((c) => c.method === method);
  expect(call, `missing .${method}() in: ${code}`).toBeDefined();
  return call!.args[0];
}

describe("v4 number formatting", () => {
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
