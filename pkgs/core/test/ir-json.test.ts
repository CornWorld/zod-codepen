import { describe, it, expect } from "vitest";
import { irToJson, schemasToJson, AST_JSON_VERSION } from "../src/ir/json.js";
import type { IRNode } from "../src/ir/nodes.js";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/** Assert that `value` is JSON-roundtrippable without throwing. */
function assertJsonRoundtrip(value: unknown): void {
  expect(() => JSON.parse(JSON.stringify(value))).not.toThrow();
}

// ---------------------------------------------------------------------------
// PrimitiveNode
// ---------------------------------------------------------------------------

describe("irToJson — PrimitiveNode", () => {
  it("serializes a string primitive without coerce/constraints", () => {
    const node = {
      kind: "primitive" as const,
      primitive: "string" as const,
      constraints: [],
    } satisfies IRNode;

    const result = irToJson(node);
    assertJsonRoundtrip(result);
    expect(result).toEqual({
      kind: "primitive",
      primitive: "string",
      constraints: [],
    });
  });

  it("serializes a number primitive with coerce flag", () => {
    const node = {
      kind: "primitive" as const,
      primitive: "number" as const,
      coerce: true,
      constraints: [],
    } satisfies IRNode;

    const result = irToJson(node);
    assertJsonRoundtrip(result);
    expect(result).toEqual({
      kind: "primitive",
      primitive: "number",
      coerce: true,
      constraints: [],
    });
  });

  it("omits coerce when undefined", () => {
    const node = {
      kind: "primitive" as const,
      primitive: "number" as const,
      constraints: [],
    } satisfies IRNode;

    const result = irToJson(node) as Record<string, unknown>;
    assertJsonRoundtrip(result);
    expect(result).not.toHaveProperty("coerce");
  });

  it("serializes with a min constraint", () => {
    const node = {
      kind: "primitive" as const,
      primitive: "number" as const,
      constraints: [
        {
          kind: "constraint" as const,
          target: "number" as const,
          name: "min",
          params: { value: 5 },
        },
      ],
    } satisfies IRNode;

    const result = irToJson(node);
    assertJsonRoundtrip(result);
    expect(result).toEqual({
      kind: "primitive",
      primitive: "number",
      constraints: [
        {
          kind: "constraint",
          target: "number",
          name: "min",
          params: { value: 5 },
        },
      ],
    });
  });
});

// ---------------------------------------------------------------------------
// ObjectNode
// ---------------------------------------------------------------------------

describe("irToJson — ObjectNode", () => {
  it("serializes an object with fields and unknownMode", () => {
    const node = {
      kind: "object" as const,
      fields: [
        {
          key: "name",
          value: {
            kind: "primitive" as const,
            primitive: "string" as const,
            constraints: [],
          } satisfies IRNode,
        },
        {
          key: "age",
          value: {
            kind: "primitive" as const,
            primitive: "number" as const,
            constraints: [],
          } satisfies IRNode,
        },
      ],
      unknownMode: "strip" as const,
    } satisfies IRNode;

    const result = irToJson(node);
    assertJsonRoundtrip(result);
    expect(result).toEqual({
      kind: "object",
      fields: [
        {
          key: "name",
          value: { kind: "primitive", primitive: "string", constraints: [] },
        },
        {
          key: "age",
          value: { kind: "primitive", primitive: "number", constraints: [] },
        },
      ],
      unknownMode: "strip",
    });
  });

  it("serializes with catchall", () => {
    const node = {
      kind: "object" as const,
      fields: [],
      unknownMode: "passthrough" as const,
      catchall: {
        kind: "primitive" as const,
        primitive: "string" as const,
        constraints: [],
      } satisfies IRNode,
    } satisfies IRNode;

    const result = irToJson(node);
    assertJsonRoundtrip(result);
    expect(result).toEqual({
      kind: "object",
      fields: [],
      unknownMode: "passthrough",
      catchall: { kind: "primitive", primitive: "string", constraints: [] },
    });
  });
});

// ---------------------------------------------------------------------------
// ArrayNode
// ---------------------------------------------------------------------------

