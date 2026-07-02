/**
 * Version normalization for Zod schema defs.
 *
 * Mirrors the logic that used to live inline in serializer.ts. The job is
 * to flatten v3 / v4 def shapes into a uniform structure that casters
 * below this module can consume without re-checking the version.
 *
 * - normalizeChecks(): v3 `{kind:'min', value:5}` and v4
 *   `{_zod:{def:{check:'min_length', minimum:5}}}` -> a single
 *   NormalizedCheck array.
 * - normalizeObjectMode(): v3 `unknownKeys` / v4 `catchall` ->
 *   `{unknownMode, catchall}`.
 *
 * This module must be pure: it accepts def objects and returns plain
 * data. It must NOT import from ir/nodes.ts (that would couple version
 * normalization to IR shape).
 */

/**
 * Normalized check structure, identical to what the old serializer
 * produced. Carries enough info for cast/cast/constraints.ts to build
 * ConstraintNode objects.
 */
export interface NormalizedCheck {
  kind: string;
  value?: unknown;
  minimum?: number;
  maximum?: number;
  inclusive?: boolean;
  regex?: RegExp;
}

/**
 * v3 check name -> normalized kind. v3 uses short names directly, so
 * most pass through unchanged.
 */
const V3_KIND_FALLBACK: Record<string, string> = {};

/**
 * v4 check name (the `check` field under `_zod.def`) -> normalized kind.
 * Many v4 checks are renamed (min_length -> min, greater_than -> min, etc).
 * String formats (email, url, ...) come through `string_format` and get
 * their `format` field used as the kind.
 */
const V4_KIND_MAP: Record<string, string> = {
  min_length: "min",
  max_length: "max",
  length: "length",
  min_size: "min",
  max_size: "max",
  size: "size",
  // number checks
  greater_than: "min",
  less_than: "max",
  greater_than_or_equal: "min",
  less_than_or_equal: "max",
  // string transforms
  lowercase: "toLowerCase",
  uppercase: "toUpperCase",
  trim: "trim",
  normalize: "normalize",
  // formats kept as-is
  email: "email",
  url: "url",
  uuid: "uuid",
  nanoid: "nanoid",
  cuid: "cuid",
  cuid2: "cuid2",
  ulid: "ulid",
  regex: "regex",
  pattern: "regex",
  datetime: "datetime",
  date: "date",
  time: "time",
  duration: "duration",
  ip: "ip",
  startsWith: "startsWith",
  endsWith: "endsWith",
  includes: "includes",
};

/**
 * v4 number_format -> normalized kind. v4 collapses several number
 * predicates into a single `number_format` check.
 */
const V4_NUMBER_FORMAT_MAP: Record<string, string> = {
  int: "int",
  safeint: "int",
  integer: "int",
  finite: "finite",
  safe: "safe",
};

/**
 * Normalize the `checks` array from a def into a uniform shape.
 *
 * Accepts both:
 *   - v3: checks[i] = { kind: "min", value: 5, inclusive: true, ... }
 *   - v4: checks[i] = { _zod: { def: { check: "min_length", minimum: 5 } } }
 *
 * Returns []. Does not throw on malformed entries — those are skipped.
 */
export function normalizeChecks(
  def: Record<string, unknown> | undefined,
): NormalizedCheck[] {
  if (!def) return [];
  const checks = def.checks;
  if (!checks || !Array.isArray(checks)) return [];

  const result: NormalizedCheck[] = [];
  for (const raw of checks as unknown[]) {
    if (!raw || typeof raw !== "object") continue;
    const c = raw as Record<string, unknown>;

    // v3 form
    if (typeof c.kind === "string") {
      result.push({
        kind: V3_KIND_FALLBACK[c.kind] ?? c.kind,
        value: c.value,
        minimum: c.value as number | undefined,
        maximum: c.value as number | undefined,
        inclusive: c.inclusive as boolean | undefined,
        regex: c.regex as RegExp | undefined,
      });
      continue;
    }

    // v4 form
    if (c._zod && typeof c._zod === "object") {
      const zod = c._zod as Record<string, unknown>;
      if (!zod.def || typeof zod.def !== "object") continue;
      const checkDef = zod.def as Record<string, unknown>;
      const checkType = checkDef.check as string | undefined;
      if (!checkType) continue;

      // string_format: kind comes from `format` field
      if (checkType === "string_format") {
        const format = (checkDef.format as string) || "format";
        result.push({
          kind: format,
          value: undefined,
          regex: checkDef.pattern as RegExp | undefined,
        });
        continue;
      }

      // number_format: map format name to kind
      if (checkType === "number_format") {
        const format = (checkDef.format as string) || "";
        result.push({
          kind: V4_NUMBER_FORMAT_MAP[format] || format || "int",
          value: undefined,
        });
        continue;
      }

      const mapped = V4_KIND_MAP[checkType] ?? checkType;
      result.push({
        kind: mapped,
        value: checkDef.value,
        minimum: checkDef.minimum as number | undefined,
        maximum: checkDef.maximum as number | undefined,
        inclusive: checkDef.inclusive as boolean | undefined,
        regex: checkDef.pattern as RegExp | undefined,
      });
      continue;
    }
  }
  return result;
}

