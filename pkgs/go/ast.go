// Package zodval provides a native Go validator for JSON AST files exported
// by zod-codepen's TypeScript library. It reads the JSON AST format (version 1)
// and performs validation equivalent to Zod's .parse() method.
//
// Data flow:
//
//	TS: Zod Schema → cast → IRNode → irToJson → JSON AST file (.json)
//	Go: JSON AST file → parse → IRNode tree → Validate(input) → result
package zodval

import "encoding/json"

// IRNode is the interface implemented by all AST node types.
// Each concrete type represents one "kind" of Zod schema.
type IRNode interface {
	NodeKind() string
}

// AstDocument is the top-level JSON AST document structure.
type AstDocument struct {
	Version int                        `json:"version"`
	Schemas map[string]json.RawMessage `json:"schemas"`
}

// kindHolder provides the NodeKind method to all embedded node structs.
type kindHolder struct {
	KindField string `json:"kind"`
}

func (k kindHolder) NodeKind() string { return k.KindField }

// ---------------------------------------------------------------------------
// Primitive
// ---------------------------------------------------------------------------

// PrimitiveName enumerates the supported primitive type names.
type PrimitiveName string

const (
	PrimString  PrimitiveName = "string"
	PrimNumber  PrimitiveName = "number"
	PrimBigInt  PrimitiveName = "bigint"
	PrimDate    PrimitiveName = "date"
	PrimBoolean PrimitiveName = "boolean"
	PrimSymbol  PrimitiveName = "symbol"
	PrimNull    PrimitiveName = "null"
	PrimUndef   PrimitiveName = "undefined"
	PrimAny     PrimitiveName = "any"
	PrimUnknown PrimitiveName = "unknown"
	PrimNever   PrimitiveName = "never"
	PrimVoid    PrimitiveName = "void"
	PrimNaN     PrimitiveName = "nan"
)

// PrimitiveNode represents a Zod primitive schema.
type PrimitiveNode struct {
	kindHolder
	Primitive   PrimitiveName    `json:"primitive"`
	Coerce      *bool            `json:"coerce,omitempty"`
	Constraints []ConstraintNode `json:"constraints"`
}

// ---------------------------------------------------------------------------
// Constraint (nested inside primitive/array/set nodes)
// ---------------------------------------------------------------------------

// ConstraintTarget describes what kind of schema a constraint applies to.
type ConstraintTarget string

const (
	CTString ConstraintTarget = "string"
	CTNumber ConstraintTarget = "number"
	CTBigInt ConstraintTarget = "bigint"
	CTArray  ConstraintTarget = "array"
	CTDate   ConstraintTarget = "date"
	CTSet    ConstraintTarget = "set"
)

// ConstraintNode represents a single validation constraint.
type ConstraintNode struct {
	kindHolder
	Target ConstraintTarget `json:"target"`
	Name   string           `json:"name"`
	Params ConstraintParams `json:"params"`
}

// ConstraintParams holds the parameters for a constraint.
// Minimum/Maximum can be either a JSON number or a {"_bigint":"..."} object.
type ConstraintParams struct {
	Value     *SpecialValue `json:"value,omitempty"`
	Minimum   *SpecialValue `json:"minimum,omitempty"`
	Maximum   *SpecialValue `json:"maximum,omitempty"`
	Inclusive *bool         `json:"inclusive,omitempty"`
	Regex     *SpecialValue `json:"regex,omitempty"`
}

// ---------------------------------------------------------------------------
// Modified (wrapper with modifiers)
// ---------------------------------------------------------------------------

// ModifierName enumerates the supported modifier names.
type ModifierName string

const (
	ModOptional ModifierName = "optional"
	ModNullable ModifierName = "nullable"
	ModNullish  ModifierName = "nullish"
	ModDefault  ModifierName = "default"
	ModCatch    ModifierName = "catch"
	ModBrand    ModifierName = "brand"
	ModReadonly ModifierName = "readonly"
	ModPrefault ModifierName = "prefault"
)

// ModifierNode represents a single modifier in a chain.
type ModifierNode struct {
	kindHolder
	Name        ModifierName  `json:"name"`
	Value       *SpecialValue `json:"value,omitempty"`
	Placeholder *string       `json:"placeholder,omitempty"`
}

