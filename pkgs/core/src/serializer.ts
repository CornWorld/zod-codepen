import type {
  ZodAdapter,
  SerializeOptions,
  SerializerContext,
  SchemaHandler,
} from './types.js';
import { defaultOptions } from './types.js';

/**
 * Normalized check structure that works for both v3 and v4
 */
interface NormalizedCheck {
  kind: string;
  value?: unknown;
  minimum?: number;
  maximum?: number;
  inclusive?: boolean;
  regex?: RegExp;
}

/**
 * Normalize checks from either v3 or v4 format
 *
 * v3 format: { kind: 'min', value: 5, inclusive: true }
 * v4 format: { _zod: { def: { check: 'min_length', minimum: 5 } } }
 * v4 format for formats: { _zod: { def: { check: 'string_format', format: 'email' } } }
 * v4 format for number: { _zod: { def: { check: 'greater_than', value: 5, inclusive: true } } }
 */
function normalizeChecks(def: Record<string, unknown>): NormalizedCheck[] {
  const checks = def.checks;
  if (!checks || !Array.isArray(checks)) return [];

  return checks
    .map((check: unknown): NormalizedCheck | null => {
      if (!check || typeof check !== 'object') return null;

      const c = check as Record<string, unknown>;

      // v3 format: direct { kind, value, ... }
      if (typeof c.kind === 'string') {
        return {
          kind: c.kind,
          value: c.value,
          minimum: c.value as number | undefined,
          maximum: c.value as number | undefined,
          inclusive: c.inclusive as boolean | undefined,
          regex: c.regex as RegExp | undefined,
        };
      }

      // v4 format: { _zod: { def: { check, ... } } }
      if (c._zod && typeof c._zod === 'object') {
        const zod = c._zod as Record<string, unknown>;
        if (zod.def && typeof zod.def === 'object') {
          const checkDef = zod.def as Record<string, unknown>;
          const checkType = checkDef.check as string | undefined;

          if (!checkType) return null;

          // Special handling for v4 string_format (email, url, uuid, etc.)
          if (checkType === 'string_format') {
            const format = checkDef.format as string;
            return {
              kind: format || 'format',
              value: undefined,
              regex: checkDef.pattern as RegExp | undefined,
            };
          }

          // Special handling for v4 number_format (int, finite, safe, etc.)
          if (checkType === 'number_format') {
            const format = checkDef.format as string;
            // Map format names to kinds
            const formatMap: Record<string, string> = {
              int: 'int',
              safeint: 'int', // v4 uses safeint for int()
              integer: 'int',
              finite: 'finite',
              safe: 'safe',
            };
            return {
              kind: formatMap[format] || format || 'int',
              value: undefined,
            };
          }

          // Map v4 check names to v3 style
          const kindMap: Record<string, string> = {
            min_length: 'min',
            max_length: 'max',
            length: 'length',
            min_size: 'min',
            max_size: 'max',
            size: 'size',
            // v4 number checks
            greater_than: 'min',
            less_than: 'max',
            greater_than_or_equal: 'min',
            less_than_or_equal: 'max',
            // String transforms
            lowercase: 'toLowerCase',
            uppercase: 'toUpperCase',
            trim: 'trim',
            normalize: 'normalize',
            // Keep existing mappings
            email: 'email',
            url: 'url',
            uuid: 'uuid',
            nanoid: 'nanoid',
            cuid: 'cuid',
            cuid2: 'cuid2',
            ulid: 'ulid',
            regex: 'regex',
            pattern: 'regex',
            datetime: 'datetime',
            date: 'date',
            time: 'time',
            duration: 'duration',
            ip: 'ip',
            ipv4: 'ip',
            ipv6: 'ip',
            cidr: 'cidr',
            cidrv4: 'cidr',
            cidrv6: 'cidr',
            base64: 'base64',
            base64url: 'base64url',
            jwt: 'jwt',
            emoji: 'emoji',
            starts_with: 'startsWith',
            ends_with: 'endsWith',
            includes: 'includes',
            to_lower_case: 'toLowerCase',
            to_upper_case: 'toUpperCase',
            int: 'int',
            integer: 'int',
            finite: 'finite',
            multiple_of: 'multipleOf',
            min: 'min',
            max: 'max',
            positive: 'positive',
            negative: 'negative',
            nonnegative: 'nonnegative',
            nonpositive: 'nonpositive',
          };

          const kind = kindMap[checkType] || checkType;

          // For greater_than/less_than, determine inclusive from the check type
          let inclusive = checkDef.inclusive as boolean | undefined;
          if (checkType === 'greater_than' || checkType === 'less_than') {
            inclusive = false;
          } else if (checkType === 'greater_than_or_equal' || checkType === 'less_than_or_equal') {
            inclusive = true;
          }

          return {
            kind,
            value: checkDef.value ?? checkDef.minimum ?? checkDef.maximum,
            minimum: checkDef.minimum as number | undefined,
            maximum: checkDef.maximum as number | undefined,
            inclusive,
            regex: checkDef.pattern as RegExp | undefined,
          };
        }
      }

      return null;
    })
    .filter((c): c is NormalizedCheck => c !== null);
}

