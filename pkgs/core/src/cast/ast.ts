/**
 * Cast a TypeScript CallExpression node (from static AST analysis) to IR.
 *
 * Entry: castFromCallExpression(node, opts) → IRNode.
 *       castFromAst(source, exportName, opts) → IRNode (single export).
 *       castAllFromAst(source, opts) → {name, ir}[].
 *
 * Strategy: getPropertyChain() flattens `z.string().email().min(5)` into
 * {path, args}. The head element is the root identifier; if it's `z` (or an
 * aliased zod root), we dispatch on path[1..] to build the IR.
 *
 * Modifier chains (optional/nullable/default/...) are collected in source
 * order (innermost first) and emitted as a ModifiedNode. Constraint chains
 * (min/max/email/...) are collected similarly and attached to the
 * PrimitiveNode/ArrayNode/SetNode.
 *
 * Cross-module imports and spread-merging require a ModuleResolver; without
 * one, those branches emit RawNode with a descriptive reason.
 */

import * as ts from "typescript";
import type {
  IRNode,
  PrimitiveName,
  ConstraintNode,
  ConstraintTarget,
  ModifierNode,
  ModifierName,
  ObjectField,
  ObjectUnknownMode,
  FunctionMode,
  FunctionUsage,
} from "../ir/nodes.js";
import {
  getPropertyChain,
  getLiteralValue,
  parseObjectLiteral,
  type FlattenedChain,
} from "./ast-utils.js";
import { tryInlineWrapper as tryInlineWrapperImpl } from "../extract/inline.js";
import { extractSchemaExports } from "../extract/module.js";

// ============================================================
// Types
// ============================================================

export interface AstCastOptions {
  /** File name used in error messages. */
  fileName?: string;
  /** What to do when a CallExpression can't be cast. Default 'raw'. */
  onUnknown?: "raw" | "fallback" | "throw";
  /** Root identifiers that should be treated as the Zod namespace. Default ['z']. */
  zodRoots?: string[];
  /** Optional resolver for cross-file imports. */
  resolver?: AstResolver;
  /**
   * Internal: the source file currently being cast. Used by wrapper-function
   * inlining (extract/inline.ts). Cast callers should leave this undefined;
   * castFromAst sets it automatically.
   */
  sourceFile?: ts.SourceFile;
}

export interface AstResolver {
  /**
   * Resolve `import { Name } from 'specifier'` (or default import) into an IR.
   * Returns undefined if not resolvable (external module, missing file).
   * Returns { kind: 'circular' } if a cycle is detected — the caller will
   * emit a LazyNode placeholder.
   */
  resolveSchema(
    specifier: string,
    exportName: string,
    fromFile: string,
    opts?: AstCastOptions,
  ): IRNode | { kind: "circular" } | undefined;
  /** Resolve a property access like `BaseSchema.shape` returning merged fields. */
  resolveSpreadShape(
    baseExpr: ts.Expression,
    fromFile: string,
    opts?: AstCastOptions,
  ): ObjectField[] | undefined;
  /** Resolve a bare identifier reference (local or imported). */
  resolveIdentifier?(
    name: string,
    fromFile: string,
    fromSource: ts.SourceFile,
    opts: AstCastOptions,
  ): IRNode | undefined;
}

// ============================================================
// Constants
// ============================================================

const PRIMITIVES: Record<string, PrimitiveName> = {
  string: "string",
  number: "number",
  bigint: "bigint",
  boolean: "boolean",
  date: "date",
  symbol: "symbol",
  undefined: "undefined",
  null: "null",
  void: "void",
  any: "any",
  unknown: "unknown",
  never: "never",
  nan: "nan",
};

const MODIFIERS: Record<string, ModifierName> = {
  optional: "optional",
  nullable: "nullable",
  nullish: "nullish",
  default: "default",
  catch: "catch",
  brand: "brand",
  branded: "brand",
  readonly: "readonly",
  prefault: "prefault",
};

// Constraint names grouped by which ConstraintTarget they apply to.
// Used both for filtering and for building ConstraintNode.
const STRING_CONSTRAINTS = new Set([
  "min",
  "max",
  "length",
  "email",
  "url",
  "uuid",
  "cuid",
  "cuid2",
  "ulid",
  "nanoid",
  "datetime",
  "ip",
  "date",
  "time",
  "duration",
  "regex",
  "startsWith",
  "endsWith",
  "includes",
  "trim",
  "toLowerCase",
  "toUpperCase",
  "normalize",
]);
const NUMBER_BIGINT_CONSTRAINTS = new Set([
  "min",
  "max",
  "int",
  "finite",
  "multipleOf",
  "safe",
  "positive",
  "negative",
  "nonnegative",
  "nonpositive",
]);
const COLLECTION_CONSTRAINTS = new Set([
  "min",
  "max",
  "length",
  "size",
  "nonempty",
]);