// ModifiedNode represents an inner node wrapped by ordered modifiers.
type ModifiedNode struct {
	kindHolder
	Inner     IRNode          `json:"-"`
	RawInner  json.RawMessage `json:"inner"`
	Modifiers []ModifierNode  `json:"modifiers"`
}

// ---------------------------------------------------------------------------
// Literal
// ---------------------------------------------------------------------------

// LiteralNode represents a Zod literal value.
type LiteralNode struct {
	kindHolder
	Value SpecialValue `json:"value"`
}

// ---------------------------------------------------------------------------
// Enum
// ---------------------------------------------------------------------------

// EnumNode represents a Zod enum or discriminated union variant.
type EnumNode struct {
	kindHolder
	Variant       string          `json:"variant"`
	Values        []string        `json:"values"`
	Discriminator *string         `json:"discriminator,omitempty"`
	Options       []IRNode        `json:"-"`
	RawOptions    json.RawMessage `json:"options,omitempty"`
}

// ---------------------------------------------------------------------------
// Array
// ---------------------------------------------------------------------------

// ArrayNode represents a Zod array schema.
type ArrayNode struct {
	kindHolder
	Element     IRNode           `json:"-"`
	RawElement  json.RawMessage  `json:"element"`
	Constraints []ConstraintNode `json:"constraints"`
}

// ---------------------------------------------------------------------------
// Object
// ---------------------------------------------------------------------------

// ObjectUnknownMode controls how unknown keys are handled.
type ObjectUnknownMode string

const (
	ObjStrip       ObjectUnknownMode = "strip"
	ObjStrict      ObjectUnknownMode = "strict"
	ObjPassthrough ObjectUnknownMode = "passthrough"
)

// ObjectField represents a key-value pair in an object schema.
type ObjectField struct {
	Key      string          `json:"key"`
	Value    IRNode          `json:"-"`
	RawValue json.RawMessage `json:"value"`
}

// ObjectNode represents a Zod object schema.
type ObjectNode struct {
	kindHolder
	Fields      []ObjectField     `json:"-"`
	RawFields   json.RawMessage   `json:"fields"`
	UnknownMode ObjectUnknownMode `json:"unknownMode"`
	Catchall    IRNode            `json:"-"`
	RawCatchall json.RawMessage   `json:"catchall,omitempty"`
}

// ---------------------------------------------------------------------------
// Tuple
// ---------------------------------------------------------------------------

// TupleNode represents a Zod tuple schema.
type TupleNode struct {
	kindHolder
	Items    []IRNode        `json:"-"`
	RawItems json.RawMessage `json:"items"`
	Rest     IRNode          `json:"-"`
	RawRest  json.RawMessage `json:"rest,omitempty"`
}

// ---------------------------------------------------------------------------
// Record / Map
// ---------------------------------------------------------------------------

// RecordNode represents a Zod record schema.
type RecordNode struct {
	kindHolder
	Key      IRNode          `json:"-"`
	RawKey   json.RawMessage `json:"key"`
	Value    IRNode          `json:"-"`
	RawValue json.RawMessage `json:"value"`
}

// MapNode represents a Zod map schema.
type MapNode struct {
	kindHolder
	Key      IRNode          `json:"-"`
	RawKey   json.RawMessage `json:"key"`
	Value    IRNode          `json:"-"`
	RawValue json.RawMessage `json:"value"`
}

// ---------------------------------------------------------------------------
// Set
// ---------------------------------------------------------------------------

// SetNode represents a Zod set schema.
type SetNode struct {
	kindHolder
	Element     IRNode           `json:"-"`
	RawElement  json.RawMessage  `json:"element"`
	Constraints []ConstraintNode `json:"constraints"`
}

// ---------------------------------------------------------------------------
// Union
// ---------------------------------------------------------------------------

// UnionNode represents a Zod union or discriminated union.
type UnionNode struct {
	kindHolder
	Options       []IRNode        `json:"-"`
	RawOptions    json.RawMessage `json:"options"`
	Discriminator *string         `json:"discriminator,omitempty"`
}