/**
 * Built-in handlers for common Zod types
 */
const builtinHandlers: Map<string, SchemaHandler> = new Map();

// Primitive types
const primitiveTypes = [
  'string',
  'number',
  'boolean',
  'bigint',
  'date',
  'undefined',
  'null',
  'void',
  'any',
  'unknown',
  'never',
  'nan',
  'symbol',
];

for (const type of primitiveTypes) {
  builtinHandlers.set(type, () => `z.${type}()`);
}

// Boolean with coercion support
builtinHandlers.set('boolean', (schema, ctx) => {
  const def = ctx.adapter.getDef(schema);
  if (!def) return 'z.boolean()';

  // Check for coercion flag
  const coerce = def.coerce as boolean;
  return coerce ? 'z.coerce.boolean()' : 'z.boolean()';
});

// String with constraints
builtinHandlers.set('string', (schema, ctx) => {
  const def = ctx.adapter.getDef(schema);
  if (!def) return 'z.string()';

  // Check for coercion flag
  const coerce = def.coerce as boolean;
  const prefix = coerce ? 'z.coerce.string()' : 'z.string()';

  const checks = normalizeChecks(def);
  let result = prefix;

  for (const check of checks) {
    switch (check.kind) {
      case 'min':
        result += `.min(${check.value ?? check.minimum})`;
        break;
      case 'max':
        result += `.max(${check.value ?? check.maximum})`;
        break;
      case 'length':
        result += `.length(${check.value})`;
        break;
      case 'email':
        result += '.email()';
        break;
      case 'url':
        result += '.url()';
        break;
      case 'uuid':
        result += '.uuid()';
        break;
      case 'cuid':
        result += '.cuid()';
        break;
      case 'cuid2':
        result += '.cuid2()';
        break;
      case 'ulid':
        result += '.ulid()';
        break;
      case 'nanoid':
        result += '.nanoid()';
        break;
      case 'regex': {
        const regex = check.regex || (check.value as RegExp);
        if (regex && typeof regex.toString === 'function') {
          result += `.regex(${regex.toString()})`;
        }
        break;
      }
      case 'startsWith':
        result += `.startsWith(${JSON.stringify(check.value)})`;
        break;
      case 'endsWith':
        result += `.endsWith(${JSON.stringify(check.value)})`;
        break;
      case 'includes':
        result += `.includes(${JSON.stringify(check.value)})`;
        break;
      case 'datetime':
        result += '.datetime()';
        break;
      case 'ip':
        result += '.ip()';
        break;
      case 'trim':
        result += '.trim()';
        break;
      case 'toLowerCase':
        result += '.toLowerCase()';
        break;
      case 'toUpperCase':
        result += '.toUpperCase()';
        break;
    }
  }

  return result;
});