describe("irToJson — ArrayNode", () => {
  it("serializes an array with element and constraints", () => {
    const node = {
      kind: "array" as const,
      element: {
        kind: "primitive" as const,
        primitive: "string" as const,
        constraints: [],
      } satisfies IRNode,
      constraints: [
        {
          kind: "constraint" as const,
          target: "array" as const,
          name: "min",
          params: { value: 1 },
        },
        {
          kind: "constraint" as const,
          target: "array" as const,
          name: "max",
          params: { value: 10 },
        },
      ],
    } satisfies IRNode;

    const result = irToJson(node);
    assertJsonRoundtrip(result);
    expect(result).toEqual({
      kind: "array",
      element: { kind: "primitive", primitive: "string", constraints: [] },
      constraints: [
        {
          kind: "constraint",
          target: "array",
          name: "min",
          params: { value: 1 },
        },
        {
          kind: "constraint",
          target: "array",
          name: "max",
          params: { value: 10 },
        },
      ],
    });
  });
});

// ---------------------------------------------------------------------------
// EnumNode
// ---------------------------------------------------------------------------

describe("irToJson — EnumNode", () => {
  it("serializes a z.enum", () => {
    const node = {
      kind: "enum" as const,
      variant: "enum" as const,
      values: ["foo", "bar", "baz"],
    } satisfies IRNode;

    const result = irToJson(node);
    assertJsonRoundtrip(result);
    expect(result).toEqual({
      kind: "enum",
      variant: "enum",
      values: ["foo", "bar", "baz"],
    });
  });

  it("serializes a discriminated union variant", () => {
    const node = {
      kind: "enum" as const,
      variant: "enum" as const,
      values: ["a", "b"],
      discriminator: "type",
      options: [
        {
          kind: "primitive" as const,
          primitive: "string" as const,
          constraints: [],
        } satisfies IRNode,
      ],
    } satisfies IRNode;

    const result = irToJson(node);
    assertJsonRoundtrip(result);
    expect(result).toEqual({
      kind: "enum",
      variant: "enum",
      values: ["a", "b"],
      discriminator: "type",
      options: [{ kind: "primitive", primitive: "string", constraints: [] }],
    });
  });
});

// ---------------------------------------------------------------------------
// UnionNode
// ---------------------------------------------------------------------------

describe("irToJson — UnionNode", () => {
  it("serializes a union with options", () => {
    const node = {
      kind: "union" as const,
      options: [
        {
          kind: "primitive" as const,
          primitive: "string" as const,
          constraints: [],
        } satisfies IRNode,
        {
          kind: "primitive" as const,
          primitive: "number" as const,
          constraints: [],
        } satisfies IRNode,
      ],
    } satisfies IRNode;

    const result = irToJson(node);
    assertJsonRoundtrip(result);
    expect(result).toEqual({
      kind: "union",
      options: [
        { kind: "primitive", primitive: "string", constraints: [] },
        { kind: "primitive", primitive: "number", constraints: [] },
      ],
    });
  });

  it("serializes union with discriminator", () => {
    const node = {
      kind: "union" as const,
      options: [
        {
          kind: "primitive" as const,
          primitive: "string" as const,
          constraints: [],
        } satisfies IRNode,
      ],
      discriminator: "kind",
    } satisfies IRNode;

    const result = irToJson(node);
    assertJsonRoundtrip(result);
    expect(result).toHaveProperty("discriminator", "kind");
  });
});

// ---------------------------------------------------------------------------
// LiteralNode
// ---------------------------------------------------------------------------

describe("irToJson — LiteralNode", () => {
  it("serializes string literal", () => {
    const node = { kind: "literal" as const, value: "hello" } satisfies IRNode;
    const result = irToJson(node);
    assertJsonRoundtrip(result);
    expect(result).toEqual({ kind: "literal", value: "hello" });
  });

  it("serializes number literal", () => {
    const node = { kind: "literal" as const, value: 42 } satisfies IRNode;
    const result = irToJson(node);
    assertJsonRoundtrip(result);
    expect(result).toEqual({ kind: "literal", value: 42 });
  });

  it("serializes boolean literal", () => {
    const node = { kind: "literal" as const, value: true } satisfies IRNode;
    const result = irToJson(node);
    assertJsonRoundtrip(result);
    expect(result).toEqual({ kind: "literal", value: true });
  });

  it("serializes null literal", () => {
    const node = { kind: "literal" as const, value: null } satisfies IRNode;
    const result = irToJson(node);
    assertJsonRoundtrip(result);
    expect(result).toEqual({ kind: "literal", value: null });
  });

  it("encodes bigint literal", () => {
    const node = { kind: "literal" as const, value: 123n } satisfies IRNode;
    const result = irToJson(node);
    assertJsonRoundtrip(result);
    expect(result).toEqual({ kind: "literal", value: { _bigint: "123" } });
  });

  it("encodes RegExp literal", () => {
    const node = { kind: "literal" as const, value: /abc/gi } satisfies IRNode;
    const result = irToJson(node);
    assertJsonRoundtrip(result);
    expect(result).toEqual({
      kind: "literal",
      value: { _regex: "/abc/gi" },
    });
  });
});

