package zodval

import (
	"encoding/json"
	"fmt"
)

const (
	// maxParseDepth limits the recursion depth when parsing nested IRNodes
	// to prevent stack overflow from deeply nested JSON AST files.
	maxParseDepth = 256
)

// ParseDocument parses a top-level JSON AST document.
func ParseDocument(data []byte) (*AstDocument, error) {
	var doc AstDocument
	if err := json.Unmarshal(data, &doc); err != nil {
		return nil, fmt.Errorf("failed to parse AST document: %w", err)
	}
	if doc.Version != 1 {
		return nil, fmt.Errorf("unsupported AST version: %d (expected 1)", doc.Version)
	}
	return &doc, nil
}

// ParseNode decodes a JSON AST node, dispatching on the "kind" field.
func ParseNode(data []byte) (IRNode, error) {
	return parseNode(data, 0)
}

// parseNode is the internal, depth-guarded version of ParseNode.
func parseNode(data []byte, depth int) (IRNode, error) {
	if depth >= maxParseDepth {
		return nil, fmt.Errorf("maximum parse depth (%d) exceeded", maxParseDepth)
	}
	var probe struct {
		Kind string `json:"kind"`
	}
	if err := json.Unmarshal(data, &probe); err != nil {
		return nil, fmt.Errorf("failed to read node kind: %w", err)
	}

	kind := probe.Kind
	switch kind {
	case "primitive":
		return decodeInto[PrimitiveNode](data)
	case "constraint":
		return decodeInto[ConstraintNode](data)
	case "modified":
		return decodeModified(data, depth)
	case "modifier":
		return decodeInto[ModifierNode](data)
	case "literal":
		return decodeInto[LiteralNode](data)
	case "enum":
		return decodeEnum(data, depth)
	case "array":
		return decodeArray(data, depth)
	case "object":
		return decodeObject(data, depth)
	case "tuple":
		return decodeTuple(data, depth)
	case "record":
		return decodeRecord(data, depth)
	case "map":
		return decodeMap(data, depth)
	case "set":
		return decodeSet(data, depth)
	case "union":
		return decodeUnion(data, depth)
	case "intersection":
		return decodeIntersection(data, depth)
	case "function":
		return decodeInto[FunctionNode](data)
	case "transform":
		return decodeTransform(data, depth)
	case "refine":
		return decodeRefine(data, depth)
	case "preprocess":
		return decodePreprocess(data, depth)
	case "pipe":
		return decodePipe(data, depth)
	case "zod-function":
		return decodeZodFunction(data, depth)
	case "lazy":
		return decodeLazy(data, depth)
	case "promise":
		return decodePromise(data, depth)
	case "fallback":
		return decodeInto[FallbackNode](data)
	case "raw":
		return decodeInto[RawNode](data)
	default:
		return nil, fmt.Errorf("unknown node kind: %q", kind)
	}
}

// decodeInto is a generic helper that unmarshals data into type T.
func decodeInto[T any](data []byte) (*T, error) {
	var v T
	if err := json.Unmarshal(data, &v); err != nil {
		return nil, fmt.Errorf("failed to decode %T: %w", v, err)
	}
	return &v, nil
}

// decodeChildNodesAt parses a JSON array of nodes, passing depth+1
func decodeChildNodesAt(data json.RawMessage, depth int) ([]IRNode, error) {
	if len(data) == 0 {
		return nil, nil
	}
	var raws []json.RawMessage
	if err := json.Unmarshal(data, &raws); err != nil {
		return nil, fmt.Errorf("failed to parse node array: %w", err)
	}
	nodes := make([]IRNode, len(raws))
	for i, r := range raws {
		n, err := parseNode(r, depth+1)
		if err != nil {
			return nil, fmt.Errorf("node[%d]: %w", i, err)
		}
		nodes[i] = n
	}
	return nodes, nil
}

func decodeChildNodeAt(data json.RawMessage, depth int) (IRNode, error) {
	if len(data) == 0 {
		return nil, nil
	}
	return parseNode(data, depth+1)
}

// --- Node-specific decoders that need recursive parsing ---

func decodeModified(data []byte, depth int) (*ModifiedNode, error) {
	n, err := decodeInto[ModifiedNode](data)
	if err != nil {
		return nil, err
	}
	inner, err := decodeChildNodeAt(n.RawInner, depth)
	if err != nil {
		return nil, fmt.Errorf("modified.inner: %w", err)
	}
	n.Inner = inner
	return n, nil
}

