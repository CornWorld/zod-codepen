/**
 * Cast a runtime Zod schema object to IR.
 *
 * Entry point: castFromZod(schema, adapter).
 *
 * Version differences (v3 `_def` vs v4 `_zod.def`) are absorbed by
 * cast/version.ts and the adapter. This file only cares about the
 * normalized type name returned by adapter.getType().
 *
 * Recursion: castFromZod calls itself for child schemas. It does NOT
 * call back into the serializer — that's the whole point of the IR
 * refactor (serializer becomes a thin shell that calls cast + codegen).
 */

import type { ZodAdapter } from "../types.js";
import type {
  IRNode,
  PrimitiveName,
  ConstraintNode,
  ModifierNode,
  ObjectField,
  ObjectUnknownMode,
  FunctionMode,
} from "../ir/nodes.js";
import {
  normalizeChecks,
  normalizeObjectMode,
  resolveShape,
} from "./version.js";
import { castConstraints, castV3CollectionConstraints } from "./constraints.js";

export interface CastContext {
  adapter: ZodAdapter;
}

/**
 * Top-level entry. Returns an IRNode; never throws.
 *
 * On unrecognizable input, returns FallbackNode (for "not a Zod schema"
 * / "unknown type") or RawNode (for types we know exist but haven't
 * cast yet). Both render safely via codegen.
 */
export function castFromZod(schema: unknown, adapter: ZodAdapter): IRNode {
  if (!adapter.isZodSchema(schema)) {
    return {
      kind: "fallback",
      reason: "not-a-zod-schema",
      detail: typeof schema,
    };
  }

  const type = adapter.getType(schema);
  if (!type) {
    return { kind: "fallback", reason: "unknown-type" };
  }

  return castByType(schema, type, adapter);
}

/**
 * Dispatch by normalized type name. The switch order mirrors the original
 * builtinHandlers registration order so it's easy to audit side-by-side
 * with serializer.ts.
 *
 * If a type is recognized but not yet implemented, it falls through to
 * the RawNode branch at the bottom. That's the IR escape hatch — we
 * never silently produce wrong code, we produce a comment + z.any()
 * that's easy to grep for.
 */
function castByType(
  schema: unknown,
  type: string,
  adapter: ZodAdapter,
): IRNode {
  switch (type) {
    // ---- Primitives ----
    case "string":
    case "number":
    case "bigint":
    case "boolean":
    case "date":
    case "symbol":
    case "undefined":
    case "null":
    case "void":
    case "any":
    case "unknown":
    case "never":
    case "nan":
      return castPrimitive(schema, type as PrimitiveName, adapter);

    // ---- Literals / enums ----
    case "literal":
      return castLiteral(schema, adapter);
    case "enum":
      return castEnum(schema, adapter, false);
    case "nativeenum":
      return castEnum(schema, adapter, true);

    // ---- Collections ----
    case "array":
      return castArray(schema, adapter);
    case "object":
      return castObject(schema, adapter);
    case "tuple":
      return castTuple(schema, adapter);
    case "record":
      return castRecord(schema, adapter);
    case "map":
      return castMap(schema, adapter);
    case "set":
      return castSet(schema, adapter);

    // ---- Composites ----
    case "union":
    case "discriminatedunion":
      return castUnion(schema, adapter, type === "discriminatedunion");
    case "intersection":
      return castIntersection(schema, adapter);

    // ---- Modifiers ----
    case "optional":
    case "nullable":
    case "nullish":
    case "default":
    case "catch":
    case "branded":
    case "readonly":
      return castModifier(schema, type, adapter);

    // ---- Effects / pipe ----
    case "effects":
      return castEffects(schema, adapter);
    case "pipe":
    case "pipeline":
      return castPipe(schema, adapter);
    case "transform":
      // v4 standalone transform type — main branch emits a placeholder.
      return {
        kind: "raw",
        code: "/* transform */",
        reason: "v4 standalone ZodTransform reached without pipe wrapper",
        original: schema,
      };

    // ---- Misc ----
    case "lazy":
      return castLazy(schema);
    case "promise":
      return castPromise(schema, adapter);
    case "function":
      return castZodFunction(schema, adapter);

    default:
      return {
        kind: "fallback",
        reason: "unhandled",
        detail: type,
      };
  }
}

