/**
 * Serialization options
 */
export interface SerializeOptions {
  /** Indentation string (default: '  ') */
  indent?: string;
  /** Starting indent level (default: 0) */
  indentLevel?: number;
  /** Whether to format output (default: true) */
  format?: boolean;

  /** Optimization options */
  optimizations?: {
    /** Use semantic methods like .positive() instead of .min(0) (default: true) */
    semanticMethods?: boolean;
    /** Use scientific notation for powers of 2 (default: true) */
    scientificNotation?: boolean;
  };

  /**
   * Function serialization mode
   * - false: Use placeholders (default)
   * - true: Always serialize function bodies
   * - 'auto': Only serialize pure functions (detected via AST analysis)
   * - 'marked': Serialize functions with structured metadata comments for impure ones
   */
  serializeFunctions?: boolean | "auto" | "marked";
}

/**
 * Schema type information extracted from Zod schema
 */
export interface SchemaInfo {
  type: string;
  def?: Record<string, unknown>;

  original?: any;
}

/**
 * Version-specific adapter interface
 */
export interface ZodAdapter {
  /** Get the type name of a schema */
  getType(schema: unknown): string | undefined;
  /** Get the internal definition of a schema */
  getDef(schema: unknown): Record<string, unknown> | undefined;
  /** Check if the value is a Zod schema */
  isZodSchema(value: unknown): boolean;
  /** Get Zod version identifier */
  version: "v3" | "v4";
}

/**
 * Handler function type for serializing specific schema types
 */
export type SchemaHandler = (
  schema: unknown,
  ctx: SerializerContext,
) => string | undefined;

/**
 * Resolved serialization options (with defaults applied)
 */
export type ResolvedSerializeOptions = Required<
  Omit<SerializeOptions, "serializeFunctions">
> & {
  serializeFunctions: boolean | "auto" | "marked";
};

/**
 * Context passed to handlers during serialization
 */
export interface SerializerContext {
  adapter: ZodAdapter;
  options: ResolvedSerializeOptions;
  indent: (level?: number) => string;
  serialize: (schema: unknown, indentLevel?: number) => string;
}

/**
 * Default serialization options
 */
export const defaultOptions: ResolvedSerializeOptions = {
  indent: "  ",
  indentLevel: 0,
  format: true,
  optimizations: {
    semanticMethods: true,
    scientificNotation: true,
  },
  serializeFunctions: false,
};