// Number with constraints
// In v3, positive() -> min(0, inclusive: false), negative() -> max(0, inclusive: false)
// We need to detect these patterns and output the semantic methods
builtinHandlers.set('number', (schema, ctx) => {
  const def = ctx.adapter.getDef(schema);
  if (!def) return 'z.number()';

  // Check for coercion flag
  const coerce = def.coerce as boolean;
  const prefix = coerce ? 'z.coerce.number()' : 'z.number()';

  const checks = normalizeChecks(def);
  let result = prefix;

  for (const check of checks) {
    const value = (check.value ?? check.minimum ?? check.maximum) as number | undefined;
    switch (check.kind) {
      case 'min':
        // positive: min(0, inclusive: false)
        // nonnegative: min(0, inclusive: true)
        if (value === 0 && check.inclusive === false) {
          result += '.positive()';
        } else if (value === 0 && check.inclusive === true) {
          result += '.nonnegative()';
        } else if (
          value === Number.MIN_SAFE_INTEGER &&
          check.inclusive === true
        ) {
          // safe() adds both min and max, we handle it in max case
          // Skip here, will be handled in combination
        } else {
          result += `.min(${value})`;
        }
        break;
      case 'max':
        // negative: max(0, inclusive: false)
        // nonpositive: max(0, inclusive: true)
        if (value === 0 && check.inclusive === false) {
          result += '.negative()';
        } else if (value === 0 && check.inclusive === true) {
          result += '.nonpositive()';
        } else if (
          value === Number.MAX_SAFE_INTEGER &&
          check.inclusive === true
        ) {
          // Check if this is part of safe() by looking for matching min
          const hasMinSafe = checks.some(
            (c) =>
              c.kind === 'min' &&
              (c.value ?? c.minimum) === Number.MIN_SAFE_INTEGER &&
              c.inclusive === true,
          );
          if (hasMinSafe) {
            result += '.safe()';
          } else {
            result += `.max(${value})`;
          }
        } else {
          result += `.max(${value})`;
        }
        break;
      case 'int':
        result += '.int()';
        break;
      case 'multipleOf':
        result += `.multipleOf(${value})`;
        break;
      case 'finite':
        result += '.finite()';
        break;
      // v4 might have explicit positive/negative/nonnegative/nonpositive
      case 'positive':
        result += '.positive()';
        break;
      case 'negative':
        result += '.negative()';
        break;
      case 'nonnegative':
        result += '.nonnegative()';
        break;
      case 'nonpositive':
        result += '.nonpositive()';
        break;
    }
  }

  return result;
});

// BigInt with constraints
// In v3, bigint has similar constraint patterns to number
builtinHandlers.set('bigint', (schema, ctx) => {
  const def = ctx.adapter.getDef(schema);
  if (!def) return 'z.bigint()';

  // Check for coercion flag
  const coerce = def.coerce as boolean;
  const prefix = coerce ? 'z.coerce.bigint()' : 'z.bigint()';

  const checks = normalizeChecks(def);
  let result = prefix;

  for (const check of checks) {
    const value = check.value ?? check.minimum ?? check.maximum;
    switch (check.kind) {
      case 'min':
        // positive: min(0n, inclusive: false)
        // nonnegative: min(0n, inclusive: true)
        if (value === 0n && check.inclusive === false) {
          result += '.positive()';
        } else if (value === 0n && check.inclusive === true) {
          result += '.nonnegative()';
        } else {
          result += `.min(${value}n)`;
        }
        break;
      case 'max':
        // negative: max(0n, inclusive: false)
        // nonpositive: max(0n, inclusive: true)
        if (value === 0n && check.inclusive === false) {
          result += '.negative()';
        } else if (value === 0n && check.inclusive === true) {
          result += '.nonpositive()';
        } else {
          result += `.max(${value}n)`;
        }
        break;
      case 'multipleOf':
        result += `.multipleOf(${value}n)`;
        break;
      // v4 might have explicit positive/negative checks
      case 'positive':
        result += '.positive()';
        break;
      case 'negative':
        result += '.negative()';
        break;
      case 'nonnegative':
        result += '.nonnegative()';
        break;
      case 'nonpositive':
        result += '.nonpositive()';
        break;
    }
  }

  return result;
});

