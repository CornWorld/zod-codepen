/**
 * Zod intermediate representation (IR) nodes.
 *
 * IR sits between version-specific Zod schema objects (v3/v4) and the final
 * TypeScript code string. Two casters feed IR:
 *   - castFromZod(): runtime Zod object -> IR (implemented this round)
 *   - castFromAst(): static AST source -> IR
 *
 * Design constraints:
 *   - Pure data, no behavior. All rendering lives in codegen.
 *   - Version-agnostic. v3/v4 differences are normalized at cast time and
 *     never re-emerge here.
 *   - Order-sensitive. Modifier chains and constraint chains preserve
 *     wrapping order (innermost first).
 */

export type PrimitiveName =
  | "string"
  | "number"
  | "bigint"
  | "date"
  | "boolean"
  | "symbol"
  | "null"
  | "undefined"
  | "any"
  | "unknown"
  | "never"
  | "void"
  | "nan";

/**
 * Which kind of Zod construct a constraint applies to. Drives codegen
 * (e.g. `.length()` is valid on string/array/set but spelled the same).
 */
export type ConstraintTarget =
  | "string"
  | "number"
  | "bigint"
  | "array"
  | "date"
  | "set";

/**
 * Normalized constraint parameters. All v3/v4 specific shapes are flattened
 * to this at cast time.
 */
export interface ConstraintParams {
  value?: unknown;
  minimum?: number | bigint;
  maximum?: number | bigint;
  inclusive?: boolean;
  regex?: RegExp;
}

/**
 * A single constraint detached from a primitive/array/set node.
 *
 * `name` follows the existing NormalizedCheck.kind vocabulary (min, max,
 * length, email, url, int, regex, ...) so codegen can reuse the existing
 * switch logic verbatim.
 */
export interface ConstraintNode {
  readonly kind: "constraint";
  target: ConstraintTarget;
  name: string;
  params: ConstraintParams;
}

/**
 * A single modifier wrapping an inner node. Order matters: in
 * `.optional().default(x)`, optional is inner; the array order is
 * [optional, default].
 *
 * `value` is the resolved literal (v3 default() functions are called at
 * cast time when their return is primitive). `placeholder` is used when
 * the value can't be reconstructed (e.g. catch() that throws).
 */
export type ModifierName =
  | "optional"
  | "nullable"
  | "nullish"
  | "default"
  | "catch"
  | "brand"
  | "readonly"
  | "prefault";

export interface ModifierNode {
  readonly kind: "modifier";
  name: ModifierName;
  value?: unknown;
  placeholder?: string;
}

/**
 * A primitive node plus its ordered constraint chain. Coerce flag carries
 * the `z.coerce.X()` form.
 */
export interface PrimitiveNode {
  readonly kind: "primitive";
  primitive: PrimitiveName;
  coerce?: boolean;
  constraints: ConstraintNode[];
}

/**
 * A wrapper that applies an ordered list of modifiers to an inner node.
 * This is how `.optional().default(x)` is expressed: inner = base schema,
 * modifiers = [optional, default]. Codegen walks the array in order.
 *
 * Constraints are NOT mixed in here; they live on the PrimitiveNode itself
 * because constraint chaining only applies to primitives/arrays/sets.
 */
export interface ModifiedNode {
  readonly kind: "modified";
  inner: IRNode;
  modifiers: ModifierNode[];
}

export interface LiteralNode {
  readonly kind: "literal";
  value: unknown;
}

export interface EnumNode {
  readonly kind: "enum";
  variant: "enum" | "nativeEnum";
  values: string[];
  /** For nativeEnum, the original object so codegen can emit a comment. */
  nativeSource?: unknown;
  /** v4-style discriminator-aware union flag. */
  discriminator?: string;
  /** When discriminator is set, the option IR nodes (z.object(...) each). */
  options?: IRNode[];
}

export interface ArrayNode {
  readonly kind: "array";
  element: IRNode;
  constraints: ConstraintNode[];
}

export interface ObjectField {
  key: string;
  value: IRNode;
}

export type ObjectUnknownMode = "strip" | "strict" | "passthrough";

export interface ObjectNode {
  readonly kind: "object";
  fields: ObjectField[];
  unknownMode: ObjectUnknownMode;
  catchall?: IRNode;
}

