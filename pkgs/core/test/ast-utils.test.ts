import { describe, it, expect } from "vitest";
import * as ts from "typescript";
import {
  getPropertyChain,
  getLiteralValue,
  parseObjectLiteral,
  getSpreadArgument,
  UNRESOLVED,
} from "../src/cast/ast-utils.js";

function parseExpr(source: string): ts.Expression {
  const sf = ts.createSourceFile(
    "test.ts",
    source,
    ts.ScriptTarget.ESNext,
    /* setParentNodes */ true,
  );
  let stmt = sf.statements[0];
  let expr: ts.Expression;
  // Object literals at top level parse as Block in some contexts —
  // wrap them in parens to force expression interpretation.
  if (ts.isBlock(stmt)) {
    const reSf = ts.createSourceFile(
      "t.ts",
      `(${source})`,
      ts.ScriptTarget.ESNext,
      true,
    );
    stmt = reSf.statements[0];
    if (!ts.isExpressionStatement(stmt)) {
      throw new Error(`expected expression, got ${ts.SyntaxKind[stmt.kind]}`);
    }
    expr = stmt.expression;
    // Strip the ParenthesizedExpression wrapper.
    while (ts.isParenthesizedExpression(expr)) {
      expr = expr.expression;
    }
    return expr;
  }
  if (!ts.isExpressionStatement(stmt)) {
    throw new Error(`expected expression, got ${ts.SyntaxKind[stmt.kind]}`);
  }
  expr = stmt.expression;
  while (ts.isParenthesizedExpression(expr)) {
    expr = expr.expression;
  }
  return expr;
}

describe("getPropertyChain", () => {
  it("flattens a simple z.X() call", () => {
    const chain = getPropertyChain(parseExpr("z.string()"));
    expect(chain?.chain.path).toEqual(["z", "string"]);
    expect(chain?.chain.args).toEqual([[], []]);
  });

  it("flattens a 3-step chain z.X().y().z()", () => {
    const chain = getPropertyChain(parseExpr("z.string().email().min(5)"));
    expect(chain?.chain.path).toEqual(["z", "string", "email", "min"]);
    expect(chain?.chain.args).toEqual([[], [], [], [parseExpr5Arg()]]);
  });

  it("handles z.coerce.string() (3-step)", () => {
    const chain = getPropertyChain(parseExpr("z.coerce.string()"));
    expect(chain?.chain.path).toEqual(["z", "coerce", "string"]);
  });

  it("handles bare property access without call", () => {
    const chain = getPropertyChain(parseExpr("BaseSchema.shape"));
    expect(chain?.chain.path).toEqual(["BaseSchema", "shape"]);
    expect(chain?.chain.args).toEqual([[], []]);
  });

  it("handles bare identifier", () => {
    const chain = getPropertyChain(parseExpr("z"));
    expect(chain?.chain.path).toEqual(["z"]);
  });

  it("returns undefined for non-chain expressions", () => {
    const chain = getPropertyChain(parseExpr("a + b"));
    expect(chain).toBeUndefined();
  });
});

function parseExpr5Arg(): ts.Expression {
  // Helper: re-parse `z.string().email().min(5)` and return the literal 5.
  const chain = getPropertyChain(parseExpr("z.string().email().min(5)"));
  return chain!.chain.args[3][0];
}

