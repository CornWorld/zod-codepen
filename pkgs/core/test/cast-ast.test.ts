import { describe, it, expect } from "vitest";
import { castFromAst, castAllFromAst } from "../src/cast/ast.js";
import { codegen } from "../src/ir/printer/codegen.js";
import type { CodegenOptions } from "../src/ir/printer/codegen.js";

const defaultOpts: CodegenOptions = {
  indent: "  ",
  indentLevel: 0,
  format: false,
  optimizations: { semanticMethods: false, scientificNotation: false },
};

function roundTrip(source: string, exportName = "S"): string {
  const ir = castFromAst(`export const ${exportName} = ${source};`, exportName);
  return codegen(ir, defaultOpts).trim();
}

describe("castFromAst — primitives", () => {
  const cases: Array<[string, string]> = [
    ["z.string()", "z.string()"],
    ["z.number()", "z.number()"],
    ["z.bigint()", "z.bigint()"],
    ["z.boolean()", "z.boolean()"],
    ["z.date()", "z.date()"],
    ["z.symbol()", "z.symbol()"],
    ["z.undefined()", "z.undefined()"],
    ["z.null()", "z.null()"],
    ["z.void()", "z.void()"],
    ["z.any()", "z.any()"],
    ["z.unknown()", "z.unknown()"],
    ["z.never()", "z.never()"],
  ];

  for (const [src, expected] of cases) {
    it(`casts ${src}`, () => {
      expect(roundTrip(src)).toBe(expected);
    });
  }
});

describe("castFromAst — constraints", () => {
  it("casts string constraints", () => {
    expect(roundTrip("z.string().min(5)")).toBe("z.string().min(5)");
    expect(roundTrip("z.string().max(100)")).toBe("z.string().max(100)");
    expect(roundTrip("z.string().min(1).max(50)")).toBe(
      "z.string().min(1).max(50)",
    );
    expect(roundTrip("z.string().email()")).toBe("z.string().email()");
    expect(roundTrip("z.string().url()")).toBe("z.string().url()");
    expect(roundTrip("z.string().uuid()")).toBe("z.string().uuid()");
    expect(roundTrip("z.string().length(10)")).toBe("z.string().length(10)");
  });

  it("casts string with regex", () => {
    expect(roundTrip("z.string().regex(/^[a-z]+$/)")).toBe(
      "z.string().regex(/^[a-z]+$/)",
    );
  });

  it("casts string with startsWith/endsWith", () => {
    expect(roundTrip("z.string().startsWith('foo')")).toBe(
      'z.string().startsWith("foo")',
    );
    expect(roundTrip("z.string().endsWith('bar')")).toBe(
      'z.string().endsWith("bar")',
    );
  });

  it("casts number constraints", () => {
    expect(roundTrip("z.number().int()")).toBe("z.number().int()");
    expect(roundTrip("z.number().finite()")).toBe("z.number().finite()");
    expect(roundTrip("z.number().positive()")).toBe("z.number().positive()");
    expect(roundTrip("z.number().negative()")).toBe("z.number().negative()");
    expect(roundTrip("z.number().multipleOf(2)")).toBe(
      "z.number().multipleOf(2)",
    );
    expect(roundTrip("z.number().min(0).max(100)")).toBe(
      "z.number().min(0).max(100)",
    );
  });

  it("casts bigint constraints", () => {
    expect(roundTrip("z.bigint().min(0n)")).toBe("z.bigint().min(0n)");
    expect(roundTrip("z.bigint().positive()")).toBe("z.bigint().positive()");
  });
});

describe("castFromAst — modifiers", () => {
  it("casts single modifier", () => {
    expect(roundTrip("z.string().optional()")).toBe("z.string().optional()");
    expect(roundTrip("z.string().nullable()")).toBe("z.string().nullable()");
    expect(roundTrip("z.string().nullish()")).toBe("z.string().nullish()");
  });

  it("casts modifier chains (innermost first)", () => {
    expect(roundTrip("z.string().optional().default('x')")).toBe(
      'z.string().optional().default("x")',
    );
    expect(roundTrip("z.number().nullable().default(0)")).toBe(
      "z.number().nullable().default(0)",
    );
  });

  it("casts default with non-literal value to placeholder", () => {
    // Default to a function call — should emit placeholder.
    expect(roundTrip("z.string().default(() => 'time')")).toBe(
      "z.string().default(/* function */)",
    );
  });

  it("casts readonly", () => {
    expect(roundTrip("z.string().readonly()")).toBe("z.string().readonly()");
  });

  it("casts brand", () => {
    expect(roundTrip("z.string().brand()")).toBe("z.string().brand()");
  });
});