// Date with constraints
builtinHandlers.set('date', (schema, ctx) => {
  const def = ctx.adapter.getDef(schema);
  if (!def) return 'z.date()';

  // Check for coercion flag
  const coerce = def.coerce as boolean;
  const prefix = coerce ? 'z.coerce.date()' : 'z.date()';

  const checks = normalizeChecks(def);
  let result = prefix;

  for (const check of checks) {
    const value = check.value ?? check.minimum ?? check.maximum;
    switch (check.kind) {
      case 'min': {
        const date = value instanceof Date ? value : new Date(value as number);
        result += `.min(new Date(${JSON.stringify(date.toISOString())}))`;
        break;
      }
      case 'max': {
        const date = value instanceof Date ? value : new Date(value as number);
        result += `.max(new Date(${JSON.stringify(date.toISOString())}))`;
        break;
      }
    }
  }

  return result;
});

// Literal
builtinHandlers.set('literal', (schema, ctx) => {
  const def = ctx.adapter.getDef(schema);
  // v3 uses def.value, v4 uses def.values (array with single element)
  let value = def?.value;
  if (value === undefined && def?.values && Array.isArray(def.values)) {
    value = def.values[0];
  }
  if (typeof value === 'string') {
    return `z.literal(${JSON.stringify(value)})`;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return `z.literal(${value})`;
  }
  if (typeof value === 'bigint') {
    return `z.literal(${value}n)`;
  }
  if (value === null) {
    return 'z.literal(null)';
  }
  if (value === undefined) {
    return 'z.literal(undefined)';
  }
  return `z.literal(${JSON.stringify(value)})`;
});

// Enum
builtinHandlers.set('enum', (schema, ctx) => {
  const def = ctx.adapter.getDef(schema);
  // v3 uses def.values (array), v4 uses def.entries (object { a: 'a', b: 'b' })
  let values: string[];
  if (def?.values && Array.isArray(def.values)) {
    values = def.values as string[];
  } else if (def?.entries && typeof def.entries === 'object') {
    // v4 entries is an object, get the values
    values = Object.values(def.entries as Record<string, string>);
  } else {
    values = [];
  }
  const quoted = values.map((v) => JSON.stringify(v));
  return `z.enum([${quoted.join(', ')}])`;
});

// Native enum
builtinHandlers.set('nativeenum', (schema, ctx) => {
  const def = ctx.adapter.getDef(schema);
  // Can't serialize native enums properly, use a comment
  return `z.nativeEnum(/* native enum */${JSON.stringify(def?.values || {})})`;
});

// Optional
builtinHandlers.set('optional', (schema, ctx) => {
  const def = ctx.adapter.getDef(schema);
  const inner = def?.innerType;
  if (!inner) return 'z.any().optional()';
  return `${ctx.serialize(inner)}.optional()`;
});

// Nullable
builtinHandlers.set('nullable', (schema, ctx) => {
  const def = ctx.adapter.getDef(schema);
  const inner = def?.innerType;
  if (!inner) return 'z.any().nullable()';
  return `${ctx.serialize(inner)}.nullable()`;
});

// Nullish (v4)
builtinHandlers.set('nullish', (schema, ctx) => {
  const def = ctx.adapter.getDef(schema);
  const inner = def?.innerType;
  if (!inner) return 'z.any().nullish()';
  return `${ctx.serialize(inner)}.nullish()`;
});

// Default - in v3, defaultValue is always a function
builtinHandlers.set('default', (schema, ctx) => {
  const def = ctx.adapter.getDef(schema);
  const inner = def?.innerType;
  const defaultValue = def?.defaultValue;
  if (!inner) return 'z.any()';
  const serializedInner = ctx.serialize(inner);

  // In v3, defaultValue is always a function that returns the default
  // We can't serialize the function, but we can try to call it for primitive values
  if (typeof defaultValue === 'function') {
    try {
      const value = defaultValue();
      if (
        typeof value === 'string' ||
        typeof value === 'number' ||
        typeof value === 'boolean' ||
        value === null
      ) {
        return `${serializedInner}.default(${JSON.stringify(value)})`;
      }
    } catch {
      // If calling the function fails, fall through to generic case
    }
    return `${serializedInner}.default(/* function */)`;
  }
  return `${serializedInner}.default(${JSON.stringify(defaultValue)})`;
});