// ============================================================
// Entry
// ============================================================

export function castFromAst(
  source: string,
  exportName: string,
  opts: AstCastOptions = {},
): IRNode {
  const fileName = opts.fileName ?? "anonymous.ts";
  const sf = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.ESNext,
    /* setParentNodes */ true,
  );

  // Find the export named `exportName` via the shared extract layer.
  const exports = extractSchemaExports(source, {
    zodRoots: opts.zodRoots ?? ["z"],
  });
  const found = exports.find((e) => e.name === exportName);
  if (!found || !found.expression) {
    return {
      kind: "fallback",
      reason: "unknown-type",
      detail: `export '${exportName}' not found`,
    };
  }
  const optsWithSf: AstCastOptions = { ...opts, sourceFile: sf };
  return castFromExpression(found.expression, optsWithSf, fileName);
}

export function castAllFromAst(
  source: string,
  opts: AstCastOptions = {},
): Array<{ name: string; ir: IRNode }> {
  const fileName = opts.fileName ?? "anonymous.ts";
  const sf = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.ESNext,
    /* setParentNodes */ true,
  );
  const exports = extractSchemaExports(source, {
    zodRoots: opts.zodRoots ?? ["z"],
  });
  const optsWithSf: AstCastOptions = { ...opts, sourceFile: sf };
  return exports
    .filter((e) => !e.isTypeOnly)
    .map(({ name, expression }) => ({
      name,
      ir: expression
        ? castFromExpression(expression, optsWithSf, fileName)
        : {
            kind: "fallback",
            reason: "unknown-type",
            detail: `${name}: no initializer`,
          },
    }));
}

/**
 * Cast an arbitrary expression to IR. Handles three forms:
 *   1. Direct Zod call: z.string(), z.object({...}), z.X().y()
 *   2. Identifier reference: UserSchema (when resolved via resolver)
 *   3. Wrapper function: f() or (() => z.X())() — tryInlineWrapper
 *
 * Returns RawNode for unrecognized forms.
 */
export function castFromCallExpression(
  node: ts.CallExpression,
  opts: AstCastOptions = {},
): IRNode {
  return castFromExpression(node, opts, opts.fileName ?? "anonymous.ts");
}

/**
 * Exported for resolvers that need to recurse into an inner expression
 * (typically after looking up a wrapper function body or a const
 * initializer). Not part of the stable public API; subject to change.
 */
export function castFromExpressionExported(
  expr: ts.Expression,
  opts: AstCastOptions = {},
): IRNode {
  return castFromExpression(expr, opts, opts.fileName ?? "anonymous.ts");
}

// ============================================================
// Core dispatch
// ============================================================

function castFromExpression(
  expr: ts.Expression,
  opts: AstCastOptions,
  fileName: string,
): IRNode {
  // Identifier reference: try resolver first (cross-file import or local).
  if (ts.isIdentifier(expr)) {
    if (opts.resolver && opts.sourceFile) {
      const resolved = opts.resolver.resolveIdentifier?.(
        expr.text,
        fileName,
        opts.sourceFile,
        opts,
      );
      if (resolved) return resolved;
    }
    return {
      kind: "raw",
      code: "z.any()",
      reason: `identifier-ref:${expr.text}`,
    };
  }

  if (!ts.isCallExpression(expr)) {
    // PropertyAccessExpression (e.g. BaseSchema.shape) — try resolver.
    if (ts.isPropertyAccessExpression(expr) && opts.resolver) {
      const fields = opts.resolver.resolveSpreadShape?.(expr, fileName);
      if (fields) {
        return { kind: "object", fields, unknownMode: "strip" };
      }
    }
    return rawNode(
      expr,
      opts,
      `not-call-expression:${ts.SyntaxKind[expr.kind]}`,
    );
  }

  const flattened = getPropertyChain(expr);
  if (!flattened) {
    return rawNode(expr, opts, "no-property-chain");
  }

  const { chain } = flattened;
  const root = chain.path[0];
  const zodRoots = opts.zodRoots ?? ["z"];
  if (!zodRoots.includes(root)) {
    // Try wrapper inlining. If that fails, fall back.
    return (
      tryInlineWrapper(expr, opts, fileName) ??
      rawNode(expr, opts, `non-zod-root:${root}`)
    );
  }

  return castZodChain(chain, opts, fileName);
}

/**
 * Dispatch on a flattened `z.*` chain.
 *
 * chain.path[1] is the first zod method. Different starting points route to
 * different IR shapes; modifiers/constraints are collected afterward.
 */
