import type { ZodAdapter } from '@zod-codepen/core';

/**
 * Zod v4 adapter
 *
 * Zod v4 structure (all variants: zod, zod/mini, zod/v4, etc.):
 * - schema._zod.def.type - type string (e.g., "string", "number", "object")
 * - schema._zod.def - definition object
 * - schema.def / schema.type - shortcuts in v4/classic only
 *
 * Zod v4 subpackages:
 * - zod (default) / zod/v4 / zod/v4/classic - full API with method chaining
 * - zod/mini / zod/v4/mini - lightweight, tree-shakeable
 * - zod/v4/core - core functionality (shared by classic and mini)
 *
 * All v4 variants share the same internal _zod structure.
 */
export const zodV4Adapter: ZodAdapter = {
  version: 'v4',

  getType(schema: unknown): string | undefined {
    if (!this.isZodSchema(schema)) return undefined;

    const s = schema as Record<string, unknown>;

    // v4 classic: direct .type property
    if (typeof s.type === 'string') {
      return s.type;
    }

    // v4 all variants: _zod.def.type
    if (s._zod && typeof s._zod === 'object') {
      const zod = s._zod as Record<string, unknown>;
      if (zod.def && typeof zod.def === 'object') {
        const def = zod.def as Record<string, unknown>;
        if (typeof def.type === 'string') {
          return def.type;
        }
      }
    }

    // v4 classic fallback: .def.type
    if (s.def && typeof s.def === 'object') {
      const def = s.def as Record<string, unknown>;
      if (typeof def.type === 'string') {
        return def.type;
      }
    }

    // v3 compatibility fallback: _def.typeName (normalize "ZodString" -> "string")
    if (s._def && typeof s._def === 'object') {
      const def = s._def as Record<string, unknown>;
      if (typeof def.typeName === 'string') {
        const typeName = def.typeName as string;
        return typeName.replace(/^Zod/, '').toLowerCase();
      }
    }

    return undefined;
  },

  getDef(schema: unknown): Record<string, unknown> | undefined {
    if (!this.isZodSchema(schema)) return undefined;

    const s = schema as Record<string, unknown>;

    // v4 all variants: _zod.def
    if (s._zod && typeof s._zod === 'object') {
      const zod = s._zod as Record<string, unknown>;
      if (zod.def && typeof zod.def === 'object') {
        return zod.def as Record<string, unknown>;
      }
    }

    // v4 classic: .def
    if (s.def && typeof s.def === 'object') {
      return s.def as Record<string, unknown>;
    }

    // v3 compatibility fallback: _def
    if (s._def && typeof s._def === 'object') {
      return s._def as Record<string, unknown>;
    }

    return undefined;
  },

  isZodSchema(value: unknown): boolean {
    if (!value || typeof value !== 'object') return false;

    const candidate = value as Record<string, unknown>;

    // v4 all variants: has _zod with def.type
    if (candidate._zod && typeof candidate._zod === 'object') {
      const zod = candidate._zod as Record<string, unknown>;
      if (zod.def && typeof zod.def === 'object') {
        const def = zod.def as Record<string, unknown>;
        if (typeof def.type === 'string') {
          return true;
        }
      }
    }

    // v4 classic: has direct .type
    if (typeof candidate.type === 'string' && typeof candidate.parse === 'function') {
      return true;
    }

    // v3 compatibility: _def.typeName
    if (candidate._def && typeof candidate._def === 'object') {
      const def = candidate._def as Record<string, unknown>;
      if (typeof def.typeName === 'string') {
        return true;
      }
    }

    return false;
  },
};

export default zodV4Adapter;
