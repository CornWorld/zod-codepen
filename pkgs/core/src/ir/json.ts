/**
 * IR → JSON AST serialization.
 *
 * Produces a JSON-compatible object tree from IR nodes so downstream
 * tools (e.g. a Go native validator) can consume Zod schemas without
 * needing to run JavaScript or parse TypeScript.
 *
 * Design:
 *   - Pure function, no Zod knowledge, no version branching.
 *   - Output is guaranteed JSON-roundtrippable (no functions, no undefined,
 *     no bigint, no RegExp).
 *   - Orthogonal to codegen.ts — codegen produces TS source strings, this
 *     produces a structured JSON document.
 */

import type {
  IRNode,
  ConstraintNode,
  ConstraintParams,
  ModifierNode,
  ObjectField,
} from "./nodes.js";

/** Current JSON AST format version. Increment on breaking changes. */
export const AST_JSON_VERSION = 1;

/** Top-level JSON AST document. */
export interface AstJsonDocument {
  version: number;
  schemas: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Special value encoding helpers
// ---------------------------------------------------------------------------

/**
 * Encode a value that may not be directly JSON-serializable.
 *
 * Rules (in priority order):
 *   - `undefined` → omit (caller handles this)
 *   - `null` → null
 *   - `bigint` → `{_bigint: "<string>"}`
 *   - `RegExp` → `{_regex: "/pattern/flags"}`
 *   - `function` → `{_unsupported: "function"}`
 *   - `symbol` → `{_unsupported: "symbol"}`
 *   - `string` / `boolean` → pass through
 *   - `number` → pass through (NaN → `{_nan: true}`, Infinity → `{_infinity: ±1}`)
 *   - everything else → JSON.stringify fallback
 */
function encodeValue(value: unknown): unknown {
  if (value === null) return null;
  if (value === undefined) return undefined;

  if (typeof value === "bigint") {
    return { _bigint: String(value) };
  }

  if (value instanceof RegExp) {
    return { _regex: value.toString() };
  }

  if (typeof value === "function") {
    return { _unsupported: "function" };
  }

  if (typeof value === "symbol") {
    return { _unsupported: "symbol" };
  }

  if (typeof value === "string" || typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    if (Number.isNaN(value)) return { _nan: true };
    if (!Number.isFinite(value)) return { _infinity: value > 0 ? 1 : -1 };
    return value;
  }

  // Fallback: try to stringify; if circular, use unsupported marker.
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return { _unsupported: typeof value };
  }
}

// ---------------------------------------------------------------------------
// Constraint encoding
// ---------------------------------------------------------------------------

function encodeConstraintParams(
  params: ConstraintParams,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};

  if (params.value !== undefined) {
    out.value = encodeValue(params.value);
  }
  if (params.minimum !== undefined) {
    out.minimum = encodeValue(params.minimum);
  }
  if (params.maximum !== undefined) {
    out.maximum = encodeValue(params.maximum);
  }
  if (params.inclusive !== undefined) {
    out.inclusive = params.inclusive;
  }
  if (params.regex !== undefined) {
    out.regex = encodeValue(params.regex);
  }

  return out;
}

function encodeConstraint(c: ConstraintNode): Record<string, unknown> {
  return {
    kind: c.kind,
    target: c.target,
    name: c.name,
    params: encodeConstraintParams(c.params),
  };
}

function encodeConstraints(
  constraints: readonly ConstraintNode[],
): Record<string, unknown>[] {
  return constraints.map(encodeConstraint);
}

// ---------------------------------------------------------------------------
// Modifier encoding
// ---------------------------------------------------------------------------

function encodeModifier(m: ModifierNode): Record<string, unknown> {
  const out: Record<string, unknown> = {
    kind: m.kind,
    name: m.name,
  };

  if (m.value !== undefined) {
    out.value = encodeValue(m.value);
  }
  if (m.placeholder !== undefined) {
    out.placeholder = m.placeholder;
  }

  return out;
}

function encodeModifiers(
  modifiers: readonly ModifierNode[],
): Record<string, unknown>[] {
  return modifiers.map(encodeModifier);
}

// ---------------------------------------------------------------------------
// Object field encoding
// ---------------------------------------------------------------------------

function encodeField(f: ObjectField): Record<string, unknown> {
  return {
    key: f.key,
    value: irToJsonRec(f.value),
  };
}

// ---------------------------------------------------------------------------
// Function node encoding
// ---------------------------------------------------------------------------

function encodeFunction(fn: {
  usage: string;
  mode: string;
  source?: string;
  vars?: string[];
}): Record<string, unknown> {
  const out: Record<string, unknown> = {
    kind: "function",
    usage: fn.usage,
    mode: fn.mode,
  };

  if (fn.source !== undefined) {
    out.source = fn.source;
  }
  if (fn.vars !== undefined) {
    out.vars = fn.vars;
  }

  return out;
}

// ---------------------------------------------------------------------------
// Main recursive serializer
// ---------------------------------------------------------------------------

