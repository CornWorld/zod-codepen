/**
 * Scan a TypeScript source file's top-level statements and list exports.
 *
 * Used by castAllFromAst and the vite-plugin's static-extraction entry to
 * discover what `export const X = z.object(...)` declarations exist in a
 * file without executing it.
 *
 * The detection is purely syntactic — no type info, no semantic analysis.
 * `isSchemaLike` is a heuristic: the initializer looks like `z.X(...)` or
 * a chain rooted at a recognized Zod namespace identifier.
 */

import * as ts from "typescript";
import { getPropertyChain } from "../cast/ast-utils.js";

export interface ExtractedExport {
  name: string;
  isTypeOnly: boolean;
  /** Heuristic: does this export look like a Zod schema definition? */
  isSchemaLike: boolean;
  /** The initializer expression, if statically extractable. */
  expression?: ts.Expression;
  /** [start, end] offsets in the source. */
  range: [number, number];
  /**
   * For exports of the form `export { X }` (no initializer in this file),
   * the local name being re-exported. Used to look up the var statement.
   */
  localName?: string;
  /** Re-export from another module: `export { X } from './y'`. */
  reExportedFrom?: string;
}

export interface ExtractOptions {
  /**
   * Identifiers treated as the Zod namespace root. Defaults to ['z'].
   * Useful when the source uses `import { z as Z } from 'zod'`.
   */
  zodRoots?: string[];
}

export function extractSchemaExports(
  source: string,
  opts: ExtractOptions = {},
): ExtractedExport[] {
  const sf = ts.createSourceFile(
    "input.ts",
    source,
    ts.ScriptTarget.ESNext,
    /* setParentNodes */ true,
  );
  const zodRoots = new Set(opts.zodRoots ?? ["z"]);
  const out: ExtractedExport[] = [];

  for (const stmt of sf.statements) {
    collectFromStatement(stmt, out, zodRoots);
  }

  return out;
}

function collectFromStatement(
  stmt: ts.Statement,
  out: ExtractedExport[],
  zodRoots: Set<string>,
): void {
  // export const X = ...; export let X = ...; export var X = ...
  if (ts.isVariableStatement(stmt)) {
    if (!hasExportModifier(stmt)) return;
    for (const decl of stmt.declarationList.declarations) {
      if (!ts.isIdentifier(decl.name)) continue;
      const initializer = decl.initializer;
      const isTypeOnly = false;
      const isSchemaLike = initializer
        ? isSchemaLikeExpression(initializer, zodRoots)
        : false;
      out.push({
        name: decl.name.text,
        isTypeOnly,
        isSchemaLike,
        expression: initializer,
        range: [decl.getStart(), decl.getEnd()],
      });
    }
    return;
  }

  // export function f() {} / export function* f() {}
  if (ts.isFunctionDeclaration(stmt) && hasExportModifier(stmt) && stmt.name) {
    out.push({
      name: stmt.name.text,
      isTypeOnly: false,
      // Functions aren't schemas (we don't inline them at extract level).
      isSchemaLike: false,
      expression: undefined,
      range: [stmt.getStart(), stmt.getEnd()],
    });
    return;
  }

  // export class C {}
  if (ts.isClassDeclaration(stmt) && hasExportModifier(stmt) && stmt.name) {
    out.push({
      name: stmt.name.text,
      isTypeOnly: false,
      isSchemaLike: false,
      expression: undefined,
      range: [stmt.getStart(), stmt.getEnd()],
    });
    return;
  }

  // export interface I {} / export type T = ...
  if (
    (ts.isInterfaceDeclaration(stmt) || ts.isTypeAliasDeclaration(stmt)) &&
    hasExportModifier(stmt) &&
    stmt.name
  ) {
    out.push({
      name: stmt.name.text,
      isTypeOnly: true,
      isSchemaLike: false,
      expression: undefined,
      range: [stmt.getStart(), stmt.getEnd()],
    });
    return;
  }

  // export { A, B }; export { X } from './y'
  if (ts.isExportDeclaration(stmt)) {
    const isTypeOnly = stmt.isTypeOnly ?? false;
    if (stmt.exportClause && ts.isNamedExports(stmt.exportClause)) {
      for (const el of stmt.exportClause.elements) {
        const name = el.name.text;
        const localName = el.propertyName?.text ?? name;
        out.push({
          name,
          isTypeOnly,
          // We can't tell without resolving — assume not schema-like until
          // castFromAst resolves it. The vite-plugin's filter will catch it.
          isSchemaLike: false,
          expression: undefined,
          localName,
          reExportedFrom: stmt.moduleSpecifier
            ? (stmt.moduleSpecifier as ts.StringLiteral).text
            : undefined,
          range: [el.getStart(), el.getEnd()],
        });
      }
    }
    // export * from './y' — skip; we don't enumerate re-exports.
    return;
  }

  // export default X
  if (ts.isExportAssignment(stmt)) {
    out.push({
      name: "default",
      isTypeOnly: false,
      isSchemaLike: isSchemaLikeExpression(stmt.expression, zodRoots),
      expression:
        ts.isIdentifier(stmt.expression) || ts.isCallExpression(stmt.expression)
          ? stmt.expression
          : undefined,
      range: [stmt.getStart(), stmt.getEnd()],
    });
    return;
  }
}