// Catch - in v3, catchValue is always a function
builtinHandlers.set('catch', (schema, ctx) => {
  const def = ctx.adapter.getDef(schema);
  const inner = def?.innerType;
  const catchValue = def?.catchValue;
  if (!inner) return 'z.any()';
  const serializedInner = ctx.serialize(inner);

  // In v3, catchValue is always a function
  if (typeof catchValue === 'function') {
    try {
      // Try calling with empty error context
      const value = catchValue({ error: null, input: undefined });
      if (
        typeof value === 'string' ||
        typeof value === 'number' ||
        typeof value === 'boolean' ||
        value === null
      ) {
        return `${serializedInner}.catch(${JSON.stringify(value)})`;
      }
    } catch {
      // If calling the function fails, fall through to generic case
    }
    return `${serializedInner}.catch(/* function */)`;
  }
  return `${serializedInner}.catch(${JSON.stringify(catchValue)})`;
});

// Array - in v3, element is in def.type, constraints are { value, message } | null
// In v4, element is in def.element, constraints are in checks array
builtinHandlers.set('array', (schema, ctx) => {
  const def = ctx.adapter.getDef(schema);
  // v3: def.type (is an object/schema), v4: def.element
  // In v4, def.type is a string ('array'), so check if it's an object first
  let element = def?.element;
  if (!element && def?.type && typeof def.type === 'object') {
    element = def.type;
  }
  if (!element) return 'z.array(z.any())';

  let result = `z.array(${ctx.serialize(element)})`;

  // Handle array constraints - in v3 they are { value: number, message?: string } | null
  // In v4 they are in checks array
  if (def?.minLength !== null && def?.minLength !== undefined) {
    const val =
      typeof def.minLength === 'object'
        ? (def.minLength as { value: number }).value
        : def.minLength;
    result += `.min(${val})`;
  }
  if (def?.maxLength !== null && def?.maxLength !== undefined) {
    const val =
      typeof def.maxLength === 'object'
        ? (def.maxLength as { value: number }).value
        : def.maxLength;
    result += `.max(${val})`;
  }
  if (def?.exactLength !== null && def?.exactLength !== undefined) {
    const val =
      typeof def.exactLength === 'object'
        ? (def.exactLength as { value: number }).value
        : def.exactLength;
    result += `.length(${val})`;
  }

  // v4: check for constraints in checks array
  const checks = normalizeChecks(def as Record<string, unknown>);
  for (const check of checks) {
    switch (check.kind) {
      case 'min':
        result += `.min(${check.value ?? check.minimum})`;
        break;
      case 'max':
        result += `.max(${check.value ?? check.maximum})`;
        break;
      case 'length':
        result += `.length(${check.value})`;
        break;
    }
  }

  return result;
});

