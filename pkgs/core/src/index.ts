// Public types
export type {
  SerializeOptions,
  SchemaInfo,
  ZodAdapter,
  SchemaHandler,
  SerializerContext,
} from "./types.js";

export { defaultOptions } from "./types.js";

// Serializer
export { createSerializer, builtinHandlers } from "./serializer.js";

// Numeric formatting helpers
export { formatNumber, formatBigInt } from "./number-formatter.js";

// IR (intermediate representation)
// Exported for downstream tools (e.g. a future static-AST caster that
// wants to feed the same IR pipeline).
export type {
  IRNode,
  PrimitiveName,
  ConstraintTarget,
  ConstraintParams,
  ConstraintNode,
  ModifierNode,
  ModifierName,
  PrimitiveNode,
  ModifiedNode,
  LiteralNode,
  EnumNode,
  ArrayNode,
  ObjectField,
  ObjectUnknownMode,
  ObjectNode,
  TupleNode,
  RecordNode,
  MapNode,
  SetNode,
  UnionNode,
  IntersectionNode,
  FunctionUsage,
  FunctionMode,
  FunctionNode,
  TransformNode,
  RefineNode,
  PreprocessNode,
  PipeNode,
  ZodFunctionNode,
  LazyNode,
  PromiseNode,
  FallbackNode,
  RawNode,
} from "./ir/nodes.js";

// Cast + codegen (for advanced users building custom pipelines)
export { castFromZod } from "./cast/runtime.js";
export type { CastContext } from "./cast/runtime.js";
export { codegen } from "./ir/printer/codegen.js";
export type { CodegenOptions } from "./ir/printer/codegen.js";