function irToJsonRec(node: IRNode): unknown {
  switch (node.kind) {
    // -- primitive ---------------------------------------------------------
    case "primitive": {
      const out: Record<string, unknown> = {
        kind: "primitive",
        primitive: node.primitive,
        constraints: encodeConstraints(node.constraints),
      };
      if (node.coerce !== undefined) {
        out.coerce = node.coerce;
      }
      return out;
    }

    // -- modified -----------------------------------------------------------
    case "modified": {
      return {
        kind: "modified",
        inner: irToJsonRec(node.inner),
        modifiers: encodeModifiers(node.modifiers),
      };
    }

    // -- literal ------------------------------------------------------------
    case "literal": {
      return {
        kind: "literal",
        value: encodeValue(node.value),
      };
    }

    // -- enum ---------------------------------------------------------------
    case "enum": {
      const out: Record<string, unknown> = {
        kind: "enum",
        variant: node.variant,
        values: node.values,
      };
      if (node.discriminator !== undefined) {
        out.discriminator = node.discriminator;
      }
      if (node.options !== undefined) {
        out.options = node.options.map(irToJsonRec);
      }
      return out;
    }

    // -- array --------------------------------------------------------------
    case "array": {
      return {
        kind: "array",
        element: irToJsonRec(node.element),
        constraints: encodeConstraints(node.constraints),
      };
    }

    // -- object -------------------------------------------------------------
    case "object": {
      const out: Record<string, unknown> = {
        kind: "object",
        fields: node.fields.map(encodeField),
        unknownMode: node.unknownMode,
      };
      if (node.catchall !== undefined) {
        out.catchall = irToJsonRec(node.catchall);
      }
      return out;
    }

    // -- tuple --------------------------------------------------------------
    case "tuple": {
      const out: Record<string, unknown> = {
        kind: "tuple",
        items: node.items.map(irToJsonRec),
      };
      if (node.rest !== undefined) {
        out.rest = irToJsonRec(node.rest);
      }
      return out;
    }

    // -- record -------------------------------------------------------------
    case "record": {
      return {
        kind: "record",
        key: irToJsonRec(node.key),
        value: irToJsonRec(node.value),
      };
    }

    // -- map ----------------------------------------------------------------
    case "map": {
      return {
        kind: "map",
        key: irToJsonRec(node.key),
        value: irToJsonRec(node.value),
      };
    }

    // -- set ----------------------------------------------------------------
    case "set": {
      return {
        kind: "set",
        element: irToJsonRec(node.element),
        constraints: encodeConstraints(node.constraints),
      };
    }

    // -- union --------------------------------------------------------------
    case "union": {
      const out: Record<string, unknown> = {
        kind: "union",
        options: node.options.map(irToJsonRec),
      };
      if (node.discriminator !== undefined) {
        out.discriminator = node.discriminator;
      }
      return out;
    }

    // -- intersection -------------------------------------------------------
    case "intersection": {
      return {
        kind: "intersection",
        left: irToJsonRec(node.left),
        right: irToJsonRec(node.right),
      };
    }

    // -- transform ----------------------------------------------------------
    case "transform": {
      return {
        kind: "transform",
        inner: irToJsonRec(node.inner),
        fn: encodeFunction(node.fn),
      };
    }

    // -- refine -------------------------------------------------------------
    case "refine": {
      return {
        kind: "refine",
        inner: irToJsonRec(node.inner),
        fn: encodeFunction(node.fn),
      };
    }

    // -- preprocess ---------------------------------------------------------
    case "preprocess": {
      return {
        kind: "preprocess",
        inner: irToJsonRec(node.inner),
        fn: encodeFunction(node.fn),
      };
    }

    // -- pipe ---------------------------------------------------------------
    case "pipe": {
      return {
        kind: "pipe",
        in: irToJsonRec(node.in),
        out: irToJsonRec(node.out),
      };
    }

    // -- zod-function -------------------------------------------------------
    case "zod-function": {
      const out: Record<string, unknown> = {
        kind: "zod-function",
        args: node.args.map(irToJsonRec),
      };
      if (node.returns !== undefined) {
        out.returns = irToJsonRec(node.returns);
      }
      return out;
    }

    // -- lazy ---------------------------------------------------------------
    case "lazy": {
      const out: Record<string, unknown> = {
        kind: "lazy",
        placeholder: node.placeholder,
      };
      if (node.inner !== undefined) {
        out.inner = irToJsonRec(node.inner);
      }
      return out;
    }

    // -- promise ------------------------------------------------------------
    case "promise": {
      return {
        kind: "promise",
        inner: irToJsonRec(node.inner),
      };
    }

    // -- fallback -----------------------------------------------------------
    case "fallback": {
      const out: Record<string, unknown> = {
        kind: "fallback",
        reason: node.reason,
      };
      if (node.detail !== undefined) {
        out.detail = node.detail;
      }
      return out;
    }

    // -- raw ----------------------------------------------------------------
    case "raw": {
      return {
        kind: "raw",
        code: node.code,
        reason: node.reason,
      };
    }

    default: {
      // Exhaustiveness guard: if a new IRNode kind is added without updating
      // this switch, we return a safe marker instead of undefined.
      const _exhaustive: never = node;
      return { _unsupported: `unknown-kind:${(_exhaustive as IRNode).kind}` };
    }
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Serialize a single IRNode to a JSON-compatible value.
 *
 * The returned value is guaranteed to be safe for `JSON.stringify`:
 * no functions, no `undefined`, no `bigint`, no `RegExp`.
 */
export function irToJson(node: IRNode): unknown {
  return irToJsonRec(node);
}

/**
 * Serialize multiple named schemas to a top-level JSON AST document.
 *
 * Each entry in `results` should have a `name` (the schema's identifier)
 * and an `ir` node produced by `castFromZod` or `castFromAst`.
 */
export function schemasToJson(
  results: { name: string; ir: IRNode }[],
): AstJsonDocument {
  const schemas: Record<string, unknown> = {};
  for (const entry of results) {
    if (entry.name in schemas) {
      console.warn(
        `[ir-to-json] duplicate schema name '${entry.name}' — overwriting previous entry`,
      );
    }
    schemas[entry.name] = irToJsonRec(entry.ir);
  }
  return {
    version: AST_JSON_VERSION,
    schemas,
  };
}