// Object - in v3, shape is a function, catchall defaults to ZodNever
// In v3: unknownKeys controls behavior ('strip'=default, 'strict', 'passthrough'), catchall defaults to ZodNever
// In v4: no unknownKeys, uses catchall directly (undefined=strip, never=strict, unknown=passthrough)
builtinHandlers.set('object', (schema, ctx) => {
  const def = ctx.adapter.getDef(schema);
  // v3: def.shape(), v4: def.shape
  let shape = def?.shape;
  if (typeof shape === 'function') {
    shape = shape();
  }

  if (!shape || typeof shape !== 'object') {
    return 'z.object({})';
  }

  const entries = Object.entries(shape as Record<string, unknown>);

  // Handle catchall for v3/v4 differences
  const catchall = def?.catchall;
  let catchallType: string | undefined;
  if (catchall && ctx.adapter.isZodSchema(catchall)) {
    catchallType = ctx.adapter.getType(catchall);
  }

  // Determine passthrough/strict status
  // v3 uses unknownKeys property, v4 uses catchall type
  let isPassthrough = false;
  let isStrict = false;
  let outputCatchall = false;

  if (def?.unknownKeys !== undefined) {
    // v3 style - use unknownKeys
    isPassthrough = def.unknownKeys === 'passthrough';
    isStrict = def.unknownKeys === 'strict';
    // In v3, only output catchall if it's not ZodNever (the default)
    if (catchall && catchallType && catchallType !== 'never') {
      outputCatchall = true;
    }
  } else if (catchallType !== undefined) {
    // v4 style - use catchall type
    isPassthrough = catchallType === 'unknown';
    isStrict = catchallType === 'never';
  }

  if (entries.length === 0) {
    let result = 'z.object({})';
    if (isPassthrough) {
      result += '.passthrough()';
    } else if (isStrict) {
      result += '.strict()';
    }
    if (outputCatchall && catchall) {
      result += `.catchall(${ctx.serialize(catchall)})`;
    }
    return result;
  }

  const props = entries.map(([key, val]) => {
    const keyStr = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key)
      ? key
      : JSON.stringify(key);
    if (ctx.options.format) {
      const pad = ctx.indent(ctx.options.indentLevel + 1);
      return `${pad}${keyStr}: ${ctx.serialize(val, ctx.options.indentLevel + 1)}`;
    } else {
      return `${keyStr}: ${ctx.serialize(val, ctx.options.indentLevel + 1)}`;
    }
  });

  let result: string;
  if (ctx.options.format) {
    const closePad = ctx.indent(ctx.options.indentLevel);
    result = `z.object({\n${props.join(',\n')},\n${closePad}})`;
  } else {
    result = `z.object({ ${props.join(', ')} })`;
  }

  // Handle unknown keys
  if (isPassthrough) {
    result += '.passthrough()';
  } else if (isStrict) {
    result += '.strict()';
  }

  // Output catchall if needed (v3 with non-default catchall)
  if (outputCatchall && catchall) {
    result += `.catchall(${ctx.serialize(catchall)})`;
  }

  return result;
});

// Record
builtinHandlers.set('record', (schema, ctx) => {
  const def = ctx.adapter.getDef(schema);
  // v3: def.keyType, def.valueType
  // v4: may vary
  const keyType = def?.keyType;
  const valueType = def?.valueType;

  if (!valueType) {
    return 'z.record(z.string(), z.any())';
  }

  const keyStr = keyType ? ctx.serialize(keyType) : 'z.string()';
  const valStr = ctx.serialize(valueType);

  return `z.record(${keyStr}, ${valStr})`;
});

// Map
builtinHandlers.set('map', (schema, ctx) => {
  const def = ctx.adapter.getDef(schema);
  const keyType = def?.keyType;
  const valueType = def?.valueType;

  const keyStr = keyType ? ctx.serialize(keyType) : 'z.any()';
  const valStr = valueType ? ctx.serialize(valueType) : 'z.any()';

  return `z.map(${keyStr}, ${valStr})`;
});

// Set - in v3, minSize/maxSize are { value: number, message?: string } | null
// In v4, element is in def.element, constraints are in checks array
builtinHandlers.set('set', (schema, ctx) => {
  const def = ctx.adapter.getDef(schema);
  // v3: def.valueType, v4: def.valueType or def.element
  const valueType = def?.valueType || def?.element;
  if (!valueType) return 'z.set(z.any())';

  let result = `z.set(${ctx.serialize(valueType)})`;

  // v3 style constraints
  if (def?.minSize !== null && def?.minSize !== undefined) {
    const val =
      typeof def.minSize === 'object'
        ? (def.minSize as { value: number }).value
        : def.minSize;
    result += `.min(${val})`;
  }
  if (def?.maxSize !== null && def?.maxSize !== undefined) {
    const val =
      typeof def.maxSize === 'object'
        ? (def.maxSize as { value: number }).value
        : def.maxSize;
    result += `.max(${val})`;
  }

  // v4: check for constraints in checks array
  const checks = normalizeChecks(def as Record<string, unknown>);
  for (const check of checks) {
    switch (check.kind) {
      case 'min':
        result += `.min(${check.value ?? check.minimum})`;
        break;
      case 'max':
        result += `.max(${check.value ?? check.maximum})`;
        break;
      case 'size':
        result += `.size(${check.value})`;
        break;
    }
  }

  return result;
});

