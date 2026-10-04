import { describe, it, expect } from "vitest";
import {
  codegen,
  castFromAst,
  createSerializer,
  type IRNode,
  type ZodAdapter,
  type CodegenOptions,
} from "../src/index.js";

/**
 * Expression-safety contract: every codegen render is used in expression
 * position (object field values, function args, export initializers).
 * A bare `/* comment *\/` is NOT a valid expression — it produces
 * syntactically invalid output. Every fallback/escape-hatch render must
 * emit a valid expression (typically `z.any()`) with the diagnostic
 * comment attached after it.
 */

const defaultOpts: CodegenOptions = {
  indent: "  ",
  indentLevel: 0,
  format: true,
  optimizations: { semanticMethods: true, scientificNotation: true },
};

/** Parses the code as an expression body; throws on invalid syntax. */
function assertEvaluable(code: string): void {
  expect(
    () => new Function("z", `return (${code});`),
    `not a valid expression:\n${code}`,
  ).not.toThrow();
}

describe("codegen expression safety", () => {
  it("fallback not-a-zod-schema renders an annotated z.any()", () => {
    const node: IRNode = {
      kind: "fallback",
      reason: "not-a-zod-schema",
      detail: "object",
    };
    const code = codegen(node, defaultOpts);
    expect(code).toBe("z.any() /* not a zod schema object */");
    assertEvaluable(code);
  });

  it("lazy circular-reference placeholder keeps the arrow body a valid expression", () => {
    const node: IRNode = { kind: "lazy", placeholder: true };
    const code = codegen(node, defaultOpts);
    expect(code).toBe("z.lazy(() => z.any() /* circular reference */)");
    // `z.lazy(() => /* comment */)` is a SyntaxError: empty arrow body.
    assertEvaluable(code);
  });

  it("raw nodes render verbatim (documenting the escape hatch contract)", () => {
    const code = codegen(
      { kind: "raw", code: "z.string()", reason: "test" },
      defaultOpts,
    );
    expect(code).toBe("z.string()");
  });
});

describe("static AST path expression safety", () => {
  it("standalone z.transform() emits a valid expression", () => {
    const ir = castFromAst(
      `export const S = z.transform((v) => String(v));`,
      "S",
    );
    const code = codegen(ir, defaultOpts);
    expect(code).toBe("z.transform((x) => x /* transform placeholder */)");
    assertEvaluable(code);
  });

  it("standalone z.refine() emits a valid expression", () => {
    const ir = castFromAst(`export const S = z.refine((v) => true);`, "S");
    const code = codegen(ir, defaultOpts);
    expect(code).toBe(
      "z.any().refine((x) => true /* refinement placeholder */)",
    );
    assertEvaluable(code);
  });
});

describe("serializer top-level expression safety", () => {
  const neverAdapter: ZodAdapter = {
    version: "v4",
    isZodSchema: () => false,
    getType: () => undefined,
    getDef: () => undefined,
  };

  it("non-schema input renders an annotated z.any()", () => {
    const serializer = createSerializer(neverAdapter);
    const code = serializer.serialize({ nope: true });
    expect(code).toBe("z.any() /* not a zod schema: object */");
    assertEvaluable(code);
  });
});