function castZodChain(
  chain: FlattenedChain["chain"],
  opts: AstCastOptions,
  fileName: string,
): IRNode {
  const path = chain.path;
  const args = chain.args;

  if (path.length < 2) {
    return rawNodeAt(chain, opts, "zod-chain-too-short");
  }

  const first = path[1];

  // z.coerce.X()
  if (first === "coerce") {
    return castCoerce(path, args, opts, fileName);
  }

  // z.X() — primitive
  if (PRIMITIVES[first]) {
    return castPrimitiveChain(path, args, PRIMITIVES[first], opts, fileName);
  }

  // Composite dispatch — these may have constraints (array/set) but most
  // don't have modifiers/constraints attached at this level.
  switch (first) {
    case "literal":
      return castLiteral(args);
    case "enum":
      return castEnum(args);
    case "nativeEnum":
      return castNativeEnum(args);
    case "array":
      return castArrayChain(path, args, opts, fileName);
    case "set":
      return castSetChain(path, args, opts, fileName);
    case "object":
      return castObjectChain(path, args, opts, fileName);
    case "tuple":
      return castTuple(args, opts, fileName);
    case "record":
      return castRecord(args, opts, fileName);
    case "map":
      return castMap(args, opts, fileName);
    case "union":
      return castUnion(args, opts, fileName);
    case "discriminatedUnion":
      return castDiscriminatedUnion(args, opts, fileName);
    case "intersection":
      return castIntersection(args, opts, fileName);
    case "lazy":
      return castLazy(args, opts, fileName);
    case "promise":
      return castPromise(args, opts, fileName);
    case "function":
      return castZodFunction(args, opts, fileName);
    case "preprocess":
      return castPreprocess(args, opts, fileName);
    case "transform":
      return castStandaloneTransform(args, opts, fileName);
    case "refine":
      return castStandaloneRefine(args, opts, fileName);
    case "pipe":
      return castPipe(args, opts, fileName);
    default:
      return rawNodeAt(chain, opts, `unknown-zod-method:${first}`);
  }
}

// ============================================================
// Primitives + modifiers/constraints
// ============================================================

function castCoerce(
  path: string[],
  args: ts.Expression[][],
  opts: AstCastOptions,
  fileName: string,
): IRNode {
  // z.coerce.X() — path[2] is the primitive name.
  if (path.length < 3) {
    return rawNodeEmpty(opts, "coerce-without-primitive");
  }
  const name = path[2];
  if (!PRIMITIVES[name] || !canCoerce(PRIMITIVES[name])) {
    return rawNodeEmpty(opts, `coerce-invalid-target:${name}`);
  }

  return castPrimitiveChain(
    path.slice(1), // shift path so constraint scanner sees [coerce, name, ...]
    args.slice(1),
    PRIMITIVES[name],
    opts,
    fileName,
    /* coerce */ true,
  );
}

function canCoerce(name: PrimitiveName): boolean {
  return (
    name === "string" ||
    name === "number" ||
    name === "boolean" ||
    name === "bigint" ||
    name === "date"
  );
}

/**
 * Cast a primitive base + trailing constraints/modifiers.
 *
 * For `z.string().email().min(5)`:
 *   path = ['z', 'string', 'email', 'min']
 *   name = 'string'
 *   path[2..] = ['email', 'min'] — both string constraints.
 *
 * For `z.string().optional().default('x')`:
 *   path[2..] = ['optional', 'default'] — modifiers, attached as ModifiedNode.
 *
 * Mixed chains like `z.string().email().optional()` produce:
 *   PrimitiveNode('string', constraints: [email])
 *   → ModifiedNode(inner: that, modifiers: [optional])
 */
function castPrimitiveChain(
  path: string[],
  args: ts.Expression[][],
  name: PrimitiveName,
  opts: AstCastOptions,
  fileName: string,
  coerce: boolean = false,
): IRNode {
  // path[0] is the root 'z' (or shifted 'coerce' for z.coerce).
  // path[1] is the primitive name.
  // path[2..] is constraints/modifiers/effects/pipe.

  const hasConstraints =
    name === "string" ||
    name === "number" ||
    name === "bigint" ||
    name === "date";

  let constraints: ConstraintNode[] = [];
  if (hasConstraints) {
    const target = name as ConstraintTarget;
    constraints = collectConstraints(path.slice(2), args.slice(2), target);
  }

  // Find the FIRST effect/pipe method in the tail. Everything before is
  // constraints/modifiers; everything after belongs to the wrapped node.
  // Zod only allows one effect per chain (subsequent calls attach to the
  // effect's inner — which we don't model here). MVP: stop at first effect.
  const effectIndex = findEffectOrPipe(path.slice(2));

  let effectiveTail = path.slice(2);
  if (effectIndex >= 0) {
    effectiveTail = path.slice(2, 2 + effectIndex);
  }

  const modifiers = collectModifiers(
    effectiveTail,
    args.slice(2, 2 + (effectIndex >= 0 ? effectIndex : path.length - 2)),
  );

  const primitiveNode: IRNode = {
    kind: "primitive",
    primitive: name,
    coerce: coerce ? true : undefined,
    constraints:
      effectIndex >= 0 ? constraints.slice(0, effectIndex) : constraints,
  };

  let result: IRNode;
  if (modifiers.length > 0) {
    result = { kind: "modified", inner: primitiveNode, modifiers };
  } else {
    result = primitiveNode;
  }

  // Apply effect/pipe wrapping if present.
  if (effectIndex >= 0) {
    const effectName = path[2 + effectIndex];
    const effectArgs = args[2 + effectIndex] ?? [];
    result = wrapEffect(result, effectName, effectArgs, opts, fileName);
  }

  return result;
}

