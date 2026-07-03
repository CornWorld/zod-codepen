/**
 * Inline wrapper function calls.
 *
 * Source pattern:
 *   const makeSchema = () => z.string().email();
 *   export const UserEmail = makeSchema();
 *
 * Without this helper, `makeSchema()` parses as a CallExpression whose root
 * identifier is `makeSchema` — castFromExpression would emit a RawNode. With
 * it, we look up `makeSchema` in the source file, find its arrow/function
 * body, and cast the returned expression instead.
 *
 * Limitations (intentional for MVP):
 *   - Single-level inlining only (no recursive inlining of nested wrappers).
 *   - The wrapper must be defined in the same file (no cross-module resolution).
 *   - Function parameters are ignored (treated as opaque).
 *   - Only arrow functions and `function f() { return X; }` forms.
 *
 * If a wrapper can't be resolved, returns undefined — the caller falls back
 * to RawNode handling.
 */

import * as ts from "typescript";
import type { IRNode } from "../ir/nodes.js";

export interface InlineOptions {
  /**
   * The SourceFile that contains the CallExpression. The wrapper must be
   * defined as a top-level statement in this file.
   */
  sourceFile: ts.SourceFile;
}

export interface InlineResult {
  /** The inlined IR. */
  ir: IRNode;
}

/**
 * Try to inline a CallExpression that wraps a locally-defined function.
 *
 * Returns the inlined IR if successful, or undefined if the call doesn't
 * match the inlining pattern (e.g. callee is a Zod method, or function
 * body isn't a recognizable return).
 *
 * The actual IR construction is delegated to the caller via `castReturned`
 * — this keeps inline.ts free of cast-layer dependencies.
 */
export function tryInlineWrapper<T>(
  expr: ts.CallExpression,
  opts: InlineOptions,
  castReturned: (returnedExpr: ts.Expression) => T,
): T | undefined {
  const callee = expr.expression;
  if (!ts.isIdentifier(callee)) return undefined;

  const wrapperName = callee.text;
  const body = findFunctionBody(wrapperName, opts.sourceFile);
  if (!body) return undefined;

  const returned = extractReturnedExpression(body);
  if (!returned) return undefined;

  return castReturned(returned);
}

function findFunctionBody(
  name: string,
  sf: ts.SourceFile,
): ts.Block | ts.Expression | undefined {
  for (const stmt of sf.statements) {
    if (ts.isVariableStatement(stmt)) {
      for (const decl of stmt.declarationList.declarations) {
        if (ts.isIdentifier(decl.name) && decl.name.text === name) {
          const init = decl.initializer;
          if (!init) continue;
          // const f = () => E    (arrow with expression body)
          // const f = () => { return E; }
          // const f = function () { ... }
          if (ts.isArrowFunction(init) || ts.isFunctionExpression(init)) {
            return init.body;
          }
        }
      }
    }
    if (ts.isFunctionDeclaration(stmt) && stmt.name?.text === name) {
      return stmt.body;
    }
  }
  return undefined;
}

function extractReturnedExpression(
  body: ts.Block | ts.Expression,
): ts.Expression | undefined {
  if (ts.isExpression(body)) return body;
  // Block — find the first return statement with an expression.
  for (const stmt of body.statements) {
    if (ts.isReturnStatement(stmt) && stmt.expression) {
      return stmt.expression;
    }
  }
  return undefined;
}