// ---------------------------------------------------------------------------
// ModifiedNode
// ---------------------------------------------------------------------------

describe("irToJson — ModifiedNode", () => {
  it("serializes optional wrapping a primitive", () => {
    const node = {
      kind: "modified" as const,
      inner: {
        kind: "primitive" as const,
        primitive: "string" as const,
        constraints: [],
      } satisfies IRNode,
      modifiers: [
        {
          kind: "modifier" as const,
          name: "optional" as const,
        },
      ],
    } satisfies IRNode;

    const result = irToJson(node);
    assertJsonRoundtrip(result);
    expect(result).toEqual({
      kind: "modified",
      inner: { kind: "primitive", primitive: "string", constraints: [] },
      modifiers: [{ kind: "modifier", name: "optional" }],
    });
  });

  it("serializes default modifier with value", () => {
    const node = {
      kind: "modified" as const,
      inner: {
        kind: "primitive" as const,
        primitive: "string" as const,
        constraints: [],
      } satisfies IRNode,
      modifiers: [
        {
          kind: "modifier" as const,
          name: "default" as const,
          value: "hello",
        },
      ],
    } satisfies IRNode;

    const result = irToJson(node);
    assertJsonRoundtrip(result);
    expect(result).toEqual({
      kind: "modified",
      inner: { kind: "primitive", primitive: "string", constraints: [] },
      modifiers: [{ kind: "modifier", name: "default", value: "hello" }],
    });
  });

  it("serializes default modifier with placeholder", () => {
    const node = {
      kind: "modified" as const,
      inner: {
        kind: "primitive" as const,
        primitive: "string" as const,
        constraints: [],
      } satisfies IRNode,
      modifiers: [
        {
          kind: "modifier" as const,
          name: "default" as const,
          placeholder: "<complex>",
        },
      ],
    } satisfies IRNode;

    const result = irToJson(node);
    assertJsonRoundtrip(result);
    expect(result).toEqual({
      kind: "modified",
      inner: { kind: "primitive", primitive: "string", constraints: [] },
      modifiers: [
        { kind: "modifier", name: "default", placeholder: "<complex>" },
      ],
    });
  });
});

// ---------------------------------------------------------------------------
// Special value encodings
// ---------------------------------------------------------------------------