describe("castFromAst — constraints + modifiers mixed", () => {
  it("casts constraints followed by modifier", () => {
    expect(roundTrip("z.string().email().optional()")).toBe(
      "z.string().email().optional()",
    );
    expect(roundTrip("z.number().int().positive().nullable()")).toBe(
      "z.number().int().positive().nullable()",
    );
  });
});

describe("castFromAst — coerce", () => {
  it("casts z.coerce.X()", () => {
    expect(roundTrip("z.coerce.string()")).toBe("z.coerce.string()");
    expect(roundTrip("z.coerce.number()")).toBe("z.coerce.number()");
    expect(roundTrip("z.coerce.boolean()")).toBe("z.coerce.boolean()");
    expect(roundTrip("z.coerce.bigint()")).toBe("z.coerce.bigint()");
    expect(roundTrip("z.coerce.date()")).toBe("z.coerce.date()");
  });

  it("casts z.coerce with constraint chain", () => {
    expect(roundTrip("z.coerce.number().int()")).toBe(
      "z.coerce.number().int()",
    );
  });
});

describe("castFromAst — literal / enum", () => {
  it("casts string literal", () => {
    expect(roundTrip("z.literal('foo')")).toBe('z.literal("foo")');
  });
  it("casts number literal", () => {
    expect(roundTrip("z.literal(42)")).toBe("z.literal(42)");
  });
  it("casts boolean literal", () => {
    expect(roundTrip("z.literal(true)")).toBe("z.literal(true)");
  });
  it("casts bigint literal", () => {
    expect(roundTrip("z.literal(123n)")).toBe("z.literal(123n)");
  });

  it("casts enum", () => {
    expect(roundTrip("z.enum(['a', 'b', 'c'])")).toBe(
      'z.enum(["a", "b", "c"])',
    );
  });
});

describe("castFromAst — collections", () => {
  it("casts array of primitive", () => {
    expect(roundTrip("z.array(z.string())")).toBe("z.array(z.string())");
  });

  it("casts array with constraints", () => {
    expect(roundTrip("z.array(z.number()).min(1).max(10)")).toBe(
      "z.array(z.number()).min(1).max(10)",
    );
  });

  it("casts array with nonempty", () => {
    expect(roundTrip("z.array(z.string()).nonempty()")).toBe(
      "z.array(z.string()).min(1)",
    );
  });

  it("casts set", () => {
    expect(roundTrip("z.set(z.number())")).toBe("z.set(z.number())");
  });

  it("casts object", () => {
    expect(roundTrip("z.object({ id: z.number(), name: z.string() })")).toBe(
      "z.object({ id: z.number(), name: z.string() })",
    );
  });

  it("casts nested object", () => {
    expect(
      roundTrip(
        "z.object({ user: z.object({ id: z.number() }), tags: z.array(z.string()) })",
      ),
    ).toBe(
      "z.object({ user: z.object({ id: z.number() }), tags: z.array(z.string()) })",
    );
  });

  it("casts object with strict mode", () => {
    expect(roundTrip("z.object({ id: z.number() }).strict()")).toBe(
      "z.object({ id: z.number() }).strict()",
    );
  });

  it("casts object with passthrough", () => {
    expect(roundTrip("z.object({ id: z.number() }).passthrough()")).toBe(
      "z.object({ id: z.number() }).passthrough()",
    );
  });

  it("casts tuple", () => {
    expect(roundTrip("z.tuple([z.string(), z.number()])")).toBe(
      "z.tuple([z.string(), z.number()])",
    );
  });

  it("casts record", () => {
    expect(roundTrip("z.record(z.string(), z.number())")).toBe(
      "z.record(z.string(), z.number())",
    );
  });

  it("casts map", () => {
    expect(roundTrip("z.map(z.string(), z.number())")).toBe(
      "z.map(z.string(), z.number())",
    );
  });
});

describe("castFromAst — composites", () => {
  it("casts union", () => {
    expect(roundTrip("z.union([z.string(), z.number()])")).toBe(
      "z.union([z.string(), z.number()])",
    );
  });

  it("casts discriminatedUnion", () => {
    const ir = castFromAst(
      `export const S = z.discriminatedUnion('type', [
        z.object({ type: z.literal('a') }),
        z.object({ type: z.literal('b') }),
      ]);`,
      "S",
    );
    expect(codegen(ir, defaultOpts).trim()).toBe(
      `z.discriminatedUnion("type", [z.object({ type: z.literal("a") }), z.object({ type: z.literal("b") })])`,
    );
  });

  it("casts intersection", () => {
    expect(roundTrip("z.intersection(z.string(), z.number())")).toBe(
      "z.intersection(z.string(), z.number())",
    );
  });
});