export interface TupleNode {
  readonly kind: "tuple";
  items: IRNode[];
  rest?: IRNode;
}

export interface RecordNode {
  readonly kind: "record";
  key: IRNode;
  value: IRNode;
}

export interface MapNode {
  readonly kind: "map";
  key: IRNode;
  value: IRNode;
}

export interface SetNode {
  readonly kind: "set";
  element: IRNode;
  constraints: ConstraintNode[];
}

export interface UnionNode {
  readonly kind: "union";
  options: IRNode[];
  /** When set, emit `z.discriminatedUnion(disc, [...])` instead of `z.union([...])`. */
  discriminator?: string;
}

export interface IntersectionNode {
  readonly kind: "intersection";
  left: IRNode;
  right: IRNode;
}

/**
 * Opaque function payload. Purity analysis lives at cast time, not here.
 *
 * - `mode: 'placeholder'`: emit a placeholder body like `(x) => x` with
 *   a trailing comment (current main branch behavior; the only mode main
 *   supports).
 * - `mode: 'inline'`: emit `source` verbatim (corresponds to
 *   `serializeFunctions: true` on wip).
 * - `mode: 'marked'`: emit `// @zod-codepen-impure {...}` marker + placeholder
 *   (corresponds to `serializeFunctions: 'marked'` on wip).
 *
 * `source`/`vars` only populated for non-placeholder modes. The 'marked'
 * mode is included in the type for forward compatibility, but main-branch
 * cast only ever produces 'placeholder'.
 */
export type FunctionUsage =
  | "transform"
  | "refine"
  | "preprocess"
  | "function-args"
  | "function-returns";
export type FunctionMode = "placeholder" | "inline" | "marked";

export interface FunctionNode {
  readonly kind: "function";
  usage: FunctionUsage;
  mode: FunctionMode;
  source?: string;
  vars?: string[];
}

export interface TransformNode {
  readonly kind: "transform";
  inner: IRNode;
  fn: FunctionNode;
}

export interface RefineNode {
  readonly kind: "refine";
  inner: IRNode;
  fn: FunctionNode;
}

export interface PreprocessNode {
  readonly kind: "preprocess";
  inner: IRNode;
  fn: FunctionNode;
}

export interface PipeNode {
  readonly kind: "pipe";
  in: IRNode;
  out: IRNode;
}

/**
 * z.function(args, returns). `args` is the tuple items (or empty), `returns`
 * is omitted when it would be `z.unknown()` (the Zod default).
 */
export interface ZodFunctionNode {
  readonly kind: "zod-function";
  args: IRNode[];
  returns?: IRNode;
}

export interface LazyNode {
  readonly kind: "lazy";
  /** When true, emit the standard z.lazy(() => ...) circular-reference placeholder. */
  placeholder: boolean;
  inner?: IRNode;
}

export interface PromiseNode {
  readonly kind: "promise";
  inner: IRNode;
}

/**
 * Sentinel for schemas that failed to cast. Renders as a comment + z.any().
 * Carries the original type name so codegen can emit a helpful comment.
 */
export interface FallbackNode {
  readonly kind: "fallback";
  reason: "not-a-zod-schema" | "unknown-type" | "unhandled";
  detail?: string;
}

/**
 * Escape hatch for schemas whose shape doesn't yet map cleanly to a typed
 * IR node. Carries a pre-rendered code string plus the reason it was
 * diverted. Codegen emits the string verbatim.
 *
 * This exists so the IR can ship incrementally: when a v3/v4 topology
 * difference doesn't fit any current node type, we don't block the whole
 * pipeline — we emit RawNode and revisit later. The `reason` field makes
 * it easy to grep for places that still need a proper IR node.
 */
export interface RawNode {
  readonly kind: "raw";
  code: string;
  reason: string;
  /** Original Zod schema, kept for debugging and future upgrades. */
  original?: unknown;
}

export type IRNode =
  | PrimitiveNode
  | ModifiedNode
  | LiteralNode
  | EnumNode
  | ArrayNode
  | ObjectNode
  | TupleNode
  | RecordNode
  | MapNode
  | SetNode
  | UnionNode
  | IntersectionNode
  | TransformNode
  | RefineNode
  | PreprocessNode
  | PipeNode
  | ZodFunctionNode
  | LazyNode
  | PromiseNode
  | FallbackNode
  | RawNode;