// ---------------------------------------------------------------------------
// Intersection
// ---------------------------------------------------------------------------

// IntersectionNode represents a Zod intersection schema.
type IntersectionNode struct {
	kindHolder
	Left     IRNode          `json:"-"`
	RawLeft  json.RawMessage `json:"left"`
	Right    IRNode          `json:"-"`
	RawRight json.RawMessage `json:"right"`
}

// ---------------------------------------------------------------------------
// Function-related nodes
// ---------------------------------------------------------------------------

// FunctionUsage describes where a function node is used.
type FunctionUsage string

const (
	FUTransform       FunctionUsage = "transform"
	FURefine          FunctionUsage = "refine"
	FUPreprocess      FunctionUsage = "preprocess"
	FUFunctionArgs    FunctionUsage = "function-args"
	FUFunctionReturns FunctionUsage = "function-returns"
)

// FunctionMode describes the rendering mode of a function.
type FunctionMode string

const (
	FMPlaceholder FunctionMode = "placeholder"
	FMInline      FunctionMode = "inline"
	FMMarked      FunctionMode = "marked"
)

// FunctionNode represents an opaque function payload.
type FunctionNode struct {
	kindHolder
	Usage  FunctionUsage `json:"usage"`
	Mode   FunctionMode  `json:"mode"`
	Source *string       `json:"source,omitempty"`
	Vars   []string      `json:"vars,omitempty"`
}

// TransformNode represents a Zod transform schema.
type TransformNode struct {
	kindHolder
	Inner    IRNode          `json:"-"`
	RawInner json.RawMessage `json:"inner"`
	Fn       FunctionNode    `json:"fn"`
}

// RefineNode represents a Zod refine schema.
type RefineNode struct {
	kindHolder
	Inner    IRNode          `json:"-"`
	RawInner json.RawMessage `json:"inner"`
	Fn       FunctionNode    `json:"fn"`
}

// PreprocessNode represents a Zod preprocess schema.
type PreprocessNode struct {
	kindHolder
	Inner    IRNode          `json:"-"`
	RawInner json.RawMessage `json:"inner"`
	Fn       FunctionNode    `json:"fn"`
}

// PipeNode represents a Zod pipe schema.
type PipeNode struct {
	kindHolder
	In     IRNode          `json:"-"`
	RawIn  json.RawMessage `json:"in"`
	Out    IRNode          `json:"-"`
	RawOut json.RawMessage `json:"out"`
}

// ZodFunctionNode represents a z.function() schema.
type ZodFunctionNode struct {
	kindHolder
	Args       []IRNode        `json:"-"`
	RawArgs    json.RawMessage `json:"args"`
	Returns    IRNode          `json:"-"`
	RawReturns json.RawMessage `json:"returns,omitempty"`
}

// ---------------------------------------------------------------------------
// Lazy / Promise
// ---------------------------------------------------------------------------

// LazyNode represents a Zod lazy schema.
type LazyNode struct {
	kindHolder
	Placeholder bool            `json:"placeholder"`
	Inner       IRNode          `json:"-"`
	RawInner    json.RawMessage `json:"inner,omitempty"`
}

// PromiseNode represents a Zod promise schema.
type PromiseNode struct {
	kindHolder
	Inner    IRNode          `json:"-"`
	RawInner json.RawMessage `json:"inner"`
}

// ---------------------------------------------------------------------------
// Fallback / Raw
// ---------------------------------------------------------------------------

// FallbackReason describes why a schema failed to cast.
type FallbackReason string

const (
	FBNotZodSchema FallbackReason = "not-a-zod-schema"
	FBUnknownType  FallbackReason = "unknown-type"
	FBUnhandled    FallbackReason = "unhandled"
)

// FallbackNode is a sentinel for schemas that failed to cast.
type FallbackNode struct {
	kindHolder
	Reason FallbackReason `json:"reason"`
	Detail *string        `json:"detail,omitempty"`
}

// RawNode is an escape hatch for schemas that don't map cleanly to IR nodes.
type RawNode struct {
	kindHolder
	Code   string `json:"code"`
	Reason string `json:"reason"`
}