/**
 * Index of the first effect/pipe method in the tail, or -1 if none.
 * Effects: transform, refine, superRefine, preprocess. Pipe: pipe.
 */
function findEffectOrPipe(tail: string[]): number {
  for (let i = 0; i < tail.length; i++) {
    const name = tail[i];
    if (
      name === "transform" ||
      name === "refine" ||
      name === "superRefine" ||
      name === "preprocess" ||
      name === "pipe"
    ) {
      return i;
    }
  }
  return -1;
}

function wrapEffect(
  inner: IRNode,
  effectName: string,
  args: ts.Expression[],
  opts: AstCastOptions,
  fileName: string,
): IRNode {
  if (effectName === "pipe" && args.length > 0) {
    return {
      kind: "pipe",
      in: inner,
      out: castFromExpression(args[0], opts, fileName),
    };
  }
  if (effectName === "transform") {
    return {
      kind: "transform",
      inner,
      fn: { kind: "function", usage: "transform", mode: "placeholder" },
    };
  }
  if (effectName === "refine" || effectName === "superRefine") {
    return {
      kind: "refine",
      inner,
      fn: { kind: "function", usage: "refine", mode: "placeholder" },
    };
  }
  if (effectName === "preprocess") {
    return {
      kind: "preprocess",
      inner,
      fn: { kind: "function", usage: "preprocess", mode: "placeholder" },
    };
  }
  return inner;
}

// ============================================================
// Constraint collection
// ============================================================

/**
 * Walk the chain tail and build ConstraintNode[] in source order.
 * Returns [] if no constraints present (or if any element is a modifier —
 * modifiers are handled separately).
 */
function collectConstraints(
  tailPath: string[],
  tailArgs: ts.Expression[][],
  target: ConstraintTarget,
): ConstraintNode[] {
  const out: ConstraintNode[] = [];
  for (let i = 0; i < tailPath.length; i++) {
    const name = tailPath[i];
    if (MODIFIERS[name]) {
      // Once we hit a modifier, the rest belongs to modifier collection.
      break;
    }
    const c = tryMakeConstraint(name, tailArgs[i], target);
    if (c) out.push(c);
    // Unknown constraints silently dropped — same behavior as runtime cast.
  }
  return out;
}

function tryMakeConstraint(
  name: string,
  args: ts.Expression[],
  target: ConstraintTarget,
): ConstraintNode | undefined {
  // Validate that the constraint applies to this target.
  if (target === "string" && !STRING_CONSTRAINTS.has(name)) return undefined;
  if (
    (target === "number" || target === "bigint") &&
    !NUMBER_BIGINT_CONSTRAINTS.has(name)
  ) {
    return undefined;
  }
  if (target === "date" && !["min", "max"].includes(name)) return undefined;

  switch (name) {
    case "min":
    case "max": {
      const v = readNumberArg(args[0]);
      if (v === undefined) return undefined;
      return {
        kind: "constraint",
        target,
        name,
        params: {
          value: v.value,
          // inclusive is the second arg ({ message }) — we don't currently
          // extract it from AST. Default undefined means "treat as inclusive"
          // in codegen (matches v3 default).
        },
      };
    }
    case "length":
    case "size": {
      const v = readNumberArg(args[0]);
      if (v === undefined) return undefined;
      return { kind: "constraint", target, name, params: { value: v.value } };
    }
    case "multipleOf": {
      const v = readNumberArg(args[0]);
      if (v === undefined) return undefined;
      return { kind: "constraint", target, name, params: { value: v.value } };
    }
    case "int":
    case "finite":
    case "safe":
    case "positive":
    case "negative":
    case "nonnegative":
    case "nonpositive":
    case "email":
    case "url":
    case "uuid":
    case "cuid":
    case "cuid2":
    case "ulid":
    case "nanoid":
    case "datetime":
    case "ip":
    case "date":
    case "time":
    case "duration":
    case "trim":
    case "toLowerCase":
    case "toUpperCase":
    case "normalize":
      // No-arg constraints — emit as bare call.
      return { kind: "constraint", target, name, params: {} };
    case "regex": {
      const lit = args[0] ? getLiteralValue(args[0]) : undefined;
      if (!lit || "unresolved" in lit || !(lit.value instanceof RegExp)) {
        // Could also be `new RegExp('...')` — not supported in MVP.
        return undefined;
      }
      return {
        kind: "constraint",
        target,
        name,
        params: { regex: lit.value as RegExp },
      };
    }
    case "startsWith":
    case "endsWith":
    case "includes": {
      const v = args[0] ? getLiteralValue(args[0]) : undefined;
      if (!v || "unresolved" in v || typeof v.value !== "string")
        return undefined;
      return {
        kind: "constraint",
        target,
        name,
        params: { value: v.value },
      };
    }
    default:
      return undefined;
  }
}

