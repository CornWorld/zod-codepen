/**
 * Low-level TypeScript AST utilities for static schema extraction.
 *
 * The AST path (castFromAst) uses these helpers to walk CallExpression nodes
 * without ever executing source code. Everything here is pure data extraction:
 * no semantic analysis, no type checking, no symbol resolution.
 *
 * Key concept: a Zod chain like `z.string().email().min(5)` is a nested
 * CallExpression tree where the outermost call is `.min(5)`. We flatten this
 * into a sequential list (path + args) so castFromCallExpression can dispatch
 * on the head and apply modifiers/constraints in source order.
 */

import * as ts from "typescript";

/**
 * A flattened view of a method chain.
 *
 * For `z.string().email().min(5)`:
 *   path = ['z', 'string', 'email', 'min']
 *   args = [[], [], [], [5]]
 *
 * The first entry is the root identifier; subsequent entries are property
 * accesses on the previous result. `args[i]` corresponds to `path[i]` (the
 * arguments passed when that step was called, or [] for non-call steps like
 * the root `z`).
 *
 * For a non-call expression like a bare identifier `z`, returns a single
 * entry with empty args.
 */
export interface PropertyChain {
  path: string[];
  args: ts.Expression[][];
}

/**
 * Result of flattening a chain. Callers usually want `chain`, but the
 * original head expression is kept for fallback dispatching when the chain
 * doesn't start with a known Zod root.
 */
export interface FlattenedChain {
  chain: PropertyChain;
  /** The outermost CallExpression (last in the chain). Useful for diagnostics. */
  outerCall: ts.CallExpression | undefined;
}

/**
 * Flatten a possibly-nested CallExpression/PropertyAccessExpression chain
 * into a sequential list.
 *
 * Returns undefined if the node is not an expression that participates in a
 * method chain (e.g. a BinaryExpression, ConditionalExpression, etc.). For
 * bare identifiers or property accesses without calls, returns a chain with
 * a single entry and empty args.
 */
export function getPropertyChain(
  node: ts.Expression,
): FlattenedChain | undefined {
  const path: string[] = [];
  const args: ts.Expression[][] = [];

  // Walk from outer to inner.
  let current: ts.Expression = node;
  const outerCalls: ts.CallExpression[] = [];

  while (true) {
    if (ts.isCallExpression(current)) {
      outerCalls.push(current);
      // Record args at this position; we'll fill the path entry below.
      // Push a marker first, then patch after we descend (since the path
      // entry corresponds to the property name being called, not the call
      // itself). The very first iteration (root identifier) has no args.
      args.unshift([...current.arguments]);
      current = current.expression;
      continue;
    }

    if (ts.isPropertyAccessExpression(current)) {
      path.unshift(current.name.text);
      // No args at this position by default; if a later iteration finds a
      // CallExpression, the unshift above will replace this. But if this
      // property is never called (e.g. `BaseSchema.shape`), we need an
      // empty args slot.
      // Patch: only add empty args if the previous unshift didn't happen.
      // We track this by checking whether args.length < path.length after
      // the unshift.
      if (args.length < path.length) {
        args.unshift([]);
      }
      current = current.expression;
      continue;
    }

    if (ts.isIdentifier(current)) {
      path.unshift(current.text);
      if (args.length < path.length) {
        args.unshift([]);
      }
      break;
    }

    // Anything else (ElementAccessExpression, BinaryExpression, ...) — bail.
    // The caller can still inspect the original expression directly.
    return undefined;
  }

  // args[i] should align with path[i]. After the loop above, args.length may
  // be off by one for chains ending in a property access (since we add empty
  // args lazily). Realign.
  while (args.length < path.length) {
    args.push([]);
  }
  while (args.length > path.length) {
    args.pop();
  }

  return {
    chain: { path, args },
    outerCall: outerCalls[outerCalls.length - 1],
  };
}

