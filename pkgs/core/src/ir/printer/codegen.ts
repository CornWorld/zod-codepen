/**
 * IR -> TypeScript code string.
 *
 * Pure function: no Zod knowledge, no version branching. All it does is
 * render IRNode trees with the given options. Indentation context is
 * threaded through options.indentLevel.
 *
 * Optimization switches (semanticMethods, scientificNotation) are read
 * from options but most are intentionally inert in this initial pass;
 * they get wired up in the optimization step.
 */

import type {
  IRNode,
  ConstraintNode,
  ModifierNode,
  ObjectField,
  PrimitiveName,
} from "../nodes.js";
import { formatNumber, formatBigInt } from "../../number-formatter.js";

export interface CodegenOptions {
  indent: string;
  indentLevel: number;
  format: boolean;
  optimizations: {
    semanticMethods: boolean;
    scientificNotation: boolean;
  };
}

const IDENT_RE = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/;

function quoteKey(key: string): string {
  return IDENT_RE.test(key) ? key : JSON.stringify(key);
}

function renderLiteralArg(value: unknown): string {
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return String(value);
  if (typeof value === "bigint") return `${value}n`;
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  return JSON.stringify(value);
}

function renderRegex(regex: RegExp | undefined): string {
  if (!regex || typeof regex.toString !== "function") return "";
  return regex.toString();
}

/**
 * Render a primitive base name, honoring coerce.
 */
function renderPrimitiveBase(node: {
  primitive: PrimitiveName;
  coerce?: boolean;
}): string {
  const name = node.primitive;
  if (node.coerce && canCoerce(name)) {
    return `z.coerce.${name}()`;
  }
  return `z.${name}()`;
}

function canCoerce(name: PrimitiveName): boolean {
  return (
    name === "string" ||
    name === "number" ||
    name === "boolean" ||
    name === "bigint" ||
    name === "date"
  );
}

/**
 * Render a constraint chain appended to a base string. Constraints are
 * applied in order. For string/number/bigint the semantic-method and
 * scientific-notation optimizations kick in here.
 */
function renderConstraints(
  base: string,
  constraints: ConstraintNode[],
  opts: CodegenOptions,
): string {
  let result = base;
  for (const c of constraints) {
    result += renderSingleConstraint(c, constraints, opts);
  }
  return result;
}

function renderSingleConstraint(
  c: ConstraintNode,
  allConstraints: ConstraintNode[],
  opts: CodegenOptions,
): string {
  const { semanticMethods } = opts.optimizations;

  const numericValue = (): number | bigint | undefined => {
    const v = c.params.value ?? c.params.minimum ?? c.params.maximum;
    return v as number | bigint | undefined;
  };

  switch (c.name) {
    case "min":
      return renderMinConstraint(c, numericValue(), allConstraints, opts);
    case "max":
      return renderMaxConstraint(c, numericValue(), allConstraints, opts);
    case "length":
      return `.length(${c.params.value})`;
    case "size":
      return `.size(${c.params.value})`;
    case "multipleOf":
      return renderMultipleOf(numericValue(), opts);
    case "int":
      return ".int()";
    case "finite":
      return ".finite()";
    case "safe":
      // safe() is emitted at the max position when combined with a
      // matching min; this standalone form is unreachable from cast
      // today (cast always produces paired min+max). Kept for safety.
      return ".safe()";
    case "email":
    case "url":
    case "uuid":
    case "cuid":
    case "cuid2":
    case "ulid":
    case "nanoid":
    case "datetime":
    case "ip":
    case "date":
    case "time":
    case "duration":
      return `.${c.name}()`;
    case "regex":
      return `.regex(${renderRegex(c.params.regex)})`;
    case "startsWith":
      return `.startsWith(${JSON.stringify(c.params.value)})`;
    case "endsWith":
      return `.endsWith(${JSON.stringify(c.params.value)})`;
    case "includes":
      return `.includes(${JSON.stringify(c.params.value)})`;
    case "trim":
      return ".trim()";
    case "toLowerCase":
      return ".toLowerCase()";
    case "toUpperCase":
      return ".toUpperCase()";
    case "normalize":
      return ".normalize()";
    case "positive":
      return semanticMethods ? ".positive()" : renderMinFallback(c);
    case "negative":
      return semanticMethods ? ".negative()" : renderMaxFallback(c);
    case "nonnegative":
      return semanticMethods ? ".nonnegative()" : renderMinFallback(c);
    case "nonpositive":
      return semanticMethods ? ".nonpositive()" : renderMaxFallback(c);
    default:
      return "";
  }
}