function readNumberArg(
  arg: ts.Expression | undefined,
): { value: number | bigint } | undefined {
  if (!arg) return undefined;
  const lit = getLiteralValue(arg);
  if ("unresolved" in lit) return undefined;
  if (typeof lit.value !== "number" && typeof lit.value !== "bigint") {
    return undefined;
  }
  return { value: lit.value };
}

// ============================================================
// Modifier collection
// ============================================================

function collectModifiers(
  tailPath: string[],
  tailArgs: ts.Expression[][],
): ModifierNode[] {
  const out: ModifierNode[] = [];
  let collecting = false;
  for (let i = 0; i < tailPath.length; i++) {
    const name = tailPath[i];
    const modifierName = MODIFIERS[name];
    if (!modifierName) {
      if (collecting) break; // modifiers should be at the tail
      continue;
    }
    collecting = true;
    out.push(makeModifierFromAst(modifierName, tailArgs[i]));
  }
  return out;
}

function makeModifierFromAst(
  name: ModifierName,
  args: ts.Expression[],
): ModifierNode {
  const base: ModifierNode = { kind: "modifier", name };
  if (name === "default" || name === "catch" || name === "prefault") {
    const v = args[0] ? getLiteralValue(args[0]) : undefined;
    if (v && !("unresolved" in v)) {
      if (
        typeof v.value === "string" ||
        typeof v.value === "number" ||
        typeof v.value === "boolean" ||
        v.value === null
      ) {
        return { ...base, value: v.value };
      }
    }
    // Function or non-literal — emit placeholder comment.
    return { ...base, placeholder: "/* function */" };
  }
  return base;
}

// ============================================================
// Composite casters
// ============================================================

function castLiteral(args: ts.Expression[][]): IRNode {
  // chain.args for z.literal('a') is [[], [literalExpr]].
  // args[0] is z's empty args; args[1] is the literal call args.
  const callArgs = args[1];
  if (!callArgs || callArgs.length === 0) {
    return { kind: "literal", value: undefined };
  }
  const v = getLiteralValue(callArgs[0]);
  if ("unresolved" in v) {
    return {
      kind: "raw",
      code: "z.any()",
      reason: "literal-unresolved",
    };
  }
  return { kind: "literal", value: v.value };
}

function castEnum(args: ts.Expression[][]): IRNode {
  // z.enum(['a', 'b'])
  const callArgs = args[1];
  if (!callArgs || callArgs.length === 0) {
    return { kind: "enum", variant: "enum", values: [] };
  }
  const arr = callArgs[0];
  if (!ts.isArrayLiteralExpression(arr)) {
    return { kind: "enum", variant: "enum", values: [] };
  }
  const values: string[] = [];
  for (const el of arr.elements) {
    const v = getLiteralValue(el);
    if (!("unresolved" in v) && typeof v.value === "string") {
      values.push(v.value);
    }
  }
  return { kind: "enum", variant: "enum", values };
}

function castNativeEnum(args: ts.Expression[][]): IRNode {
  // z.nativeEnum(SomeEnum) — can't statically resolve enum values without
  // type info. Emit a placeholder native enum.
  void args;
  return {
    kind: "enum",
    variant: "nativeEnum",
    values: [],
    nativeSource: {},
  };
}

function castArrayChain(
  path: string[],
  args: ts.Expression[][],
  opts: AstCastOptions,
  fileName: string,
): IRNode {
  // z.array(E) — args[0][0] is element expression
  if (!args[1] || args[1].length === 0) {
    return {
      kind: "array",
      element: { kind: "primitive", primitive: "any", constraints: [] },
      constraints: [],
    };
  }
  const element = castFromExpression(args[1][0], opts, fileName);

  // Constraints (min/max/length/nonempty) live on the array.
  const constraints = collectCollectionConstraints(
    path.slice(2),
    args.slice(2),
    "array",
  );
  return { kind: "array", element, constraints };
}

