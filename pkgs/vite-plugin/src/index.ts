/**
 * @file Vite plugin for decoupling Zod schemas from heavy dependencies
 *
 * This plugin provides two modes:
 * 1. Pre-build script mode: Generate pure Zod schemas before the main build
 * 2. Alias mode: Replace heavy schema imports with the generated file
 *
 * @example
 * ```ts
 * // vite.config.ts
 * import { zodDecoupling, zodDecouplingAlias } from '@zod-codepen/vite-plugin';
 *
 * export default defineConfig({
 *   plugins: [
 *     zodDecouplingAlias({
 *       aliasFrom: '../runtime/schema.js',
 *       aliasTo: './src/generated/api-schemas.ts',
 *     }),
 *   ],
 * });
 * ```
 *
 * Then run pre-build:
 * ```bash
 * npx zod-decoupling generate --entry ./src/runtime/schema.ts --output ./src/generated/api-schemas.ts
 * ```
 */

import { createSerializer, type ZodAdapter, type SerializeOptions } from '@zod-codepen/core';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Plugin } from 'vite';

// ============================================================
// Types
// ============================================================

/**
 * Options for the alias plugin
 */
export interface ZodDecouplingAliasOptions {
  /**
   * Import path to alias (what other files import from)
   * @example '../runtime/schema.js'
   */
  aliasFrom: string;

  /**
   * Path to the generated schema file (relative to project root)
   * @example './src/generated/api-schemas.ts'
   */
  aliasTo: string;
}

/**
 * Options for schema generation
 */
export interface GenerateSchemaOptions {
  /**
   * Schemas to serialize (Record of name -> Zod schema)
   */
  schemas: Record<string, unknown>;

  /**
   * Output file path
   */
  outputPath: string;

  /**
   * Zod version to use
   * @default 'v4'
   */
  zodVersion?: 'v3' | 'v4';

  /**
   * Filter function to select which exports to serialize
   * @default (name) => !name.startsWith('$')
   */
  filter?: (name: string, schema: unknown) => boolean;

  /**
   * Whether to include type exports
   * @default true
   */
  includeTypes?: boolean;

  /**
   * Custom header
   */
  header?: string;

  /**
   * Serialization options
   */
  serializeOptions?: SerializeOptions;

  /**
   * Verbose logging
   * @default false
   */
  verbose?: boolean;
}

// ============================================================
// Adapters
// ============================================================

/**
 * Creates a Zod v4 adapter for serialization
 */
export function createZodV4Adapter(): ZodAdapter {
  return {
    version: 'v4',
    getType(schema: unknown): string | undefined {
      if (!schema || typeof schema !== 'object') return undefined;

      const s = schema as Record<string, unknown>;

      // Zod v4: schema._zod.def.type
      if (s._zod && typeof s._zod === 'object') {
        const zod = s._zod as Record<string, unknown>;
        if (zod.def && typeof zod.def === 'object') {
          const def = zod.def as Record<string, unknown>;
          if (typeof def.type === 'string') return def.type;
        }
      }

      // Direct type property (v4 mini)
      if (typeof s.type === 'string') return s.type;

      // Fallback to v3 structure
      if (s._def && typeof s._def === 'object') {
        const def = s._def as Record<string, unknown>;
        if (typeof def.typeName === 'string') {
          return def.typeName.replace(/^Zod/, '').toLowerCase();
        }
      }

      return undefined;
    },
    getDef(schema: unknown): Record<string, unknown> | undefined {
      if (!schema || typeof schema !== 'object') return undefined;

      const s = schema as Record<string, unknown>;

      if (s._zod && typeof s._zod === 'object') {
        const zod = s._zod as Record<string, unknown>;
        if (zod.def && typeof zod.def === 'object') {
          return zod.def as Record<string, unknown>;
        }
      }

      if (s._def && typeof s._def === 'object') {
        return s._def as Record<string, unknown>;
      }

      return undefined;
    },
    isZodSchema(value: unknown): boolean {
      if (!value || typeof value !== 'object') return false;

      const v = value as Record<string, unknown>;

      // v4: has _zod property
      if (v._zod && typeof v._zod === 'object') return true;

      // v3: has _def with typeName
      if (v._def && typeof v._def === 'object') {
        const def = v._def as Record<string, unknown>;
        return typeof def.typeName === 'string';
      }

      // v4 mini: has direct type property and parse function
      if (typeof v.type === 'string' && typeof v.parse === 'function') return true;

      return false;
    },
  };
}