func decodeEnum(data []byte, depth int) (*EnumNode, error) {
	n, err := decodeInto[EnumNode](data)
	if err != nil {
		return nil, err
	}
	if len(n.RawOptions) > 0 {
		opts, err := decodeChildNodesAt(n.RawOptions, depth)
		if err != nil {
			return nil, fmt.Errorf("enum.options: %w", err)
		}
		n.Options = opts
	}
	return n, nil
}

func decodeArray(data []byte, depth int) (*ArrayNode, error) {
	n, err := decodeInto[ArrayNode](data)
	if err != nil {
		return nil, err
	}
	elem, err := decodeChildNodeAt(n.RawElement, depth)
	if err != nil {
		return nil, fmt.Errorf("array.element: %w", err)
	}
	n.Element = elem
	return n, nil
}

func decodeObject(data []byte, depth int) (*ObjectNode, error) {
	n, err := decodeInto[ObjectNode](data)
	if err != nil {
		return nil, err
	}

	// Parse fields array.
	var fields []ObjectField
	if err := json.Unmarshal(n.RawFields, &fields); err != nil {
		return nil, fmt.Errorf("object.fields: %w", err)
	}
	for i := range fields {
		val, err := decodeChildNodeAt(fields[i].RawValue, depth)
		if err != nil {
			return nil, fmt.Errorf("object.fields[%d].value: %w", i, err)
		}
		fields[i].Value = val
	}
	n.Fields = fields

	// Parse catchall.
	if len(n.RawCatchall) > 0 {
		catchall, err := decodeChildNodeAt(n.RawCatchall, depth)
		if err != nil {
			return nil, fmt.Errorf("object.catchall: %w", err)
		}
		n.Catchall = catchall
	}

	return n, nil
}

func decodeTuple(data []byte, depth int) (*TupleNode, error) {
	n, err := decodeInto[TupleNode](data)
	if err != nil {
		return nil, err
	}
	items, err := decodeChildNodesAt(n.RawItems, depth)
	if err != nil {
		return nil, fmt.Errorf("tuple.items: %w", err)
	}
	n.Items = items
	if len(n.RawRest) > 0 {
		rest, err := decodeChildNodeAt(n.RawRest, depth)
		if err != nil {
			return nil, fmt.Errorf("tuple.rest: %w", err)
		}
		n.Rest = rest
	}
	return n, nil
}

func decodeRecord(data []byte, depth int) (*RecordNode, error) {
	n, err := decodeInto[RecordNode](data)
	if err != nil {
		return nil, err
	}
	key, err := decodeChildNodeAt(n.RawKey, depth)
	if err != nil {
		return nil, fmt.Errorf("record.key: %w", err)
	}
	n.Key = key
	val, err := decodeChildNodeAt(n.RawValue, depth)
	if err != nil {
		return nil, fmt.Errorf("record.value: %w", err)
	}
	n.Value = val
	return n, nil
}
func decodeMap(data []byte, depth int) (*MapNode, error) {
	n, err := decodeInto[MapNode](data)
	if err != nil {
		return nil, err
	}
	key, err := decodeChildNodeAt(n.RawKey, depth)
	if err != nil {
		return nil, fmt.Errorf("map.key: %w", err)
	}
	n.Key = key
	val, err := decodeChildNodeAt(n.RawValue, depth)
	if err != nil {
		return nil, fmt.Errorf("map.value: %w", err)
	}
	n.Value = val
	return n, nil
}

func decodeSet(data []byte, depth int) (*SetNode, error) {
	n, err := decodeInto[SetNode](data)
	if err != nil {
		return nil, err
	}
	elem, err := decodeChildNodeAt(n.RawElement, depth)
	if err != nil {
		return nil, fmt.Errorf("set.element: %w", err)
	}
	n.Element = elem
	return n, nil
}

func decodeUnion(data []byte, depth int) (*UnionNode, error) {
	n, err := decodeInto[UnionNode](data)
	if err != nil {
		return nil, err
	}
	opts, err := decodeChildNodesAt(n.RawOptions, depth)
	if err != nil {
		return nil, fmt.Errorf("union.options: %w", err)
	}
	n.Options = opts
	return n, nil
}