function castSetChain(
  path: string[],
  args: ts.Expression[][],
  opts: AstCastOptions,
  fileName: string,
): IRNode {
  if (!args[1] || args[1].length === 0) {
    return {
      kind: "set",
      element: { kind: "primitive", primitive: "any", constraints: [] },
      constraints: [],
    };
  }
  const element = castFromExpression(args[1][0], opts, fileName);
  const constraints = collectCollectionConstraints(
    path.slice(2),
    args.slice(2),
    "set",
  );
  return { kind: "set", element, constraints };
}

function collectCollectionConstraints(
  tailPath: string[],
  tailArgs: ts.Expression[][],
  target: "array" | "set",
): ConstraintNode[] {
  const out: ConstraintNode[] = [];
  for (let i = 0; i < tailPath.length; i++) {
    const name = tailPath[i];
    if (MODIFIERS[name]) break;
    if (!COLLECTION_CONSTRAINTS.has(name)) continue;
    if (name === "nonempty") {
      // z.array().nonempty() is sugar for min(1)
      out.push({
        kind: "constraint",
        target,
        name: "min",
        params: { value: 1 },
      });
      continue;
    }
    const v = readNumberArg(tailArgs[i][0]);
    if (v === undefined) continue;
    out.push({
      kind: "constraint",
      target,
      name: name === "size" ? "size" : name,
      params: { value: v.value },
    });
  }
  return out;
}

function castObjectChain(
  path: string[],
  args: ts.Expression[][],
  opts: AstCastOptions,
  fileName: string,
): IRNode {
  if (!args[1] || args[1].length === 0) {
    return { kind: "object", fields: [], unknownMode: "strip" };
  }
  const objExpr = args[1][0];
  const fields = castObjectFields(objExpr, opts, fileName);

  // Check for tail modifiers (.strict(), .passthrough(), .catchall(T))
  let unknownMode: ObjectUnknownMode = "strip";
  let catchall: IRNode | undefined;
  for (let i = 2; i < path.length; i++) {
    const stepName = path[i];
    if (stepName === "strict") unknownMode = "strict";
    else if (stepName === "passthrough") unknownMode = "passthrough";
    else if (stepName === "catchall" && args[i] && args[i].length > 0) {
      catchall = castFromExpression(args[i][0], opts, fileName);
    }
  }

  const result: IRNode = { kind: "object", fields, unknownMode };
  if (catchall) {
    (result as { catchall?: IRNode }).catchall = catchall;
  }
  return result;
}

function castObjectFields(
  objExpr: ts.Expression,
  opts: AstCastOptions,
  fileName: string,
): ObjectField[] {
  const parsed = parseObjectLiteral(objExpr);
  if (!parsed) return [];

  const fields: ObjectField[] = [];
  for (const f of parsed) {
    if (f.kind === "field") {
      const ir = castFromExpression(f.valueExpr, opts, fileName);
      fields.push({ key: f.key, value: ir });
    } else if (f.kind === "shorthand") {
      // { x } === { x: x } — x is an identifier reference.
      fields.push({
        key: f.key,
        value: {
          kind: "raw",
          code: "z.any()",
          reason: `shorthand-ref:${f.key}`,
        },
      });
    } else if (f.kind === "spread") {
      // ...BaseSchema.shape — delegate to resolver if available.
      const merged = opts.resolver?.resolveSpreadShape(
        f.spreadExpr,
        fileName,
        opts,
      );
      if (merged) {
        fields.push(...merged);
      }
      // If resolver returns nothing, silently skip (field becomes invisible).
      // This matches how runtime cast handles unknown spread today.
    }
  }
  return fields;
}

function castTuple(
  args: ts.Expression[][],
  opts: AstCastOptions,
  fileName: string,
): IRNode {
  // z.tuple([A, B, ...])
  if (!args[1] || args[1].length === 0) {
    return { kind: "tuple", items: [] };
  }
  const arr = args[1][0];
  if (!ts.isArrayLiteralExpression(arr)) {
    return { kind: "tuple", items: [] };
  }
  const items = arr.elements
    .filter((el) => !ts.isSpreadElement(el))
    .map((el) => castFromExpression(el, opts, fileName));
  return { kind: "tuple", items };
}

function castRecord(
  args: ts.Expression[][],
  opts: AstCastOptions,
  fileName: string,
): IRNode {
  // z.record(K, V) or z.record(V) (key defaults to string)
  if (!args[1] || args[1].length === 0) {
    return {
      kind: "record",
      key: { kind: "primitive", primitive: "string", constraints: [] },
      value: { kind: "primitive", primitive: "any", constraints: [] },
    };
  }
  const callArgs = args[1];
  if (callArgs.length === 1) {
    return {
      kind: "record",
      key: { kind: "primitive", primitive: "string", constraints: [] },
      value: castFromExpression(callArgs[0], opts, fileName),
    };
  }
  return {
    kind: "record",
    key: castFromExpression(callArgs[0], opts, fileName),
    value: castFromExpression(callArgs[1], opts, fileName),
  };
}