/**
 * Object behavior normalization.
 *
 * v3 uses `unknownKeys: 'strip' | 'strict' | 'passthrough'` plus an
 * optional `catchall` (defaults to ZodNever, which adapter reports as
 * type 'never').
 *
 * v4 has no `unknownKeys`; behavior is encoded entirely in `catchall`:
 *   - undefined/missing -> strip
 *   - ZodNever          -> strict
 *   - ZodUnknown        -> passthrough
 *   - anything else     -> strip + emit .catchall(T)
 *
 * `adapter` is passed in so we can resolve the catchall schema's type
 * without forcing this module to know Zod internals.
 */
export interface NormalizedObjectMode {
  unknownMode: "strip" | "strict" | "passthrough";
  /** Present when a non-default catchall should be emitted (otherwise undefined). */
  catchall?: unknown;
}

export function normalizeObjectMode(
  def: Record<string, unknown> | undefined,
  adapter: {
    isZodSchema(v: unknown): boolean;
    getType(v: unknown): string | undefined;
  },
): NormalizedObjectMode {
  if (!def) return { unknownMode: "strip" };

  const catchallRaw = def.catchall;
  let catchallType: string | undefined;
  if (catchallRaw && adapter.isZodSchema(catchallRaw)) {
    catchallType = adapter.getType(catchallRaw);
  }

  // v3 form
  if (def.unknownKeys !== undefined) {
    const isPassthrough = def.unknownKeys === "passthrough";
    const isStrict = def.unknownKeys === "strict";
    let unknownMode: "strip" | "strict" | "passthrough" = "strip";
    if (isPassthrough) unknownMode = "passthrough";
    else if (isStrict) unknownMode = "strict";

    // v3: catchall defaults to ZodNever (type 'never'). Only surface it
    // when it's something else.
    if (catchallRaw && catchallType && catchallType !== "never") {
      return { unknownMode, catchall: catchallRaw };
    }
    return { unknownMode };
  }

  // v4 form: derive from catchall type
  if (catchallType === "unknown") return { unknownMode: "passthrough" };
  if (catchallType === "never") return { unknownMode: "strict" };
  if (catchallRaw) return { unknownMode: "strip", catchall: catchallRaw };
  return { unknownMode: "strip" };
}

/**
 * Extract a shape object from an object def. v3 has shape as a function,
 * v4 stores it directly. Returns undefined if not resolvable.
 */
export function resolveShape(
  def: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!def) return undefined;
  let shape = def.shape as unknown;
  if (typeof shape === "function") {
    try {
      shape = (shape as () => Record<string, unknown>)();
    } catch {
      return undefined;
    }
  }
  if (shape && typeof shape === "object") {
    return shape as Record<string, unknown>;
  }
  return undefined;
}

/**
 * v3 wraps some scalar defaults in `{ value, message }`; unwrap when
 * present. Used by array/set constraint extraction.
 */
export function unwrapValue(v: unknown): {
  value: number | undefined;
  wasWrapped: boolean;
} {
  if (v && typeof v === "object" && "value" in v) {
    return {
      value: (v as { value: number }).value,
      wasWrapped: true,
    };
  }
  return { value: v as number | undefined, wasWrapped: false };
}