describe("irToJson — special value encodings", () => {
  it("encodes bigint in constraint minimum", () => {
    const node = {
      kind: "primitive" as const,
      primitive: "bigint" as const,
      constraints: [
        {
          kind: "constraint" as const,
          target: "bigint" as const,
          name: "min",
          params: { minimum: 100n },
        },
      ],
    } satisfies IRNode;

    const result = irToJson(node);
    assertJsonRoundtrip(result);
    expect(result).toEqual({
      kind: "primitive",
      primitive: "bigint",
      constraints: [
        {
          kind: "constraint",
          target: "bigint",
          name: "min",
          params: { minimum: { _bigint: "100" } },
        },
      ],
    });
  });

  it("encodes RegExp in constraint params", () => {
    const node = {
      kind: "primitive" as const,
      primitive: "string" as const,
      constraints: [
        {
          kind: "constraint" as const,
          target: "string" as const,
          name: "regex",
          params: { regex: /^[a-z]+$/i },
        },
      ],
    } satisfies IRNode;

    const result = irToJson(node);
    assertJsonRoundtrip(result);
    expect(result).toEqual({
      kind: "primitive",
      primitive: "string",
      constraints: [
        {
          kind: "constraint",
          target: "string",
          name: "regex",
          params: { regex: { _regex: "/^[a-z]+$/i" } },
        },
      ],
    });
  });

  it("omits undefined fields from constraint params", () => {
    const node = {
      kind: "primitive" as const,
      primitive: "string" as const,
      constraints: [
        {
          kind: "constraint" as const,
          target: "string" as const,
          name: "email",
          params: {},
        },
      ],
    } satisfies IRNode;

    const result = irToJson(node) as Record<string, unknown>;
    assertJsonRoundtrip(result);
    const constraints = result.constraints as Record<string, unknown>[];
    const params = constraints[0].params as Record<string, unknown>;
    expect(params).not.toHaveProperty("value");
    expect(params).not.toHaveProperty("minimum");
    expect(params).not.toHaveProperty("maximum");
    expect(params).not.toHaveProperty("inclusive");
    expect(params).not.toHaveProperty("regex");
  });

  it("encodes function literal as unsupported", () => {
    const fn = () => {};
    const node = { kind: "literal" as const, value: fn } satisfies IRNode;
    const result = irToJson(node);
    assertJsonRoundtrip(result);
    expect(result).toEqual({
      kind: "literal",
      value: { _unsupported: "function" },
    });
  });

  it("encodes symbol literal as unsupported", () => {
    const node = {
      kind: "literal" as const,
      value: Symbol("test"),
    } satisfies IRNode;
    const result = irToJson(node);
    assertJsonRoundtrip(result);
    expect(result).toEqual({
      kind: "literal",
      value: { _unsupported: "symbol" },
    });
  });

  it("encodes NaN as {_nan: true}", () => {
    const node = { kind: "literal" as const, value: NaN } satisfies IRNode;
    const result = irToJson(node);
    assertJsonRoundtrip(result);
    expect(result).toEqual({
      kind: "literal",
      value: { _nan: true },
    });
  });

  it("encodes Infinity as {_infinity: 1}", () => {
    const node = {
      kind: "literal" as const,
      value: Infinity,
    } satisfies IRNode;
    const result = irToJson(node);
    assertJsonRoundtrip(result);
    expect(result).toEqual({
      kind: "literal",
      value: { _infinity: 1 },
    });
  });

  it("encodes -Infinity as {_infinity: -1}", () => {
    const node = {
      kind: "literal" as const,
      value: -Infinity,
    } satisfies IRNode;
    const result = irToJson(node);
    assertJsonRoundtrip(result);
    expect(result).toEqual({
      kind: "literal",
      value: { _infinity: -1 },
    });
  });
});

// ---------------------------------------------------------------------------
// schemasToJson
// ---------------------------------------------------------------------------