function castMap(
  args: ts.Expression[][],
  opts: AstCastOptions,
  fileName: string,
): IRNode {
  if (!args[1] || args[1].length < 2) {
    return {
      kind: "map",
      key: { kind: "primitive", primitive: "any", constraints: [] },
      value: { kind: "primitive", primitive: "any", constraints: [] },
    };
  }
  return {
    kind: "map",
    key: castFromExpression(args[1][0], opts, fileName),
    value: castFromExpression(args[1][1], opts, fileName),
  };
}

function castUnion(
  args: ts.Expression[][],
  opts: AstCastOptions,
  fileName: string,
): IRNode {
  // z.union([A, B, C])
  if (!args[1] || args[1].length === 0) {
    return { kind: "union", options: [] };
  }
  const arr = args[1][0];
  if (!ts.isArrayLiteralExpression(arr)) {
    return { kind: "union", options: [] };
  }
  return {
    kind: "union",
    options: arr.elements.map((el) => castFromExpression(el, opts, fileName)),
  };
}

function castDiscriminatedUnion(
  args: ts.Expression[][],
  opts: AstCastOptions,
  fileName: string,
): IRNode {
  // z.discriminatedUnion('key', [A, B])
  if (!args[1] || args[1].length < 2) {
    return { kind: "union", options: [] };
  }
  const discLit = getLiteralValue(args[1][0]);
  const discriminator =
    !("unresolved" in discLit) && typeof discLit.value === "string"
      ? discLit.value
      : undefined;
  const arr = args[1][1];
  if (!ts.isArrayLiteralExpression(arr)) {
    return { kind: "union", options: [], discriminator };
  }
  return {
    kind: "union",
    options: arr.elements.map((el) => castFromExpression(el, opts, fileName)),
    discriminator,
  };
}

function castIntersection(
  args: ts.Expression[][],
  opts: AstCastOptions,
  fileName: string,
): IRNode {
  if (!args[1] || args[1].length < 2) {
    return { kind: "primitive", primitive: "any", constraints: [] };
  }
  return {
    kind: "intersection",
    left: castFromExpression(args[1][0], opts, fileName),
    right: castFromExpression(args[1][1], opts, fileName),
  };
}

function castLazy(
  args: ts.Expression[][],
  opts: AstCastOptions,
  fileName: string,
): IRNode {
  // z.lazy(() => E) — arrow function body is the inner schema.
  if (!args[1] || args[1].length === 0) {
    return { kind: "lazy", placeholder: true };
  }
  const arg = args[1][0];
  const inner = extractLazyInner(arg);
  if (!inner) {
    return { kind: "lazy", placeholder: true };
  }
  const innerIR = castFromExpression(inner, opts, fileName);
  return { kind: "lazy", placeholder: false, inner: innerIR };
}

function extractLazyInner(arg: ts.Expression): ts.Expression | undefined {
  if (ts.isArrowFunction(arg)) {
    if (arg.body && ts.isExpression(arg.body)) {
      return arg.body;
    }
    if (ts.isBlock(arg.body)) {
      // () => { return E; }
      for (const stmt of arg.body.statements) {
        if (ts.isReturnStatement(stmt) && stmt.expression) {
          return stmt.expression;
        }
      }
    }
  }
  if (ts.isFunctionExpression(arg)) {
    if (arg.body && ts.isBlock(arg.body)) {
      for (const stmt of arg.body.statements) {
        if (ts.isReturnStatement(stmt) && stmt.expression) {
          return stmt.expression;
        }
      }
    }
  }
  return undefined;
}

function castPromise(
  args: ts.Expression[][],
  opts: AstCastOptions,
  fileName: string,
): IRNode {
  if (!args[1] || args[1].length === 0) {
    return {
      kind: "promise",
      inner: { kind: "primitive", primitive: "any", constraints: [] },
    };
  }
  return {
    kind: "promise",
    inner: castFromExpression(args[1][0], opts, fileName),
  };
}

function castZodFunction(
  args: ts.Expression[][],
  opts: AstCastOptions,
  fileName: string,
): IRNode {
  // z.function() or z.function(args, returns)
  if (!args[1] || args[1].length === 0) {
    return { kind: "zod-function", args: [] };
  }
  let argsIR: IRNode[] = [];
  let returnsIR: IRNode | undefined;
  const callArgs = args[1];
  if (callArgs[0]) {
    // args is a tuple schema
    const argsIRNode = castFromExpression(callArgs[0], opts, fileName);
    if (argsIRNode.kind === "tuple") {
      argsIR = argsIRNode.items;
    }
  }
  if (callArgs[1]) {
    returnsIR = castFromExpression(callArgs[1], opts, fileName);
  }
  return { kind: "zod-function", args: argsIR, returns: returnsIR };
}