// Tuple
builtinHandlers.set('tuple', (schema, ctx) => {
  const def = ctx.adapter.getDef(schema);
  const items = def?.items || [];
  const rest = def?.rest;

  const itemsStr = (items as unknown[])
    .map((item) => ctx.serialize(item))
    .join(', ');

  let result = `z.tuple([${itemsStr}])`;

  if (rest) {
    result += `.rest(${ctx.serialize(rest)})`;
  }

  return result;
});

// Union
// In v4, discriminated union also has type 'union' but with a discriminator property
builtinHandlers.set('union', (schema, ctx) => {
  const def = ctx.adapter.getDef(schema);
  const options = def?.options || [];
  const optionsStr = (options as unknown[])
    .map((opt) => ctx.serialize(opt))
    .join(', ');

  // Check if this is actually a discriminated union (v4 style)
  if (def?.discriminator) {
    return `z.discriminatedUnion(${JSON.stringify(def.discriminator)}, [${optionsStr}])`;
  }

  return `z.union([${optionsStr}])`;
});

// Discriminated union
builtinHandlers.set('discriminatedunion', (schema, ctx) => {
  const def = ctx.adapter.getDef(schema);
  const discriminator = def?.discriminator;
  const options = def?.options || [];
  const optionsStr = (options as unknown[])
    .map((opt) => ctx.serialize(opt))
    .join(', ');
  return `z.discriminatedUnion(${JSON.stringify(discriminator)}, [${optionsStr}])`;
});

// Intersection
builtinHandlers.set('intersection', (schema, ctx) => {
  const def = ctx.adapter.getDef(schema);
  const left = def?.left;
  const right = def?.right;
  if (!left || !right) return 'z.any()';
  return `z.intersection(${ctx.serialize(left)}, ${ctx.serialize(right)})`;
});

// Lazy
builtinHandlers.set('lazy', () => {
  return `z.lazy(() => /* circular reference */)`;
});

// Promise
builtinHandlers.set('promise', (schema, ctx) => {
  const def = ctx.adapter.getDef(schema);
  // v4: def.innerType, v3: def.type (when type is an object, not string)
  let inner = def?.innerType;
  if (!inner && def?.type && typeof def.type === 'object') {
    inner = def.type;
  }
  if (!inner) return 'z.promise(z.any())';
  return `z.promise(${ctx.serialize(inner)})`;
});

// Function - in v3, args is a ZodTuple with .items, returns is the return type
builtinHandlers.set('function', (schema, ctx) => {
  const def = ctx.adapter.getDef(schema);
  const argsTuple = def?.args;
  const returns = def?.returns;

  let result = 'z.function()';

  // In v3, args is a ZodTuple schema
  if (argsTuple && ctx.adapter.isZodSchema(argsTuple)) {
    const argsDef = ctx.adapter.getDef(argsTuple);
    const argsItems = argsDef?.items;
    if (argsItems && Array.isArray(argsItems) && argsItems.length > 0) {
      const argsStr = argsItems.map((arg: unknown) => ctx.serialize(arg)).join(', ');
      result += `.args(${argsStr})`;
    }
  }

  // Check if returns is ZodUnknown (default)
  if (returns && ctx.adapter.isZodSchema(returns)) {
    const returnsType = ctx.adapter.getType(returns);
    if (returnsType !== 'unknown') {
      result += `.returns(${ctx.serialize(returns)})`;
    }
  }

  return result;
});