/**
 * Sentinel returned by getLiteralValue when the node isn't a recognizable
 * literal. The `unresolved` flag lets callers distinguish "literal null"
 * (returns { value: null }) from "couldn't tell" (returns { unresolved }).
 */
export const UNRESOLVED = Symbol("unresolved");

export type LiteralValue =
  | { value: unknown }
  | { unresolved: true; reason: string };

/**
 * Extract a literal value from an Expression. Handles the common TypeScript
 * literal node kinds plus a few composite forms.
 *
 * Returns { unresolved } for anything that isn't statically a literal. This
 * is intentionally narrow — castFromCallExpression falls back to RawNode for
 * unresolved literals (e.g. an enum value computed from a function call).
 */
export function getLiteralValue(node: ts.Expression): LiteralValue {
  switch (node.kind) {
    case ts.SyntaxKind.StringLiteral:
      return { value: (node as ts.StringLiteral).text };
    case ts.SyntaxKind.NumericLiteral:
      return { value: Number((node as ts.NumericLiteral).text) };
    case ts.SyntaxKind.TrueKeyword:
      return { value: true };
    case ts.SyntaxKind.FalseKeyword:
      return { value: false };
    case ts.SyntaxKind.NullKeyword:
      return { value: null };
    case ts.SyntaxKind.UndefinedKeyword:
      return { value: undefined };
    case ts.SyntaxKind.BigIntLiteral:
      return { value: parseBigIntLiteral(node as ts.BigIntLiteral) };
    case ts.SyntaxKind.RegularExpressionLiteral:
      return { value: parseRegexLiteral((node as ts.Identifier).text) };
    case ts.SyntaxKind.NoSubstitutionTemplateLiteral:
      return { value: (node as ts.NoSubstitutionTemplateLiteral).text };
    case ts.SyntaxKind.PrefixUnaryExpression: {
      const v = tryPrefixUnary(node as ts.PrefixUnaryExpression);
      return v === undefined
        ? { unresolved: true, reason: "unsupported-prefix-unary" }
        : { value: v };
    }
    case ts.SyntaxKind.ArrayLiteralExpression:
      return parseArrayLiteral(node as ts.ArrayLiteralExpression);
    case ts.SyntaxKind.ObjectLiteralExpression:
      return parseObjectLiteralValue(node as ts.ObjectLiteralExpression);
    case ts.SyntaxKind.Identifier: {
      // `undefined` parses as Identifier (not UndefinedKeyword) when it
      // appears in expression position outside type context.
      if ((node as ts.Identifier).text === "undefined") {
        return { value: undefined };
      }
      return { unresolved: true, reason: "identifier-not-literal" };
    }
    default:
      return { unresolved: true, reason: `kind-${ts.SyntaxKind[node.kind]}` };
  }
}

function parseBigIntLiteral(node: ts.BigIntLiteral): bigint | undefined {
  // Text includes the trailing 'n', e.g. "123n". Strip it.
  const text = node.text.replace(/n$/, "");
  try {
    return BigInt(text);
  } catch {
    return undefined;
  }
}

function parseRegexLiteral(text: string): RegExp | undefined {
  // AST: /pattern/flags — the literal text already contains both.
  try {
    const lastSlash = text.lastIndexOf("/");
    if (lastSlash <= 0) return undefined;
    const pattern = text.slice(1, lastSlash);
    const flags = text.slice(lastSlash + 1);
    return new RegExp(pattern, flags);
  } catch {
    return undefined;
  }
}

function tryPrefixUnary(node: ts.PrefixUnaryExpression): number | undefined {
  if (node.operator === ts.SyntaxKind.MinusToken && node.operand) {
    const inner = getLiteralValue(node.operand);
    if ("value" in inner && typeof inner.value === "number") {
      return -inner.value;
    }
  }
  if (node.operator === ts.SyntaxKind.PlusToken && node.operand) {
    const inner = getLiteralValue(node.operand);
    if ("value" in inner && typeof inner.value === "number") {
      return inner.value;
    }
  }
  return undefined;
}