func decodeIntersection(data []byte, depth int) (*IntersectionNode, error) {
	n, err := decodeInto[IntersectionNode](data)
	if err != nil {
		return nil, err
	}
	left, err := decodeChildNodeAt(n.RawLeft, depth)
	if err != nil {
		return nil, fmt.Errorf("intersection.left: %w", err)
	}
	n.Left = left
	right, err := decodeChildNodeAt(n.RawRight, depth)
	if err != nil {
		return nil, fmt.Errorf("intersection.right: %w", err)
	}
	n.Right = right
	return n, nil
}

func decodeTransform(data []byte, depth int) (*TransformNode, error) {
	n, err := decodeInto[TransformNode](data)
	if err != nil {
		return nil, err
	}
	inner, err := decodeChildNodeAt(n.RawInner, depth)
	if err != nil {
		return nil, fmt.Errorf("transform.inner: %w", err)
	}
	n.Inner = inner
	return n, nil
}

func decodeRefine(data []byte, depth int) (*RefineNode, error) {
	n, err := decodeInto[RefineNode](data)
	if err != nil {
		return nil, err
	}
	inner, err := decodeChildNodeAt(n.RawInner, depth)
	if err != nil {
		return nil, fmt.Errorf("refine.inner: %w", err)
	}
	n.Inner = inner
	return n, nil
}

func decodePreprocess(data []byte, depth int) (*PreprocessNode, error) {
	n, err := decodeInto[PreprocessNode](data)
	if err != nil {
		return nil, err
	}
	inner, err := decodeChildNodeAt(n.RawInner, depth)
	if err != nil {
		return nil, fmt.Errorf("preprocess.inner: %w", err)
	}
	n.Inner = inner
	return n, nil
}

func decodePipe(data []byte, depth int) (*PipeNode, error) {
	n, err := decodeInto[PipeNode](data)
	if err != nil {
		return nil, err
	}
	in, err := decodeChildNodeAt(n.RawIn, depth)
	if err != nil {
		return nil, fmt.Errorf("pipe.in: %w", err)
	}
	n.In = in
	out, err := decodeChildNodeAt(n.RawOut, depth)
	if err != nil {
		return nil, fmt.Errorf("pipe.out: %w", err)
	}
	n.Out = out
	return n, nil
}

func decodeZodFunction(data []byte, depth int) (*ZodFunctionNode, error) {
	n, err := decodeInto[ZodFunctionNode](data)
	if err != nil {
		return nil, err
	}
	args, err := decodeChildNodesAt(n.RawArgs, depth)
	if err != nil {
		return nil, fmt.Errorf("zod-function.args: %w", err)
	}
	n.Args = args
	if len(n.RawReturns) > 0 {
		ret, err := decodeChildNodeAt(n.RawReturns, depth)
		if err != nil {
			return nil, fmt.Errorf("zod-function.returns: %w", err)
		}
		n.Returns = ret
	}
	return n, nil
}

func decodeLazy(data []byte, depth int) (*LazyNode, error) {
	n, err := decodeInto[LazyNode](data)
	if err != nil {
		return nil, err
	}
	if len(n.RawInner) > 0 {
		inner, err := decodeChildNodeAt(n.RawInner, depth)
		if err != nil {
			return nil, fmt.Errorf("lazy.inner: %w", err)
		}
		n.Inner = inner
	}
	return n, nil
}

func decodePromise(data []byte, depth int) (*PromiseNode, error) {
	n, err := decodeInto[PromiseNode](data)
	if err != nil {
		return nil, err
	}
	inner, err := decodeChildNodeAt(n.RawInner, depth)
	if err != nil {
		return nil, fmt.Errorf("promise.inner: %w", err)
	}
	n.Inner = inner
	return n, nil
}

// ParseSchema parses a named schema from an AstDocument.
func (d *AstDocument) ParseSchema(name string) (IRNode, error) {
	raw, ok := d.Schemas[name]
	if !ok {
		return nil, fmt.Errorf("schema %q not found in document", name)
	}
	return ParseNode(raw)
}

// ParseAllSchemas parses all schemas in the document.
func (d *AstDocument) ParseAllSchemas() (map[string]IRNode, error) {
	result := make(map[string]IRNode, len(d.Schemas))
	for name, raw := range d.Schemas {
		node, err := ParseNode(raw)
		if err != nil {
			return nil, fmt.Errorf("schema %q: %w", name, err)
		}
		result[name] = node
	}
	return result, nil
}