// Effects (refine, superRefine, transform, preprocess, etc.)
builtinHandlers.set('effects', (schema, ctx) => {
  const def = ctx.adapter.getDef(schema);
  const inner = def?.schema;
  const effect = def?.effect as { type: string; refinement?: unknown } | undefined;

  if (!inner) return 'z.any()';

  const innerStr = ctx.serialize(inner);
  const effectType = effect?.type;

  switch (effectType) {
    case 'refinement':
      // In v3, refine() and superRefine() both produce the same effect type "refinement"
      // We can't distinguish them, so we output refine() as it's more common
      return `${innerStr}.refine(/* refinement function */)`;
    case 'transform':
      return `${innerStr}.transform(/* transform function */)`;
    case 'preprocess':
      return `z.preprocess(/* preprocess function */, ${innerStr})`;
    default:
      return innerStr;
  }
});

// Pipe (v4) / Pipeline (v3)
// In v4, transform() creates a pipe with in=input, out=ZodTransform
builtinHandlers.set('pipe', (schema, ctx) => {
  const def = ctx.adapter.getDef(schema);
  const input = def?.in || def?.innerType;
  const output = def?.out;

  if (!input) return 'z.any()';

  const inputStr = ctx.serialize(input);

  // Check if output is a transform
  if (output && ctx.adapter.isZodSchema(output)) {
    const outType = ctx.adapter.getType(output);
    if (outType === 'transform') {
      return `${inputStr}.transform(/* transform function */)`;
    }
    // For other pipe outputs, chain with .pipe()
    return `${inputStr}.pipe(${ctx.serialize(output)})`;
  }

  return inputStr;
});

// Transform (v4) - standalone transform type
builtinHandlers.set('transform', () => {
  return `/* transform */`;
});

// Pipeline (v3)
builtinHandlers.set('pipeline', (schema, ctx) => {
  const def = ctx.adapter.getDef(schema);
  const input = def?.in;
  const output = def?.out;

  if (!input) return 'z.any()';
  if (!output) return ctx.serialize(input);

  return `${ctx.serialize(input)}.pipe(${ctx.serialize(output)})`;
});

// Branded
builtinHandlers.set('branded', (schema, ctx) => {
  const def = ctx.adapter.getDef(schema);
  const inner = def?.type;
  if (!inner) return 'z.any()';
  return `${ctx.serialize(inner)}.brand()`;
});

// Readonly
builtinHandlers.set('readonly', (schema, ctx) => {
  const def = ctx.adapter.getDef(schema);
  const inner = def?.innerType;
  if (!inner) return 'z.any()';
  return `${ctx.serialize(inner)}.readonly()`;
});

/**
 * Create a serializer with a specific adapter
 */
export function createSerializer(adapter: ZodAdapter) {
  const handlers = new Map(builtinHandlers);

  /**
   * Serialize a Zod schema to code string
   */
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
        return 'z.any() /* unknown type */';
      }

      const ctx: SerializerContext = {
        adapter,
        options: { ...opts, indentLevel },
        indent: (level = indentLevel) => opts.indent.repeat(level),
        serialize: serializeInternal,
      };

      const handler = handlers.get(type);
      if (handler) {
        const result = handler(s, ctx);
        if (result !== undefined) {
          return result;
        }
      }

      return `z.any() /* unhandled type: ${type} */`;
    }

    return serializeInternal(schema);
  }

  /**
   * Register a custom handler for a schema type
   */
  function registerHandler(type: string, handler: SchemaHandler): void {
    handlers.set(type, handler);
  }

  /**
   * Generate a full module with exports
   */
  function generateModule(
    schemas: Record<string, unknown>,
    options: SerializeOptions = {},
  ): string {
    const lines: string[] = ["import { z } from 'zod';", ''];

    for (const [name, schema] of Object.entries(schemas)) {
      if (adapter.isZodSchema(schema)) {
        lines.push(`export const ${name} = ${serialize(schema, options)};`);
        lines.push('');
      }
    }

    return lines.join('\n');
  }

  return {
    serialize,
    registerHandler,
    generateModule,
    adapter,
  };
}

export { builtinHandlers };