describe("schemasToJson", () => {
  it("produces correct top-level document structure", () => {
    const results = [
      {
        name: "User",
        ir: {
          kind: "object" as const,
          fields: [
            {
              key: "name",
              value: {
                kind: "primitive" as const,
                primitive: "string" as const,
                constraints: [],
              } satisfies IRNode,
            },
          ],
          unknownMode: "strip" as const,
        } satisfies IRNode,
      },
      {
        name: "Post",
        ir: {
          kind: "object" as const,
          fields: [
            {
              key: "title",
              value: {
                kind: "primitive" as const,
                primitive: "string" as const,
                constraints: [],
              } satisfies IRNode,
            },
          ],
          unknownMode: "strip" as const,
        } satisfies IRNode,
      },
    ];

    const doc = schemasToJson(results);
    assertJsonRoundtrip(doc);
    expect(doc.version).toBe(AST_JSON_VERSION);
    expect(doc.version).toBe(1);
    expect(Object.keys(doc.schemas)).toEqual(["User", "Post"]);
    expect(doc.schemas.User).toEqual({
      kind: "object",
      fields: [
        {
          key: "name",
          value: { kind: "primitive", primitive: "string", constraints: [] },
        },
      ],
      unknownMode: "strip",
    });
  });

  it("handles empty schema list", () => {
    const doc = schemasToJson([]);
    assertJsonRoundtrip(doc);
    expect(doc.version).toBe(1);
    expect(doc.schemas).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// FallbackNode & RawNode
// ---------------------------------------------------------------------------

describe("irToJson — FallbackNode", () => {
  it("serializes not-a-zod-schema fallback", () => {
    const node = {
      kind: "fallback" as const,
      reason: "not-a-zod-schema" as const,
    } satisfies IRNode;

    const result = irToJson(node);
    assertJsonRoundtrip(result);
    expect(result).toEqual({ kind: "fallback", reason: "not-a-zod-schema" });
  });

  it("serializes fallback with detail", () => {
    const node = {
      kind: "fallback" as const,
      reason: "unhandled" as const,
      detail: "z.custom",
    } satisfies IRNode;

    const result = irToJson(node);
    assertJsonRoundtrip(result);
    expect(result).toEqual({
      kind: "fallback",
      reason: "unhandled",
      detail: "z.custom",
    });
  });
});

describe("irToJson — RawNode", () => {
  it("serializes raw node (omits original)", () => {
    const node = {
      kind: "raw" as const,
      code: "z.custom(someCheck)",
      reason: "custom-type",
      original: { some: "debug-data" },
    } satisfies IRNode;

    const result = irToJson(node) as Record<string, unknown>;
    assertJsonRoundtrip(result);
    expect(result).toEqual({
      kind: "raw",
      code: "z.custom(someCheck)",
      reason: "custom-type",
    });
    expect(result).not.toHaveProperty("original");
  });
});

// ---------------------------------------------------------------------------
// Remaining node types (completeness checks)
// ---------------------------------------------------------------------------

describe("irToJson — remaining node types", () => {
  it("serializes TupleNode", () => {
    const node = {
      kind: "tuple" as const,
      items: [
        {
          kind: "primitive" as const,
          primitive: "string" as const,
          constraints: [],
        } satisfies IRNode,
        {
          kind: "primitive" as const,
          primitive: "number" as const,
          constraints: [],
        } satisfies IRNode,
      ],
    } satisfies IRNode;

    const result = irToJson(node);
    assertJsonRoundtrip(result);
    expect(result).toHaveProperty("kind", "tuple");
  });

  it("serializes TupleNode with rest", () => {
    const node = {
      kind: "tuple" as const,
      items: [
        {
          kind: "primitive" as const,
          primitive: "string" as const,
          constraints: [],
        } satisfies IRNode,
      ],
      rest: {
        kind: "primitive" as const,
        primitive: "number" as const,
        constraints: [],
      } satisfies IRNode,
    } satisfies IRNode;

    const result = irToJson(node);
    assertJsonRoundtrip(result);
    expect(result).toHaveProperty("rest");
  });

  it("serializes RecordNode", () => {
    const node = {
      kind: "record" as const,
      key: {
        kind: "primitive" as const,
        primitive: "string" as const,
        constraints: [],
      } satisfies IRNode,
      value: {
        kind: "primitive" as const,
        primitive: "number" as const,
        constraints: [],
      } satisfies IRNode,
    } satisfies IRNode;

    const result = irToJson(node);
    assertJsonRoundtrip(result);
    expect(result).toHaveProperty("kind", "record");
  });

  it("serializes MapNode", () => {
    const node = {
      kind: "map" as const,
      key: {
        kind: "primitive" as const,
        primitive: "string" as const,
        constraints: [],
      } satisfies IRNode,
      value: {
        kind: "primitive" as const,
        primitive: "number" as const,
        constraints: [],
      } satisfies IRNode,
    } satisfies IRNode;

    const result = irToJson(node);
    assertJsonRoundtrip(result);
    expect(result).toHaveProperty("kind", "map");
  });

  it("serializes SetNode", () => {
    const node = {
      kind: "set" as const,
      element: {
        kind: "primitive" as const,
        primitive: "string" as const,
        constraints: [],
      } satisfies IRNode,
      constraints: [],
    } satisfies IRNode;

    const result = irToJson(node);
    assertJsonRoundtrip(result);
    expect(result).toHaveProperty("kind", "set");
  });

  it("serializes IntersectionNode", () => {
    const node = {
      kind: "intersection" as const,
      left: {
        kind: "primitive" as const,
        primitive: "string" as const,
        constraints: [],
      } satisfies IRNode,
      right: {
        kind: "primitive" as const,
        primitive: "number" as const,
        constraints: [],
      } satisfies IRNode,
    } satisfies IRNode;

    const result = irToJson(node);
    assertJsonRoundtrip(result);
    expect(result).toHaveProperty("kind", "intersection");
  });

  it("serializes TransformNode", () => {
    const node = {
      kind: "transform" as const,
      inner: {
        kind: "primitive" as const,
        primitive: "string" as const,
        constraints: [],
      } satisfies IRNode,
      fn: {
        kind: "function" as const,
        usage: "transform" as const,
        mode: "placeholder" as const,
      },
    } satisfies IRNode;

    const result = irToJson(node);
    assertJsonRoundtrip(result);
    expect(result).toHaveProperty("kind", "transform");
  });

  it("serializes RefineNode", () => {
    const node = {
      kind: "refine" as const,
      inner: {
        kind: "primitive" as const,
        primitive: "string" as const,
        constraints: [],
      } satisfies IRNode,
      fn: {
        kind: "function" as const,
        usage: "refine" as const,
        mode: "placeholder" as const,
      },
    } satisfies IRNode;

    const result = irToJson(node);
    assertJsonRoundtrip(result);
    expect(result).toHaveProperty("kind", "refine");
  });

  it("serializes PreprocessNode", () => {
    const node = {
      kind: "preprocess" as const,
      inner: {
        kind: "primitive" as const,
        primitive: "string" as const,
        constraints: [],
      } satisfies IRNode,
      fn: {
        kind: "function" as const,
        usage: "preprocess" as const,
        mode: "placeholder" as const,
      },
    } satisfies IRNode;

    const result = irToJson(node);
    assertJsonRoundtrip(result);
    expect(result).toHaveProperty("kind", "preprocess");
  });

  it("serializes PipeNode", () => {
    const node = {
      kind: "pipe" as const,
      in: {
        kind: "primitive" as const,
        primitive: "string" as const,
        constraints: [],
      } satisfies IRNode,
      out: {
        kind: "primitive" as const,
        primitive: "number" as const,
        constraints: [],
      } satisfies IRNode,
    } satisfies IRNode;

    const result = irToJson(node);
    assertJsonRoundtrip(result);
    expect(result).toHaveProperty("kind", "pipe");
  });

  it("serializes ZodFunctionNode", () => {
    const node = {
      kind: "zod-function" as const,
      args: [
        {
          kind: "primitive" as const,
          primitive: "string" as const,
          constraints: [],
        } satisfies IRNode,
      ],
      returns: {
        kind: "primitive" as const,
        primitive: "number" as const,
        constraints: [],
      } satisfies IRNode,
    } satisfies IRNode;

    const result = irToJson(node);
    assertJsonRoundtrip(result);
    expect(result).toHaveProperty("kind", "zod-function");
    expect(result).toHaveProperty("args");
    expect(result).toHaveProperty("returns");
  });

  it("serializes LazyNode with placeholder", () => {
    const node = {
      kind: "lazy" as const,
      placeholder: true,
    } satisfies IRNode;

    const result = irToJson(node);
    assertJsonRoundtrip(result);
    expect(result).toEqual({ kind: "lazy", placeholder: true });
  });

  it("serializes LazyNode with inner", () => {
    const node = {
      kind: "lazy" as const,
      placeholder: false,
      inner: {
        kind: "primitive" as const,
        primitive: "string" as const,
        constraints: [],
      } satisfies IRNode,
    } satisfies IRNode;

    const result = irToJson(node);
    assertJsonRoundtrip(result);
    expect(result).toHaveProperty("inner");
  });

  it("serializes PromiseNode", () => {
    const node = {
      kind: "promise" as const,
      inner: {
        kind: "primitive" as const,
        primitive: "string" as const,
        constraints: [],
      } satisfies IRNode,
    } satisfies IRNode;

    const result = irToJson(node);
    assertJsonRoundtrip(result);
    expect(result).toHaveProperty("kind", "promise");
  });
});

// ---------------------------------------------------------------------------
// Deeply nested schema
// ---------------------------------------------------------------------------

describe("irToJson — deeply nested", () => {
  it("handles nested modified → primitive → constraint", () => {
    const node = {
      kind: "modified" as const,
      inner: {
        kind: "primitive" as const,
        primitive: "number" as const,
        constraints: [
          {
            kind: "constraint" as const,
            target: "number" as const,
            name: "int",
            params: {},
          },
        ],
      } satisfies IRNode,
      modifiers: [{ kind: "modifier" as const, name: "optional" as const }],
    } satisfies IRNode;

    const result = irToJson(node);
    assertJsonRoundtrip(result);
    expect(JSON.stringify(result)).toContain("int");
  });
});