function hasExportModifier(stmt: ts.Statement): boolean {
  const modifiers = (stmt as ts.Statement & { modifiers?: ts.ModifierLike[] })
    .modifiers;
  if (!modifiers) return false;
  return modifiers.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
}

/**
 * Heuristic: is this expression something we can cast via castFromCallExpression?
 *
 * True for:
 *   - Direct `z.X(...)` calls (chain root is z or an aliased zod root)
 *   - Wrapper function calls `f()` — we can't tell without inlining, but
 *     we conservatively return false; castFromExpression will try inlining.
 *
 * False for everything else (literals, identifiers, binary expressions).
 */
function isSchemaLikeExpression(
  expr: ts.Expression,
  zodRoots: Set<string>,
): boolean {
  if (!ts.isCallExpression(expr)) return false;
  const chain = getPropertyChain(expr);
  if (!chain) return false;
  return zodRoots.has(chain.chain.path[0]);
}

/**
 * Collect import aliases from a source file: which identifiers refer to the
 * Zod namespace?
 *
 * Recognizes:
 *   - `import { z } from 'zod'` → zodRoots = ['z']
 *   - `import { z as Z } from 'zod'` → zodRoots = ['Z']
 *   - `import * as z from 'zod'` → zodRoots = ['z']
 *
 * Returns the set of local names that should be treated as Zod roots.
 * The caller passes these into ExtractOptions.zodRoots.
 */
export function collectZodAliases(source: string): Set<string> {
  const sf = ts.createSourceFile(
    "input.ts",
    source,
    ts.ScriptTarget.ESNext,
    /* setParentNodes */ false,
  );
  const aliases = new Set<string>(["z"]); // Always include default 'z'

  for (const stmt of sf.statements) {
    if (!ts.isImportDeclaration(stmt)) continue;
    const specifier = (stmt.moduleSpecifier as ts.StringLiteral).text;
    // Recognize any module whose name starts with 'zod' — covers
    // 'zod', 'zod/v4', 'zod/v4/mini', 'zod/mini', etc.
    if (!specifier.startsWith("zod")) continue;

    const clause = stmt.importClause;
    if (!clause) continue;

    // Default import: import z from 'zod'
    if (clause.name) {
      aliases.add(clause.name.text);
      continue;
    }

    // Named imports: import { z, z as Z } from 'zod'
    if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) {
      for (const el of clause.namedBindings.elements) {
        if (el.propertyName?.text === "z" || el.name.text === "z") {
          aliases.add(el.name.text);
        }
      }
      continue;
    }

    // Namespace import: import * as z from 'zod'
    if (clause.namedBindings && ts.isNamespaceImport(clause.namedBindings)) {
      aliases.add(clause.namedBindings.name.text);
    }
  }

  return aliases;
}