function parseArrayLiteral(node: ts.ArrayLiteralExpression): LiteralValue {
  const out: unknown[] = [];
  for (const el of node.elements) {
    if (ts.isSpreadElement(el)) {
      return { unresolved: true, reason: "spread-in-array-literal" };
    }
    const v = getLiteralValue(el);
    if ("unresolved" in v) return v;
    out.push(v.value);
  }
  return { value: out };
}

function parseObjectLiteralValue(
  node: ts.ObjectLiteralExpression,
): LiteralValue {
  const out: Record<string, unknown> = {};
  for (const prop of node.properties) {
    if (ts.isPropertyAssignment(prop)) {
      const key = readPropertyName(prop.name);
      if (key === undefined) {
        return { unresolved: true, reason: "computed-property-key" };
      }
      const v = getLiteralValue(prop.initializer);
      if ("unresolved" in v) return v;
      out[key] = v.value;
    } else if (ts.isShorthandPropertyAssignment(prop)) {
      return { unresolved: true, reason: "shorthand-property" };
    } else if (ts.isSpreadAssignment(prop)) {
      return { unresolved: true, reason: "spread-in-object-literal" };
    } else {
      return {
        unresolved: true,
        reason: `object-property-kind-${ts.SyntaxKind[prop.kind]}`,
      };
    }
  }
  return { value: out };
}

function readPropertyName(name: ts.PropertyName): string | undefined {
  if (ts.isIdentifier(name)) return name.text;
  if (ts.isStringLiteral(name)) return name.text;
  if (ts.isNumericLiteral(name)) return name.text;
  if (ts.isComputedPropertyName(name)) {
    const v = getLiteralValue(name.expression);
    if ("value" in v && typeof v.value === "string") return v.value;
    return undefined;
  }
  return undefined;
}

/**
 * A single field in an object literal: either a normal `key: valueExpr`
 * pair, a shorthand `{x}` (resolved to identifier), or a spread `...expr`.
 *
 * For spreads, `spreadExpr` carries the spread argument. The cast layer
 * decides what to do with it (typically delegates to ModuleResolver).
 */
export type ObjectFieldInfo =
  | { kind: "field"; key: string; valueExpr: ts.Expression }
  | { kind: "shorthand"; key: string; refExpr: ts.Identifier }
  | { kind: "spread"; spreadExpr: ts.Expression };

/**
 * Parse an ObjectLiteralExpression into a list of field infos. Returns
 * undefined if the node is not an object literal.
 */
export function parseObjectLiteral(
  node: ts.Expression,
): ObjectFieldInfo[] | undefined {
  if (!ts.isObjectLiteralExpression(node)) return undefined;

  const fields: ObjectFieldInfo[] = [];
  for (const prop of node.properties) {
    if (ts.isPropertyAssignment(prop)) {
      const key = readPropertyName(prop.name);
      if (key === undefined) {
        // Computed key we can't resolve — skip. Caller can detect by
        // length mismatch.
        continue;
      }
      fields.push({ kind: "field", key, valueExpr: prop.initializer });
    } else if (ts.isShorthandPropertyAssignment(prop)) {
      fields.push({
        kind: "shorthand",
        key: prop.name.text,
        refExpr: prop.name,
      });
    } else if (ts.isSpreadAssignment(prop)) {
      fields.push({ kind: "spread", spreadExpr: prop.expression });
    }
    // MethodDeclaration / GetAccessor / SetAccessor — skip silently.
  }
  return fields;
}

/**
 * Detect a spread element at expression position (typically inside an
 * ArrayLiteralExpression). Returns the spread argument if so.
 */
export function getSpreadArgument(
  node: ts.Expression,
): ts.Expression | undefined {
  if (ts.isSpreadElement(node)) return node.expression;
  return undefined;
}