function castPreprocess(
  args: ts.Expression[][],
  opts: AstCastOptions,
  fileName: string,
): IRNode {
  // z.preprocess(fn, E)
  if (!args[1] || args[1].length < 2 || !args[1][1]) {
    return { kind: "primitive", primitive: "any", constraints: [] };
  }
  const inner = castFromExpression(args[1][1], opts, fileName);
  return {
    kind: "preprocess",
    inner,
    fn: makePlaceholderFn("preprocess", args[1][0]),
  };
}

function castStandaloneTransform(
  args: ts.Expression[][],
  opts: AstCastOptions,
  fileName: string,
): IRNode {
  // Standalone z.transform(fn) — v4 form. Rare; we wrap with placeholder.
  void opts;
  void fileName;
  return {
    kind: "raw",
    code: "/* transform */",
    reason: "standalone-transform-without-pipe",
  };
}

function castStandaloneRefine(
  args: ts.Expression[][],
  opts: AstCastOptions,
  fileName: string,
): IRNode {
  void opts;
  void fileName;
  return {
    kind: "raw",
    code: "/* refine */",
    reason: "standalone-refine-without-inner",
  };
}

function castPipe(
  args: ts.Expression[][],
  opts: AstCastOptions,
  fileName: string,
): IRNode {
  // z.pipe(A, B)
  if (!args[1] || args[1].length < 2) {
    return { kind: "primitive", primitive: "any", constraints: [] };
  }
  return {
    kind: "pipe",
    in: castFromExpression(args[1][0], opts, fileName),
    out: castFromExpression(args[1][1], opts, fileName),
  };
}

// ============================================================
// Effect modifiers (chain-level transform/refine)
// ============================================================

// (Not currently invoked from castZodChain because Zod's effect methods are
// always attached to an inner schema: z.string().transform(fn). That case is
// handled in castPrimitiveChain by falling through; but the modifier/modifier
// tail scanner doesn't know about transform/refine. Add an explicit hook:
//
// TODO: extend collectModifiers to recognize transform/refine/preprocess and
// emit TransformNode/RefineNode/PreprocessNode wrapping the inner. For MVP,
// these emit RawNode.

function makePlaceholderFn(
  usage: FunctionUsage,
  fnExpr?: ts.Expression,
): { kind: "function"; usage: FunctionUsage; mode: FunctionMode } {
  // MVP: always placeholder. inline/marked modes are future work.
  void fnExpr;
  return { kind: "function", usage, mode: "placeholder" };
}

// ============================================================
// Wrapper function inlining (single-level)
// ============================================================

/**
 * Try to inline a wrapper function call. E.g.:
 *   const f = () => z.string();
 *   export const S = f();
 *
 * Delegates to extract/inline.ts which finds the function body and returns
 * the inlined return expression. We then cast that recursively.
 */
function tryInlineWrapper(
  expr: ts.CallExpression,
  opts: AstCastOptions,
  fileName: string,
): IRNode | undefined {
  if (!opts.sourceFile) return undefined;
  return tryInlineWrapperImpl(
    expr,
    { sourceFile: opts.sourceFile },
    (returned) => castFromExpression(returned, opts, fileName),
  );
}

// ============================================================
// Helpers for RawNode
// ============================================================

function rawNode(
  expr: ts.Expression,
  opts: AstCastOptions,
  reason: string,
): IRNode {
  if (opts.onUnknown === "throw") {
    throw new Error(`castFromAst: ${reason}`);
  }
  if (opts.onUnknown === "fallback") {
    return { kind: "fallback", reason: "unhandled", detail: reason };
  }
  return {
    kind: "raw",
    code: "z.any()",
    reason,
    original: expr,
  };
}

function rawNodeEmpty(opts: AstCastOptions, reason: string): IRNode {
  if (opts.onUnknown === "throw") {
    throw new Error(`castFromAst: ${reason}`);
  }
  if (opts.onUnknown === "fallback") {
    return { kind: "fallback", reason: "unhandled", detail: reason };
  }
  return { kind: "raw", code: "z.any()", reason };
}

function rawNodeAt(
  chain: FlattenedChain["chain"],
  opts: AstCastOptions,
  reason: string,
): IRNode {
  if (opts.onUnknown === "throw") {
    throw new Error(`castFromAst: ${reason}`);
  }
  if (opts.onUnknown === "fallback") {
    return { kind: "fallback", reason: "unhandled", detail: reason };
  }
  return { kind: "raw", code: "z.any()", reason };
}