function renderMinFallback(c: ConstraintNode): string {
  const v = c.params.value ?? c.params.minimum;
  // No value (e.g. AST cast of bare .positive()) — fall back to semantic
  // method. This mirrors how Zod's own API surfaces these constraints.
  if (v === undefined) {
    if (c.name === "positive") return ".positive()";
    if (c.name === "nonnegative") return ".nonnegative()";
    return ".min()";
  }
  return `.min(${renderNumeric(v)})`;
}
function renderMaxFallback(c: ConstraintNode): string {
  const v = c.params.value ?? c.params.maximum;
  if (v === undefined) {
    if (c.name === "negative") return ".negative()";
    if (c.name === "nonpositive") return ".nonpositive()";
    return ".max()";
  }
  return `.max(${renderNumeric(v)})`;
}

function renderNumeric(value: unknown): string {
  if (typeof value === "bigint") return `${value}n`;
  return String(value);
}

function renderMinConstraint(
  c: ConstraintNode,
  value: number | bigint | undefined,
  all: ConstraintNode[],
  opts: CodegenOptions,
): string {
  const { semanticMethods, scientificNotation } = opts.optimizations;

  // Numeric semantic matches
  if (semanticMethods && c.target === "number" && value === 0) {
    if (c.params.inclusive === false) return ".positive()";
    if (c.params.inclusive === true) return ".nonnegative()";
  }
  if (semanticMethods && c.target === "bigint" && value === 0n) {
    if (c.params.inclusive === false) return ".positive()";
    if (c.params.inclusive === true) return ".nonnegative()";
  }

  // safe() combination: when min is MIN_SAFE_INTEGER inclusive AND
  // there's a matching MAX_SAFE_INTEGER max inclusive, emit safe() at the
  // max position; suppress this min entirely.
  if (
    semanticMethods &&
    c.target === "number" &&
    value === Number.MIN_SAFE_INTEGER &&
    c.params.inclusive === true &&
    all.some(
      (x) =>
        x.name === "max" &&
        x.target === "number" &&
        (x.params.value ?? x.params.maximum) === Number.MAX_SAFE_INTEGER &&
        x.params.inclusive === true,
    )
  ) {
    return "";
  }

  if (value === undefined) return `.min(${value})`;

  return `.min(${renderValueWithSci(value, scientificNotation)})`;
}

function renderMaxConstraint(
  c: ConstraintNode,
  value: number | bigint | undefined,
  all: ConstraintNode[],
  opts: CodegenOptions,
): string {
  const { semanticMethods, scientificNotation } = opts.optimizations;

  if (semanticMethods && c.target === "number" && value === 0) {
    if (c.params.inclusive === false) return ".negative()";
    if (c.params.inclusive === true) return ".nonpositive()";
  }
  if (semanticMethods && c.target === "bigint" && value === 0n) {
    if (c.params.inclusive === false) return ".negative()";
    if (c.params.inclusive === true) return ".nonpositive()";
  }

  // safe() combination: max position emits safe()
  if (
    semanticMethods &&
    c.target === "number" &&
    value === Number.MAX_SAFE_INTEGER &&
    c.params.inclusive === true &&
    all.some(
      (x) =>
        x.name === "min" &&
        x.target === "number" &&
        (x.params.value ?? x.params.minimum) === Number.MIN_SAFE_INTEGER &&
        x.params.inclusive === true,
    )
  ) {
    return ".safe()";
  }

  if (value === undefined) return `.max(${value})`;

  return `.max(${renderValueWithSci(value, scientificNotation)})`;
}

function renderMultipleOf(
  value: number | bigint | undefined,
  opts: CodegenOptions,
): string {
  if (value === undefined) return `.multipleOf(${value})`;
  return `.multipleOf(${renderValueWithSci(value, opts.optimizations.scientificNotation)})`;
}

/**
 * Format a numeric value, applying scientificNotation when enabled and
 * the formatter supports the value (otherwise fall back to plain string).
 */
