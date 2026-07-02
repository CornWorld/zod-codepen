/**
 * Serializer shell.
 *
 * The runtime path is: Zod schema -> IR (via cast/) -> code string
 * (via ir/printer/codegen). This file is intentionally a thin shell
 * that exposes the public `createSerializer()` API and routes input
 * through cast + codegen.
 *
 * Custom handlers registered via `registerHandler()` still take
 * precedence over the IR path: they receive the schema first and may
 * return a code string. If they return undefined, the IR path runs.
 *
 * Why this is no longer 1200+ lines: the per-type serialization logic
 * moved to ir/printer/codegen.ts (renders IR nodes) and cast/runtime.ts
 * (turns Zod schemas into IR nodes). Version normalization lives in
 * cast/version.ts.
 */

import type {
  ZodAdapter,
  SerializeOptions,
  SerializerContext,
  SchemaHandler,
} from "./types.js";
import { defaultOptions } from "./types.js";
import { castFromZod } from "./cast/runtime.js";
import { codegen, type CodegenOptions } from "./ir/printer/codegen.js";

/**
 * Built-in handlers, retained as an empty Map for backward source
 * compatibility. Previously this was a populated Map exported alongside
 * createSerializer; downstream packages referenced it for type
 * introspection. All real logic now lives in cast/ and ir/.
 *
 * @deprecated will be removed in a future major version
 */
export const builtinHandlers: Map<string, SchemaHandler> = new Map();

/**
 * Build codegen options from a fully-resolved SerializeOptions and the
 * caller's current indent level. The indentLevel is threaded through
 * so multi-line nodes (object, union, tuple) know how far to pad.
 */
function buildCodegenOptions(
  opts: Required<SerializeOptions>,
  indentLevel: number,
): CodegenOptions {
  return {
    indent: opts.indent,
    indentLevel,
    format: opts.format,
    optimizations: {
      semanticMethods: opts.optimizations?.semanticMethods !== false,
      scientificNotation: opts.optimizations?.scientificNotation !== false,
    },
  };
}

/**
 * Create a serializer bound to a specific Zod adapter (v3 or v4).
 *
 * The returned object's `serialize(schema, options)` produces TS source
 * code that, when evaluated with `z` in scope, reconstructs a schema
 * with the same structure. Output stability across zod versions is a
 * hard requirement — changes to output for any given schema must be
 * intentional and tested.
 */
export function createSerializer(adapter: ZodAdapter) {
  // Custom handlers registered by the user. These take precedence over
  // the IR path so existing extensions keep working.
  const customHandlers = new Map<string, SchemaHandler>();

  function serialize(schema: unknown, options: SerializeOptions = {}): string {
    const opts: Required<SerializeOptions> = {
      ...defaultOptions,
      ...options,
    };

    function serializeInternal(
      s: unknown,
      indentLevel: number = opts.indentLevel,
    ): string {
      if (!adapter.isZodSchema(s)) {
        return `/* not a zod schema: ${typeof s} */`;
      }

      const type = adapter.getType(s);
      if (!type) {
        return "z.any() /* unknown type */";
      }

      // 1. Custom handler (user-registered). Takes precedence to keep
      //    backward compatibility for extensions.
      const custom = customHandlers.get(type);
      if (custom) {
        const ctx: SerializerContext = {
          adapter,
          options: { ...opts, indentLevel },
          indent: (level = indentLevel) => opts.indent.repeat(level),
          serialize: serializeInternal,
        };
        const result = custom(s, ctx);
        if (result !== undefined) return result;
      }

      // 2. IR path (default).
      const node = castFromZod(s, adapter);
      return codegen(node, buildCodegenOptions(opts, indentLevel));
    }

    return serializeInternal(schema);
  }

  function registerHandler(type: string, handler: SchemaHandler): void {
    customHandlers.set(type, handler);
  }

  function generateModule(
    schemas: Record<string, unknown>,
    options: SerializeOptions = {},
  ): string {
    const lines: string[] = ["import { z } from 'zod';"];
    lines.push("");

    for (const [name, schema] of Object.entries(schemas)) {
      if (adapter.isZodSchema(schema)) {
        const serialized = serialize(schema, options);
        lines.push(`export const ${name} = ${serialized};`);
        lines.push("");
      }
    }

    return lines.join("\n");
  }

  return {
    serialize,
    registerHandler,
    generateModule,
    adapter,
  };
}
