/**
 * Cross-module schema resolver.
 *
 * Used by cast/ast.ts when an expression references a schema defined in
 * another file:
 *
 *   // shared.ts
 *   export const BaseUser = z.object({ id: z.number() });
 *
 *   // schema.ts
 *   import { BaseUser } from './shared';
 *   export const User = z.object({
 *     ...BaseUser.shape,
 *     role: z.enum(['admin', 'user']),
 *   });
 *
 * The resolver reads source files from disk, caches parsed SourceFiles, and
 * returns IR for named exports. Circular imports are detected via a stack
 * and surface as a LazyNode placeholder.
 *
 * Limitations:
 *   - Bare-specifier imports ('zod', 'drizzle-zod', etc.) are not resolved.
 *     Only relative paths ('./x', '../y') are tried.
 *   - .d.ts files are skipped (no executable content).
 *   - Index resolution: tries ./x.ts, ./x.tsx, ./x/index.ts, ./x/index.tsx.
 */

import * as ts from "typescript";
import * as fs from "node:fs";
import * as path from "node:path";
import type { IRNode, ObjectField } from "../ir/nodes.js";
import {
  castFromAst,
  castFromExpressionExported,
  type AstCastOptions,
  type AstResolver,
} from "../cast/ast.js";

export interface ModuleResolverOptions {
  /**
   * Maximum recursion depth when resolving cross-file imports. Default 10.
   * Protects against pathological cycles and explosion.
   */
  maxDepth?: number;
  /**
   * Override file existence check (for testing without touching disk).
   * Should return true if the path resolves to a readable file.
   */
  fileExists?: (path: string) => boolean;
  /**
   * Override file reader (for testing).
   */
  readFile?: (path: string) => string | undefined;
}

const DEFAULT_MAX_DEPTH = 10;

/**
 * Internal sentinel exception thrown when a circular import is detected
 * deep in the resolution tree. Caught at the outermost resolveSchema call
 * so the marker propagates without fragile instance-state.
 */
class CircularResolutionError extends Error {
  constructor(public readonly cacheKey: string) {
    super(`circular resolution: ${cacheKey}`);
    this.name = "CircularResolutionError";
  }
}

export class ModuleResolver {
  private sourceFileCache = new Map<string, ts.SourceFile>();
  private irCache = new Map<string, IRNode>();
  private stack = new Set<string>();
  private readonly rootDir: string;
  private readonly maxDepth: number;
  private readonly fileExists: (path: string) => boolean;
  private readonly readFile: (path: string) => string | undefined;

  constructor(rootDir: string, opts: ModuleResolverOptions = {}) {
    this.rootDir = rootDir;
    this.maxDepth = opts.maxDepth ?? DEFAULT_MAX_DEPTH;
    this.fileExists = opts.fileExists ?? ((p) => fs.existsSync(p));
    this.readFile =
      opts.readFile ??
      ((p) => {
        try {
          return fs.readFileSync(p, "utf-8");
        } catch {
          return undefined;
        }
      });
  }

  /**
   * Resolve `import { exportName } from 'specifier'` (where the import is
   * in `fromFile`) into an IR node.
   *
   * Returns:
   *   - IRNode on successful resolution
   *   - { kind: 'circular' } when a cycle is detected
   *   - undefined when not resolvable (external module, missing file,
   *     unknown export)
   */
  resolveSchema(
    specifier: string,
    exportName: string,
    fromFile: string,
    baseOpts: AstCastOptions = {},
  ): IRNode | { kind: "circular" } | undefined {
    // Only relative specifiers are resolved.
    if (!isRelativeSpecifier(specifier)) return undefined;

    const resolvedPath = this.resolveModulePath(specifier, fromFile);
    if (!resolvedPath) return undefined;

    const cacheKey = `${resolvedPath}::${exportName}`;
    if (this.irCache.has(cacheKey)) {
      return this.irCache.get(cacheKey)!;
    }
    if (this.stack.has(cacheKey)) {
      return { kind: "circular" };
    }
    if (this.stack.size >= this.maxDepth) {
      return undefined;
    }

    this.stack.add(cacheKey);
    try {
      const ir = this.castFromModule(resolvedPath, exportName, baseOpts);
      if (ir) {
        this.irCache.set(cacheKey, ir);
      }
      return ir;
    } catch (e) {
      if (e instanceof CircularResolutionError) {
        // Surface the circular marker only if it matches this stack frame —
        // inner frames re-throw to let the outermost caller see it.
        if (e.cacheKey === cacheKey) return { kind: "circular" };
        throw e;
      }
      throw e;
    } finally {
      this.stack.delete(cacheKey);
    }
  }