function renderValueWithSci(
  value: number | bigint,
  scientificNotation: boolean,
): string {
  if (typeof value === "bigint") {
    return scientificNotation ? formatBigInt(value) : `${value}n`;
  }
  return scientificNotation ? formatNumber(value) : String(value);
}

/**
 * Render a modifier chain. Modifiers wrap an inner node, applied in array
 * order (innermost first, i.e. the order Zod's wrapping methods were called
 * from inside out).
 */
function renderModifiers(inner: string, modifiers: ModifierNode[]): string {
  let result = inner;
  for (const m of modifiers) {
    result += renderSingleModifier(m);
  }
  return result;
}

function renderSingleModifier(m: ModifierNode): string {
  switch (m.name) {
    case "optional":
      return ".optional()";
    case "nullable":
      return ".nullable()";
    case "nullish":
      return ".nullish()";
    case "readonly":
      return ".readonly()";
    case "brand":
      return ".brand()";
    case "default":
      if (m.placeholder !== undefined) return `.default(${m.placeholder})`;
      return `.default(${renderLiteralArg(m.value)})`;
    case "catch":
      if (m.placeholder !== undefined) return `.catch(${m.placeholder})`;
      return `.catch(${renderLiteralArg(m.value)})`;
    case "prefault":
      if (m.placeholder !== undefined) return `.prefault(${m.placeholder})`;
      return `.prefault(${renderLiteralArg(m.value)})`;
  }
}

function renderObjectFields(
  fields: ObjectField[],
  opts: CodegenOptions,
): { open: string; close: string } {
  // Empty object: always single-line `{}`, regardless of format flag.
  // This matches the original handler, which had a dedicated early
  // return for entries.length === 0.
  if (fields.length === 0) {
    return { open: "{}", close: "" };
  }
  if (opts.format) {
    const innerPad = opts.indent.repeat(opts.indentLevel + 1);
    const closePad = opts.indent.repeat(opts.indentLevel);
    const renderedFields = fields.map((f) => {
      const valueStr = codegen(f.value, {
        ...opts,
        indentLevel: opts.indentLevel + 1,
      });
      return `${innerPad}${quoteKey(f.key)}: ${valueStr}`;
    });
    return {
      open: `{\n${renderedFields.join(",\n")},\n${closePad}}`,
      close: "",
    };
  }
  const renderedFields = fields.map((f) => {
    const valueStr = codegen(f.value, {
      ...opts,
      indentLevel: opts.indentLevel + 1,
    });
    return `${quoteKey(f.key)}: ${valueStr}`;
  });
  return { open: `{ ${renderedFields.join(", ")} }`, close: "" };
}

/**
 * Main entry point.
 */