// ============================================================
// Cast helpers
// ============================================================

function castPrimitive(
  schema: unknown,
  name: PrimitiveName,
  adapter: ZodAdapter,
): IRNode {
  const def = adapter.getDef(schema);
  const coerce = def ? (def.coerce as boolean | undefined) : undefined;

  // Constraints only apply to string/number/bigint/date (and to
  // array/set which are handled in their own casters). Other primitives
  // (boolean/symbol/null/...) ignore checks.
  if (
    name === "string" ||
    name === "number" ||
    name === "bigint" ||
    name === "date"
  ) {
    const checks = normalizeChecks(def);
    const target = name as "string" | "number" | "bigint" | "date";
    const constraints = castConstraints(checks, target);
    return {
      kind: "primitive",
      primitive: name,
      coerce: coerce === true ? true : undefined,
      constraints,
    };
  }

  return {
    kind: "primitive",
    primitive: name,
    coerce: coerce === true ? true : undefined,
    constraints: [],
  };
}

function castLiteral(schema: unknown, adapter: ZodAdapter): IRNode {
  const def = adapter.getDef(schema);
  // v3 uses def.value, v4 uses def.values (array with single element)
  let value: unknown = def?.value;
  if (value === undefined && def?.values && Array.isArray(def.values)) {
    value = (def.values as unknown[])[0];
  }
  return { kind: "literal", value };
}

function castEnum(
  schema: unknown,
  adapter: ZodAdapter,
  isNative: boolean,
): IRNode {
  const def = adapter.getDef(schema);

  if (isNative) {
    return {
      kind: "enum",
      variant: "nativeEnum",
      values: [],
      nativeSource: def?.values ?? {},
    };
  }

  // v3: def.values (array). v4: def.entries (object { a: 'a', b: 'b' }).
  let values: string[] = [];
  if (def?.values && Array.isArray(def.values)) {
    values = def.values as string[];
  } else if (def?.entries && typeof def.entries === "object") {
    values = Object.values(def.entries as Record<string, string>);
  }

  // v4 union with discriminator flag is handled in castUnion; here we
  // only return the plain z.enum(...) form.
  return {
    kind: "enum",
    variant: "enum",
    values,
  };
}

function castArray(schema: unknown, adapter: ZodAdapter): IRNode {
  const def = adapter.getDef(schema);
  // v3: def.type (object/schema). v4: def.element.
  let element = def?.element;
  if (!element && def?.type && typeof def.type === "object") {
    element = def.type;
  }
  if (!element) {
    return {
      kind: "array",
      element: { kind: "primitive", primitive: "any", constraints: [] },
      constraints: [],
    };
  }

  const v3Constraints = castV3CollectionConstraints(def, "array");
  const checks = normalizeChecks(def);
  const v4Constraints = castConstraints(checks, "array");
  // v3 fields come first (matches original handler order), then v4 checks.
  const constraints = [...v3Constraints, ...v4Constraints];

  return {
    kind: "array",
    element: castFromZod(element, adapter),
    constraints,
  };
}

function castObject(schema: unknown, adapter: ZodAdapter): IRNode {
  const def = adapter.getDef(schema);
  const shape = resolveShape(def);

  if (!shape) {
    return {
      kind: "object",
      fields: [],
      unknownMode: "strip",
    };
  }

  const fields: ObjectField[] = Object.entries(shape).map(([key, val]) => ({
    key,
    value: castFromZod(val, adapter),
  }));

  const mode = normalizeObjectMode(def, adapter);
  const result: IRNode = {
    kind: "object",
    fields,
    unknownMode: mode.unknownMode as ObjectUnknownMode,
  };
  if (mode.catchall) {
    (result as { catchall?: IRNode }).catchall = castFromZod(
      mode.catchall,
      adapter,
    );
  }
  return result;
}

