import type { ZodAdapter } from '@zod-codepen/core';
import { z } from 'zod';

/**
 * Zod v3 adapter
 *
 * In Zod v3:
 * - Type is accessed via schema._def.typeName (e.g., "ZodString", "ZodNumber")
 * - Definition is in schema._def
 * - All schemas inherit from ZodType
 */
export const zodV3Adapter: ZodAdapter = {
  version: 'v3',

  getType(schema: unknown): string | undefined {
    if (!this.isZodSchema(schema)) return undefined;

    const def = (schema as z.ZodTypeAny)._def;
    const typeName = def?.typeName as string | undefined;

    if (!typeName) return undefined;

    // Convert "ZodString" -> "string", "ZodNumber" -> "number", etc.
    return typeName.replace(/^Zod/, '').toLowerCase();
  },

  getDef(schema: unknown): Record<string, unknown> | undefined {
    if (!this.isZodSchema(schema)) return undefined;
    return (schema as z.ZodTypeAny)._def as Record<string, unknown>;
  },

  isZodSchema(value: unknown): boolean {
    if (!value || typeof value !== 'object') return false;

    // Check for ZodType characteristics
    const candidate = value as Record<string, unknown>;

    // v3 schemas have _def with typeName
    if (candidate._def && typeof candidate._def === 'object') {
      const def = candidate._def as Record<string, unknown>;
      return typeof def.typeName === 'string';
    }

    // Also check if it's an instance of ZodType
    return value instanceof z.ZodType;
  },
};

export default zodV3Adapter;