export function codegen(node: IRNode, options: CodegenOptions): string {
  switch (node.kind) {
    case "primitive": {
      const base = renderPrimitiveBase(node);
      return renderConstraints(base, node.constraints, options);
    }

    case "modified": {
      const innerStr = codegen(node.inner, options);
      return renderModifiers(innerStr, node.modifiers);
    }

    case "literal":
      return `z.literal(${renderLiteralArg(node.value)})`;

    case "enum": {
      if (node.variant === "nativeEnum") {
        return `z.nativeEnum(/* native enum */${JSON.stringify(
          node.nativeSource ?? {},
        )})`;
      }
      if (node.discriminator) {
        const optsStr = (node.options ?? [])
          .map((o) => codegen(o, options))
          .join(", ");
        return `z.discriminatedUnion(${JSON.stringify(
          node.discriminator,
        )}, [${optsStr}])`;
      }
      const quoted = node.values.map((v) => JSON.stringify(v));
      return `z.enum([${quoted.join(", ")}])`;
    }

    case "array": {
      const elemStr = codegen(node.element, options);
      const base = `z.array(${elemStr})`;
      return renderConstraints(base, node.constraints, options);
    }

    case "object": {
      const { open } = renderObjectFields(node.fields, options);
      let result = `z.object(${open})`;
      if (node.unknownMode === "passthrough") result += ".passthrough()";
      else if (node.unknownMode === "strict") result += ".strict()";
      if (node.catchall) {
        result += `.catchall(${codegen(node.catchall, options)})`;
      }
      return result;
    }

    case "tuple": {
      const itemsStr = node.items.map((i) => codegen(i, options)).join(", ");
      let result = `z.tuple([${itemsStr}])`;
      if (node.rest) result += `.rest(${codegen(node.rest, options)})`;
      return result;
    }

    case "record":
      return `z.record(${codegen(node.key, options)}, ${codegen(
        node.value,
        options,
      )})`;

    case "map":
      return `z.map(${codegen(node.key, options)}, ${codegen(
        node.value,
        options,
      )})`;

    case "set": {
      const elemStr = codegen(node.element, options);
      const base = `z.set(${elemStr})`;
      return renderConstraints(base, node.constraints, options);
    }

    case "union": {
      if (node.discriminator) {
        const optsStr = (node.options ?? [])
          .map((o) => codegen(o, options))
          .join(", ");
        return `z.discriminatedUnion(${JSON.stringify(
          node.discriminator,
        )}, [${optsStr}])`;
      }
      const optsStr = node.options.map((o) => codegen(o, options)).join(", ");
      return `z.union([${optsStr}])`;
    }

    case "intersection":
      return `z.intersection(${codegen(node.left, options)}, ${codegen(
        node.right,
        options,
      )})`;

    case "transform": {
      const innerStr = codegen(node.inner, options);
      const fnStr = renderFunctionSource(node.fn);
      return `${innerStr}.transform(${fnStr})`;
    }

    case "refine": {
      const innerStr = codegen(node.inner, options);
      const fnStr = renderFunctionSource(node.fn);
      return `${innerStr}.refine(${fnStr})`;
    }

    case "preprocess": {
      const innerStr = codegen(node.inner, options);
      const fnStr = renderFunctionSource(node.fn);
      return `z.preprocess(${fnStr}, ${innerStr})`;
    }

    case "pipe":
      return `${codegen(node.in, options)}.pipe(${codegen(node.out, options)})`;

    case "zod-function": {
      let result = "z.function()";
      if (node.args.length > 0) {
        const argsStr = node.args.map((a) => codegen(a, options)).join(", ");
        result += `.args(${argsStr})`;
      }
      if (node.returns) {
        result += `.returns(${codegen(node.returns, options)})`;
      }
      return result;
    }

    case "lazy":
      if (node.placeholder) {
        return `z.lazy(() => /* circular reference */)`;
      }
      if (node.inner) {
        return `z.lazy(() => ${codegen(node.inner, options)})`;
      }
      return `z.lazy(() => z.any())`;

    case "promise":
      return `z.promise(${codegen(node.inner, options)})`;

    case "fallback": {
      const detail = node.detail ? ` ${node.detail}` : "";
      switch (node.reason) {
        case "not-a-zod-schema":
          return `/* not a zod schema:${detail} */`;
        case "unknown-type":
          return `z.any() /* unknown type${detail} */`;
        case "unhandled":
          return `z.any() /* unhandled type:${detail} */`;
      }
      return "z.any()";
    }

    case "raw":
      return node.code;
  }
}

/**
 * Render a FunctionNode as the source code portion. For placeholder mode
 * (the only mode main-branch cast produces), emit the placeholder bodies
 * that the original handlers used.
 */
function renderFunctionSource(fn: {
  usage:
    | "transform"
    | "refine"
    | "preprocess"
    | "function-args"
    | "function-returns";
  mode: "placeholder" | "inline" | "marked";
  source?: string;
  vars?: string[];
}): string {
  if (fn.mode === "inline" && fn.source) return fn.source;
  if (fn.mode === "marked") {
    // Future-work path; main branch never produces this today.
    const marker = {
      source: fn.source ?? "",
      vars: fn.vars ?? [],
    };
    const body = placeholderBodyFor(fn.usage);
    return `/* @zod-codepen-impure ${JSON.stringify(marker)} */ ${body}`;
  }
  return placeholderBodyFor(fn.usage);
}

function placeholderBodyFor(
  usage:
    | "transform"
    | "refine"
    | "preprocess"
    | "function-args"
    | "function-returns",
): string {
  switch (usage) {
    case "transform":
      return `(x) => x /* transform placeholder */`;
    case "refine":
      return `(x) => true /* refinement placeholder */`;
    case "preprocess":
      return `(x) => x /* preprocess placeholder */`;
    default:
      return `() => undefined`;
  }
}