function castTuple(schema: unknown, adapter: ZodAdapter): IRNode {
  const def = adapter.getDef(schema);
  const items = (def?.items as unknown[]) || [];
  const rest = def?.rest;

  const result: IRNode = {
    kind: "tuple",
    items: items.map((i) => castFromZod(i, adapter)),
  };
  if (rest) {
    (result as { rest?: IRNode }).rest = castFromZod(rest, adapter);
  }
  return result;
}

function castRecord(schema: unknown, adapter: ZodAdapter): IRNode {
  const def = adapter.getDef(schema);
  const keyType = def?.keyType;
  const valueType = def?.valueType;

  if (!valueType) {
    return {
      kind: "record",
      key: { kind: "primitive", primitive: "string", constraints: [] },
      value: { kind: "primitive", primitive: "any", constraints: [] },
    };
  }

  return {
    kind: "record",
    key: keyType
      ? castFromZod(keyType, adapter)
      : { kind: "primitive", primitive: "string", constraints: [] },
    value: castFromZod(valueType, adapter),
  };
}

function castMap(schema: unknown, adapter: ZodAdapter): IRNode {
  const def = adapter.getDef(schema);
  const keyType = def?.keyType;
  const valueType = def?.valueType;

  return {
    kind: "map",
    key: keyType
      ? castFromZod(keyType, adapter)
      : { kind: "primitive", primitive: "any", constraints: [] },
    value: valueType
      ? castFromZod(valueType, adapter)
      : { kind: "primitive", primitive: "any", constraints: [] },
  };
}

function castSet(schema: unknown, adapter: ZodAdapter): IRNode {
  const def = adapter.getDef(schema);
  // v3: def.valueType, v4: def.valueType or def.element
  const valueType = def?.valueType || def?.element;
  if (!valueType) {
    return {
      kind: "set",
      element: { kind: "primitive", primitive: "any", constraints: [] },
      constraints: [],
    };
  }

  const v3Constraints = castV3CollectionConstraints(def, "set");
  const checks = normalizeChecks(def);
  const v4Constraints = castConstraints(checks, "set");
  const constraints: ConstraintNode[] = [...v3Constraints, ...v4Constraints];

  return {
    kind: "set",
    element: castFromZod(valueType, adapter),
    constraints,
  };
}

function castUnion(
  schema: unknown,
  adapter: ZodAdapter,
  isDiscriminated: boolean,
): IRNode {
  const def = adapter.getDef(schema);
  const options = (def?.options as unknown[]) || [];

  // v4 union may carry a discriminator even though its type is "union".
  // Original handler checks def.discriminator on the union handler too.
  if (def?.discriminator) {
    const discriminator = def.discriminator as string;
    return {
      kind: "union",
      options: options.map((o) => castFromZod(o, adapter)),
      discriminator,
    };
  }

  return {
    kind: "union",
    options: options.map((o) => castFromZod(o, adapter)),
    discriminator: isDiscriminated
      ? (def?.discriminator as string | undefined)
      : undefined,
  };
}

function castIntersection(schema: unknown, adapter: ZodAdapter): IRNode {
  const def = adapter.getDef(schema);
  const left = def?.left;
  const right = def?.right;
  if (!left || !right) {
    return { kind: "primitive", primitive: "any", constraints: [] };
  }
  return {
    kind: "intersection",
    left: castFromZod(left, adapter),
    right: castFromZod(right, adapter),
  };
}