describe("getLiteralValue", () => {
  const cases: Array<[string, unknown]> = [
    ['"hello"', "hello"],
    ["'single'", "single"],
    ["42", 42],
    ["3.14", 3.14],
    ["true", true],
    ["false", false],
    ["null", null],
    ["undefined", undefined],
    ["123n", 123n],
    ["/foo/g", /foo/g],
    ["`template`", "template"],
    ["-1", -1],
    ["-3.14", -3.14],
    ["+1", 1],
    ["[1, 2, 3]", [1, 2, 3]],
    ["['a', 'b']", ["a", "b"]],
    ["{ x: 1, y: 'a' }", { x: 1, y: "a" }],
    ["{ 'kebab-key': 1 }", { "kebab-key": 1 }],
    ["[]", []],
    ["{}", {}],
    ["[1, [2, 3]]", [1, [2, 3]]],
    ["{ nested: { a: 1 } }", { nested: { a: 1 } }],
  ];

  for (const [src, expected] of cases) {
    it(`parses ${src}`, () => {
      const v = getLiteralValue(parseExpr(src));
      expect("unresolved" in v).toBe(false);
      if (!("unresolved" in v)) {
        if (expected instanceof RegExp) {
          expect(v.value).toBeInstanceOf(RegExp);
          expect((v.value as RegExp).source).toBe(expected.source);
          expect((v.value as RegExp).flags).toBe(expected.flags);
        } else {
          expect(v.value).toEqual(expected);
        }
      }
    });
  }

  const unresolvedCases: Array<[string, string]> = [
    ["foo", "identifier-not-literal"],
    ["f(1)", "kind-CallExpression"],
    ["{ ...x }", "spread-in-object-literal"],
    ["[...x]", "spread-in-array-literal"],
    ["{ x }", "shorthand-property"],
    ["{ [computed]: 1 }", "computed-property-key"],
  ];

  for (const [src, reasonMatch] of unresolvedCases) {
    it(`reports ${src} as unresolved`, () => {
      const v = getLiteralValue(parseExpr(src));
      expect("unresolved" in v).toBe(true);
      if ("unresolved" in v) {
        expect(v.reason).toMatch(new RegExp(reasonMatch));
      }
    });
  }

  it("UNRESOLVED sentinel is exported", () => {
    expect(typeof UNRESOLVED).toBe("symbol");
  });
});

describe("parseObjectLiteral", () => {
  it("extracts field entries", () => {
    const fields = parseObjectLiteral(
      parseExpr("{ id: z.number(), name: z.string() }"),
    );
    expect(fields).toHaveLength(2);
    expect(fields?.[0]).toMatchObject({ kind: "field", key: "id" });
    expect(fields?.[1]).toMatchObject({ kind: "field", key: "name" });
  });

  it("extracts shorthand", () => {
    const fields = parseObjectLiteral(parseExpr("{ x }"));
    expect(fields?.[0]).toMatchObject({ kind: "shorthand", key: "x" });
  });

  it("extracts spread", () => {
    const fields = parseObjectLiteral(parseExpr("{ ...BaseSchema.shape }"));
    expect(fields?.[0]).toMatchObject({ kind: "spread" });
    expect(fields?.[0].kind).toBe("spread");
    if (fields?.[0].kind === "spread") {
      // spreadExpr is a PropertyAccessExpression
      const expr = fields[0].spreadExpr;
      expect(ts.isPropertyAccessExpression(expr)).toBe(true);
    }
  });

  it("handles string keys with special chars", () => {
    const fields = parseObjectLiteral(parseExpr("{ 'kebab-case': 1 }"));
    expect(fields?.[0]).toMatchObject({ kind: "field", key: "kebab-case" });
  });

  it("returns undefined for non-object", () => {
    expect(parseObjectLiteral(parseExpr("z.string()"))).toBeUndefined();
  });
});

describe("getSpreadArgument", () => {
  it("returns the argument for spread elements", () => {
    // Need to parse inside an array context.
    const sf = ts.createSourceFile(
      "t.ts",
      "[...rest]",
      ts.ScriptTarget.ESNext,
      true,
    );
    const stmt = sf.statements[0] as ts.ExpressionStatement;
    const arr = stmt.expression as ts.ArrayLiteralExpression;
    const spread = arr.elements[0];
    const arg = getSpreadArgument(spread);
    expect(arg).toBeDefined();
    expect(ts.isIdentifier(arg)).toBe(true);
  });

  it("returns undefined for non-spread", () => {
    const arg = getSpreadArgument(parseExpr("x"));
    expect(arg).toBeUndefined();
  });
});