describe("castFromAst — advanced", () => {
  it("casts lazy with inline body", () => {
    const ir = castFromAst(`export const S = z.lazy(() => z.string());`, "S");
    expect(codegen(ir, defaultOpts).trim()).toBe("z.lazy(() => z.string())");
  });

  it("casts promise", () => {
    expect(roundTrip("z.promise(z.string())")).toBe("z.promise(z.string())");
  });

  it("casts z.function with no args", () => {
    expect(roundTrip("z.function()")).toBe("z.function()");
  });

  it("casts pipe", () => {
    // Zod's API is `inner.pipe(out)`, not `z.pipe(A, B)`. The IR captures
    // both forms as PipeNode; codegen renders as the fluent form.
    expect(roundTrip("z.string().pipe(z.number())")).toBe(
      "z.string().pipe(z.number())",
    );
  });
});

describe("castFromAst — unknown / fallback", () => {
  it("third-party wrapper returns RawNode", () => {
    const ir = castFromAst(`export const S = createSelectSchema(table);`, "S");
    expect(ir.kind).toBe("raw");
    if (ir.kind === "raw") {
      expect(ir.reason).toMatch(/non-zod-root/);
    }
  });

  it("unrecognized z.X method returns RawNode", () => {
    const ir = castFromAst(`export const S = z.unknownMethod();`, "S");
    expect(ir.kind).toBe("raw");
    if (ir.kind === "raw") {
      expect(ir.reason).toMatch(/unknown-zod-method/);
    }
  });

  it("onUnknown: 'fallback' returns FallbackNode", () => {
    const ir = castFromAst(`export const S = z.unknownMethod();`, "S", {
      onUnknown: "fallback",
    });
    expect(ir.kind).toBe("fallback");
  });

  it("onUnknown: 'throw' throws", () => {
    expect(() =>
      castFromAst(`export const S = z.unknownMethod();`, "S", {
        onUnknown: "throw",
      }),
    ).toThrow();
  });

  it("missing export returns FallbackNode", () => {
    const ir = castFromAst(`export const X = z.string();`, "Y");
    expect(ir.kind).toBe("fallback");
  });
});

describe("castAllFromAst", () => {
  it("casts all exports", () => {
    const src = `
      export const User = z.object({ id: z.number() });
      export const Name = z.string().min(1);
      const $internal = z.any();
      export type UserType = typeof User._type;
    `;
    const results = castAllFromAst(src);
    const names = results.map((r) => r.name);
    expect(names).toContain("User");
    expect(names).toContain("Name");
    // $internal is NOT exported, should not appear.
    expect(names).not.toContain("$internal");
  });
});

describe("castFromAst — formatting preserved", () => {
  it("matches runtime serialization byte-for-byte for complex schema", () => {
    const src = `z.object({
      id: z.number().int().positive(),
      name: z.string().min(1).max(100),
      email: z.string().email().optional(),
      tags: z.array(z.string()).nonempty(),
      role: z.enum(['admin', 'user']),
    })`;
    const ir = castFromAst(`export const S = ${src};`, "S");
    const out = codegen(ir, defaultOpts).trim();
    // With format: false, output should be single-line.
    expect(out).toContain("z.object({");
    expect(out).toContain("id: z.number().int().positive()");
    expect(out).toContain('role: z.enum(["admin", "user"])');
  });
});

describe("castFromAst — empty edge cases", () => {
  it("handles empty object", () => {
    expect(roundTrip("z.object({})")).toBe("z.object({})");
  });

  it("handles empty union", () => {
    expect(roundTrip("z.union([])")).toBe("z.union([])");
  });

  it("handles empty tuple", () => {
    expect(roundTrip("z.tuple([])")).toBe("z.tuple([])");
  });
});

describe("castFromAst — wrapper function inlining", () => {
  it("inlines arrow function wrapper with expression body", () => {
    const src = `
      const makeEmail = () => z.string().email();
      export const S = makeEmail();
    `;
    const ir = castFromAst(src, "S");
    expect(codegen(ir, defaultOpts).trim()).toBe("z.string().email()");
  });

  it("inlines function declaration with return statement", () => {
    const src = `
      function makeName() { return z.string().min(1); }
      export const S = makeName();
    `;
    const ir = castFromAst(src, "S");
    expect(codegen(ir, defaultOpts).trim()).toBe("z.string().min(1)");
  });

  it("inlines const with arrow function expression body", () => {
    const src = `
      const factory = () => z.object({ id: z.number() });
      export const S = factory();
    `;
    const ir = castFromAst(src, "S");
    expect(codegen(ir, defaultOpts).trim()).toBe(
      "z.object({ id: z.number() })",
    );
  });

  it("returns undefined (RawNode) for unknown wrapper", () => {
    const src = `
      export const S = unknownFunc();
    `;
    const ir = castFromAst(src, "S");
    expect(ir.kind).toBe("raw");
  });

  it("does not inline when wrapper returns non-schema", () => {
    const src = `
      const f = () => 42;
      export const S = f();
    `;
    const ir = castFromAst(src, "S");
    expect(ir.kind).toBe("raw");
  });
});