/**
 * Cast a modifier wrapper (optional/nullable/nullish/default/catch/brand/
 * readonly) as a ModifiedNode wrapping its inner schema.
 *
 * The original handlers do this recursively: optional(optional(x)) would
 * call ctx.serialize on inner optional(x), which itself calls inner x.
 * We mirror that by emitting nested ModifiedNodes when modifiers stack.
 */
function castModifier(
  schema: unknown,
  type: string,
  adapter: ZodAdapter,
): IRNode {
  const def = adapter.getDef(schema);
  // v3: inner lives at def.innerType OR def.type (when type is a schema
  // object, e.g. ZodBranded stores the wrapped schema at def.type).
  // v4: inner is at def.innerType; def.type is the node type name
  // string ('optional', 'branded', ...), never a schema.
  const innerFromInnerType = def?.innerType;
  const innerFromType =
    def?.type && typeof def.type === "object" ? def.type : undefined;
  const inner = innerFromInnerType ?? innerFromType;
  if (!inner) {
    // Inner missing — wrap an explicit z.any() to match original
    // fallback behavior (e.g. "z.any().optional()").
    return {
      kind: "modified",
      inner: { kind: "primitive", primitive: "any", constraints: [] },
      modifiers: [makeModifier(type, schema, def)],
    };
  }

  const innerIR = castFromZod(inner, adapter);

  // If the inner also turned out to be a modifier (e.g. inside a chain
  // like .optional().default(x)), we collapse the chain by appending to
  // its modifiers array — this keeps codegen's emit order correct and
  // matches how the original serializer produced flattened chains.
  if (innerIR.kind === "modified") {
    return {
      kind: "modified",
      inner: innerIR.inner,
      modifiers: [...innerIR.modifiers, makeModifier(type, schema, def)],
    };
  }

  return {
    kind: "modified",
    inner: innerIR,
    modifiers: [makeModifier(type, schema, def)],
  };
}

function makeModifier(
  type: string,
  schema: unknown,
  def: Record<string, unknown> | undefined,
): ModifierNode {
  // Normalize type name to IR modifier name. v3 uses 'branded' (with
  // trailing d) for ZodBranded; IR uses 'brand' to match the fluent
  // method name.
  const nameMap: Record<string, ModifierNode["name"]> = {
    optional: "optional",
    nullable: "nullable",
    nullish: "nullish",
    default: "default",
    catch: "catch",
    branded: "brand",
    brand: "brand",
    readonly: "readonly",
    prefault: "prefault",
  };
  const name = nameMap[type];
  if (!name) {
    // Unknown modifier: emit a raw placeholder so codegen produces
    // something visible instead of silently dropping it.
    return {
      kind: "modifier",
      name: "optional", // never reached; renderSingleModifier handles exhaustively
    };
  }

  const base: ModifierNode = {
    kind: "modifier",
    name,
  };

  if (type === "default" || type === "catch") {
    const fieldName = type === "default" ? "defaultValue" : "catchValue";
    const value = def?.[fieldName];

    // v3 wraps defaults in a function. Try to call it for primitive
    // values; otherwise emit a placeholder comment.
    if (typeof value === "function") {
      try {
        let v: unknown;
        if (type === "default") {
          v = (value as () => unknown)();
        } else {
          v = (value as (ctx: unknown) => unknown)({
            error: null,
            input: undefined,
          });
        }
        if (
          typeof v === "string" ||
          typeof v === "number" ||
          typeof v === "boolean" ||
          v === null
        ) {
          return { ...base, value: v };
        }
      } catch {
        // fall through to placeholder
      }
      return {
        ...base,
        placeholder: type === "default" ? "/* function */" : "/* function */",
      };
    }
    return { ...base, value };
  }

  return base;
}