/**
 * Creates a Zod v3 adapter for serialization
 */
export function createZodV3Adapter(): ZodAdapter {
  return {
    version: 'v3',
    getType(schema: unknown): string | undefined {
      if (!schema || typeof schema !== 'object') return undefined;

      const s = schema as Record<string, unknown>;

      if (s._def && typeof s._def === 'object') {
        const def = s._def as Record<string, unknown>;
        if (typeof def.typeName === 'string') {
          return def.typeName.replace(/^Zod/, '').toLowerCase();
        }
      }

      return undefined;
    },
    getDef(schema: unknown): Record<string, unknown> | undefined {
      if (!schema || typeof schema !== 'object') return undefined;

      const s = schema as Record<string, unknown>;

      if (s._def && typeof s._def === 'object') {
        return s._def as Record<string, unknown>;
      }

      return undefined;
    },
    isZodSchema(value: unknown): boolean {
      if (!value || typeof value !== 'object') return false;

      const v = value as Record<string, unknown>;

      if (v._def && typeof v._def === 'object') {
        const def = v._def as Record<string, unknown>;
        return typeof def.typeName === 'string';
      }

      return false;
    },
  };
}

// ============================================================
// Core Functions
// ============================================================

/**
 * Default filter: include API schemas (no $ prefix)
 */
export const defaultFilter = (name: string): boolean => {
  // Skip type-only exports
  if (name.endsWith('Type')) return false;
  // Include API schemas (no $ prefix)
  return !name.startsWith('$');
};

/**
 * Generate pure Zod schema file from runtime schemas
 *
 * @example
 * ```ts
 * import * as schemas from './runtime/schema.js';
 * import { generateSchemas } from '@zod-codepen/vite-plugin';
 *
 * await generateSchemas({
 *   schemas,
 *   outputPath: './src/generated/api-schemas.ts',
 * });
 * ```
 */
export async function generateSchemas(options: GenerateSchemaOptions): Promise<void> {
  const {
    schemas,
    outputPath,
    zodVersion = 'v4',
    filter = defaultFilter,
    includeTypes = true,
    header,
    serializeOptions = {},
    verbose = false,
  } = options;

  const log = (msg: string) => {
    if (verbose) console.log(`[zod-decoupling] ${msg}`);
  };

  // Get adapter
  const adapter = zodVersion === 'v3' ? createZodV3Adapter() : createZodV4Adapter();
  const serializer = createSerializer(adapter);

  // Filter schemas
  const selectedSchemas: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(schemas)) {
    if (typeof value === 'undefined') continue;

    if (adapter.isZodSchema(value)) {
      if (filter(name, value)) {
        selectedSchemas[name] = value;
        log(`Including: ${name}`);
      } else {
        log(`Skipping: ${name} (filtered)`);
      }
    }
  }

  log(`Found ${Object.keys(selectedSchemas).length} schemas to serialize`);

  // Generate content
  const lines: string[] = [];

  // Header
  if (header) {
    lines.push(header);
    lines.push('');
  } else {
    lines.push('/**');
    lines.push(' * AUTO-GENERATED FILE - DO NOT EDIT');
    lines.push(' *');
    lines.push(` * Generated by @zod-codepen/vite-plugin at ${new Date().toISOString()}`);
    lines.push(' */');
    lines.push('');
  }

  lines.push("import { z } from 'zod';");
  lines.push('');

  // Serialize schemas
  const typeExports: string[] = [];
  for (const [name, schema] of Object.entries(selectedSchemas)) {
    try {
      const serialized = serializer.serialize(schema, serializeOptions);
      lines.push(`export const ${name} = ${serialized};`);
      lines.push('');

      if (includeTypes) {
        typeExports.push(`export type ${name} = z.infer<typeof ${name}>;`);
      }
    } catch (error) {
      console.warn(`[zod-decoupling] Failed to serialize '${name}':`, error);
      lines.push(`export const ${name} = z.any(); // Serialization failed`);
      lines.push('');
    }
  }

  // Type exports
  if (includeTypes && typeExports.length > 0) {
    lines.push('// Type exports');
    lines.push(...typeExports);
  }

  // Write file
  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  fs.writeFileSync(outputPath, lines.join('\n'));
  log(`Generated: ${outputPath}`);
}