  /**
   * Resolve a spread of `.shape` like `...BaseSchema.shape`.
   *
   * `baseExpr` is the PropertyAccessExpression `BaseSchema.shape` — we
   * extract the identifier `BaseSchema`, find its IR (via cross-file
   * resolution if imported), and if it's an ObjectNode return its fields.
   *
   * Returns undefined when the spread can't be resolved or the underlying
   * schema isn't an object.
   */
  resolveSpreadShape(
    baseExpr: ts.Expression,
    fromFile: string,
    baseOpts: AstCastOptions = {},
  ): ObjectField[] | undefined {
    // Expect baseExpr = Identifier.shape (PropertyAccessExpression)
    if (!ts.isPropertyAccessExpression(baseExpr)) return undefined;
    if (baseExpr.name.text !== "shape") return undefined;
    const baseId = baseExpr.expression;
    if (!ts.isIdentifier(baseId)) return undefined;

    const resolved = this.lookupIdentifierIR(baseId.text, fromFile, baseOpts);
    if (!resolved) return undefined;

    if (resolved.kind === "object") {
      return resolved.fields;
    }
    return undefined;
  }

  /**
   * Resolve a bare identifier reference like `UserSchema` — used when the
   * cast layer encounters an Identifier node (not a CallExpression).
   *
   * Looks up the identifier in the current file's local declarations first,
   * then in cross-file imports.
   */
  resolveIdentifier(
    name: string,
    fromFile: string,
    fromSource: ts.SourceFile,
    baseOpts: AstCastOptions = {},
  ): IRNode | undefined {
    // 1. Local lookup: is there a top-level `const name = ...` in this file?
    const localExpr = findLocalDefinition(fromSource, name);
    if (localExpr) {
      const optsWithSf: AstCastOptions = {
        ...baseOpts,
        sourceFile: fromSource,
        fileName: fromFile,
      };
      return castFromExpressionExported(localExpr, optsWithSf);
    }

    // 2. Cross-file: find an `import { name } from './y'` and resolve.
    const importInfo = findImportByName(fromSource, name);
    if (!importInfo) return undefined;
    const r = this.resolveSchema(
      importInfo.specifier,
      importInfo.localName ?? name,
      fromFile,
      baseOpts,
    );
    if (!r) return undefined;
    // Circular cycle: re-throw so the outermost resolveSchema surfaces it.
    if ((r as { kind: string }).kind === "circular") {
      throw new CircularResolutionError(
        `${this.resolveModulePath(importInfo.specifier, fromFile)}::${importInfo.localName ?? name}`,
      );
    }
    return r as IRNode;
  }

  private lookupIdentifierIR(
    name: string,
    fromFile: string,
    baseOpts: AstCastOptions,
  ): IRNode | undefined {
    const fromSource = this.readSource(fromFile);
    if (!fromSource) return undefined;

    // Local?
    const localExpr = findLocalDefinition(fromSource, name);
    if (localExpr) {
      return castFromExpressionExported(localExpr, {
        ...baseOpts,
        sourceFile: fromSource,
        fileName: fromFile,
      });
    }

    // Imported?
    const importInfo = findImportByName(fromSource, name);
    if (!importInfo) return undefined;
    const r = this.resolveSchema(
      importInfo.specifier,
      importInfo.localName ?? name,
      fromFile,
      baseOpts,
    );
    if (!r) return undefined;
    if ((r as { kind: string }).kind === "circular") {
      throw new CircularResolutionError(
        `${this.resolveModulePath(importInfo.specifier, fromFile)}::${importInfo.localName ?? name}`,
      );
    }
    return r as IRNode;
  }