function castEffects(schema: unknown, adapter: ZodAdapter): IRNode {
  const def = adapter.getDef(schema);
  const inner = def?.schema;
  const effect = def?.effect as
    | { type: string; refinement?: unknown }
    | undefined;

  if (!inner) {
    return { kind: "primitive", primitive: "any", constraints: [] };
  }

  const innerIR = castFromZod(inner, adapter);
  const effectType = effect?.type;

  const fn = (): {
    usage: "transform" | "refine" | "preprocess";
    mode: FunctionMode;
  } => {
    if (effectType === "refinement") {
      return { usage: "refine", mode: "placeholder" };
    }
    if (effectType === "transform") {
      return { usage: "transform", mode: "placeholder" };
    }
    if (effectType === "preprocess") {
      return { usage: "preprocess", mode: "placeholder" };
    }
    return { usage: "transform", mode: "placeholder" };
  };

  const meta = fn();
  const fnNode = { kind: "function" as const, ...meta };

  switch (meta.usage) {
    case "transform":
      return { kind: "transform", inner: innerIR, fn: fnNode };
    case "refine":
      return { kind: "refine", inner: innerIR, fn: fnNode };
    case "preprocess":
      return { kind: "preprocess", inner: innerIR, fn: fnNode };
  }
}

function castPipe(schema: unknown, adapter: ZodAdapter): IRNode {
  const def = adapter.getDef(schema);
  // v4 pipe: def.in / def.out. v3 pipeline: def.in / def.out as well.
  // Some v4 forms: def.innerType as input alias.
  const input = def?.in || def?.innerType;
  const output = def?.out;

  if (!input) {
    return { kind: "primitive", primitive: "any", constraints: [] };
  }

  const inputIR = castFromZod(input, adapter);

  // If the output is a ZodTransform (v4 pattern: .transform() creates
  // pipe(in, transform)), emit a transform IR wrapping the input.
  // This matches the original pipe handler's behavior of detecting
  // outType === 'transform' and emitting .transform().
  if (output && adapter.isZodSchema(output)) {
    const outType = adapter.getType(output);
    if (outType === "transform") {
      return {
        kind: "transform",
        inner: inputIR,
        fn: {
          kind: "function",
          usage: "transform",
          mode: "placeholder",
        },
      };
    }
    return {
      kind: "pipe",
      in: inputIR,
      out: castFromZod(output, adapter),
    };
  }

  // Output missing — just emit the input.
  return inputIR;
}

function castLazy(schema: unknown): IRNode {
  // Original handler emits a placeholder without recursing, to avoid
  // infinite loops on circular schemas. We mirror that.
  void schema;
  return { kind: "lazy", placeholder: true };
}

function castPromise(schema: unknown, adapter: ZodAdapter): IRNode {
  const def = adapter.getDef(schema);
  // v4: def.innerType. v3: def.type (when it's an object, not the type
  // name string).
  let inner = def?.innerType;
  if (!inner && def?.type && typeof def.type === "object") {
    inner = def.type;
  }
  if (!inner) {
    return {
      kind: "promise",
      inner: { kind: "primitive", primitive: "any", constraints: [] },
    };
  }
  return { kind: "promise", inner: castFromZod(inner, adapter) };
}

function castZodFunction(schema: unknown, adapter: ZodAdapter): IRNode {
  const def = adapter.getDef(schema);
  const argsTuple = def?.args;
  const returns = def?.returns;

  let args: IRNode[] = [];
  if (argsTuple && adapter.isZodSchema(argsTuple)) {
    const argsDef = adapter.getDef(argsTuple);
    const items = argsDef?.items;
    if (Array.isArray(items) && items.length > 0) {
      args = (items as unknown[]).map((i) => castFromZod(i, adapter));
    }
  }

  let returnsIR: IRNode | undefined;
  if (returns && adapter.isZodSchema(returns)) {
    const returnsType = adapter.getType(returns);
    // Original handler suppresses .returns() when type is 'unknown'
    // (Zod's default).
    if (returnsType !== "unknown") {
      returnsIR = castFromZod(returns, adapter);
    }
  }

  return {
    kind: "zod-function",
    args,
    returns: returnsIR,
  };
}