// ============================================================
// Vite Plugin
// ============================================================

/**
 * Vite plugin that provides alias for decoupled schemas
 *
 * This plugin ONLY sets up the alias - schema generation must be done separately.
 *
 * @example
 * ```ts
 * // vite.config.ts
 * export default defineConfig({
 *   plugins: [
 *     zodDecouplingAlias({
 *       aliasFrom: '../runtime/schema.js',
 *       aliasTo: './src/generated/api-schemas.ts',
 *     }),
 *   ],
 * });
 * ```
 */
export function zodDecouplingAlias(options: ZodDecouplingAliasOptions): Plugin {
  const { aliasFrom, aliasTo } = options;

  return {
    name: 'zod-decoupling-alias',
    enforce: 'pre',

    config(userConfig) {
      const root = userConfig.root || process.cwd();
      const aliasToResolved = path.resolve(root, aliasTo);

      return {
        resolve: {
          alias: {
            [aliasFrom]: aliasToResolved,
          },
        },
      };
    },
  };
}

/**
 * Full Vite plugin that generates schemas at buildStart
 *
 * NOTE: This requires the schema file to be importable at build time.
 * If your schemas depend on drizzle-orm, use the separate script approach instead.
 */
export function zodDecoupling(options: {
  schemaEntry: string;
  outputPath: string;
  aliasFrom: string;
  zodVersion?: 'v3' | 'v4';
  filter?: (name: string, schema: unknown) => boolean;
  includeTypes?: boolean;
  header?: string;
  serializeOptions?: SerializeOptions;
  verbose?: boolean;
}): Plugin {
  const {
    schemaEntry,
    outputPath,
    aliasFrom,
    zodVersion = 'v4',
    filter = defaultFilter,
    includeTypes = true,
    header,
    serializeOptions = {},
    verbose = false,
  } = options;

  let root: string;

  return {
    name: 'zod-decoupling',
    enforce: 'pre',

    configResolved(config) {
      root = config.root;
    },

    async buildStart() {
      const schemaPath = path.resolve(root, schemaEntry);
      const outputFilePath = path.resolve(root, outputPath);

      try {
        // Dynamic import
        const schemas = await import(schemaPath);

        await generateSchemas({
          schemas,
          outputPath: outputFilePath,
          zodVersion,
          filter,
          includeTypes,
          header,
          serializeOptions,
          verbose,
        });
      } catch (error) {
        console.error(`[zod-decoupling] Failed to import schemas:`, error);
      }
    },

    config(userConfig) {
      const resolvedRoot = userConfig.root || process.cwd();
      const aliasToResolved = path.resolve(resolvedRoot, outputPath);

      return {
        resolve: {
          alias: {
            [aliasFrom]: aliasToResolved,
          },
        },
      };
    },
  };
}

export default zodDecoupling;

// Re-export types
export type { ZodAdapter, SerializeOptions } from '@zod-codepen/core';