  private castFromModule(
    modulePath: string,
    exportName: string,
    baseOpts: AstCastOptions,
  ): IRNode | undefined {
    const src = this.readSource(modulePath);
    if (!src) return undefined;

    return castFromAst(src.text, exportName, {
      ...baseOpts,
      fileName: modulePath,
      resolver: this,
    });
  }

  private readSource(filePath: string): ts.SourceFile | undefined {
    const normalized = path.resolve(filePath);
    const cached = this.sourceFileCache.get(normalized);
    if (cached) return cached;

    const text = this.readFile(normalized);
    if (text === undefined) return undefined;

    const sf = ts.createSourceFile(
      normalized,
      text,
      ts.ScriptTarget.ESNext,
      /* setParentNodes */ true,
    );
    this.sourceFileCache.set(normalized, sf);
    return sf;
  }

  private resolveModulePath(
    specifier: string,
    fromFile: string,
  ): string | undefined {
    const fromDir = path.dirname(path.resolve(fromFile));
    const candidates = candidatePaths(specifier);
    for (const c of candidates) {
      const full = path.join(fromDir, c);
      if (this.fileExists(full)) return full;
    }
    return undefined;
  }
}

/**
 * Build the AstResolver-compatible view of a ModuleResolver instance.
 * Used by cast/ast.ts callers who want cross-file support.
 */
export function makeAstResolver(resolver: ModuleResolver): AstResolver {
  return {
    resolveSchema: (specifier, exportName, fromFile, opts) =>
      resolver.resolveSchema(specifier, exportName, fromFile, opts),
    resolveSpreadShape: (baseExpr, fromFile, opts) =>
      resolver.resolveSpreadShape(baseExpr, fromFile, opts),
    resolveIdentifier: (name, fromFile, fromSource, opts) =>
      resolver.resolveIdentifier(name, fromFile, fromSource, opts),
  };
}

// ============================================================
// Module resolution helpers
// ============================================================

function isRelativeSpecifier(spec: string): boolean {
  return spec.startsWith("./") || spec.startsWith("../");
}

function candidatePaths(specifier: string): string[] {
  // Drop trailing extension if present.
  const base = specifier.replace(/\.(ts|tsx|d\.ts|js|jsx|mjs|cjs)$/, "");
  return [
    `${base}.ts`,
    `${base}.tsx`,
    `${base}/index.ts`,
    `${base}/index.tsx`,
    // Allow .d.ts for type-only schema files (rare but possible).
    `${base}.d.ts`,
  ];
}

function findLocalDefinition(
  sf: ts.SourceFile,
  name: string,
): ts.Expression | undefined {
  for (const stmt of sf.statements) {
    if (!ts.isVariableStatement(stmt)) continue;
    for (const decl of stmt.declarationList.declarations) {
      if (ts.isIdentifier(decl.name) && decl.name.text === name) {
        return decl.initializer;
      }
    }
  }
  return undefined;
}

interface ImportInfo {
  /** Module specifier (e.g. './shared'). */
  specifier: string;
  /** Local name in this file (e.g. for `import { z as Z }`, name='z', localName='Z'). */
  propertyName?: string;
  localName?: string;
}

function findImportByName(
  sf: ts.SourceFile,
  name: string,
): ImportInfo | undefined {
  for (const stmt of sf.statements) {
    if (!ts.isImportDeclaration(stmt)) continue;
    const specifier = (stmt.moduleSpecifier as ts.StringLiteral).text;
    const clause = stmt.importClause;
    if (!clause) continue;

    // Default import: import X from './y' → matches if name === 'default'
    if (clause.name && clause.name.text === name) {
      return { specifier, localName: "default" };
    }

    // Named imports
    if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) {
      for (const el of clause.namedBindings.elements) {
        const importedName = el.propertyName?.text ?? el.name.text;
        if (el.name.text === name || importedName === name) {
          return {
            specifier,
            propertyName: el.propertyName?.text,
            localName: el.name.text,
          };
        }
      }
    }

    // Namespace import: import * as N from './y' → only matches if name is N.X
    // (handled by caller; here we only match exact name).
    if (
      clause.namedBindings &&
      ts.isNamespaceImport(clause.namedBindings) &&
      clause.namedBindings.name.text === name
    ) {
      return { specifier, localName: clause.namedBindings.name.text };
    }
  }
  return undefined;
}
