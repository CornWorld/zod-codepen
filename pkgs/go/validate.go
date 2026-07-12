package zodval

import "fmt"

// ValidateSchema validates an input value against a named schema in the document.
// Returns nil on success, or a *ValidationResult containing errors.
func ValidateSchema(doc *AstDocument, schemaName string, input any) *ValidationResult {
	node, err := doc.ParseSchema(schemaName)
	if err != nil {
		vr := &ValidationResult{Errors: []*ValidationError{}}
		vr.Errors = append(vr.Errors, &ValidationError{
			Message: err.Error(),
			Code:    "schema_not_found",
		})
		return vr
	}
	return ValidateNode(node, input)
}

// ValidateNode validates an input value against a single IRNode.
// Returns nil on success, or a *ValidationResult containing errors.
func ValidateNode(node IRNode, input any) *ValidationResult {
	vc := newValidationCtx()
	validate(vc, node, nil, input)
	return vc.result
}

// validate dispatches to the appropriate validator based on node kind.
func validate(vc *validationCtx, node IRNode, path []string, input any) {
	switch n := node.(type) {
	case *PrimitiveNode:
		validatePrimitive(vc, n, path, input)
	case *ModifiedNode:
		validateModified(vc, n, path, input)
	case *LiteralNode:
		validateLiteral(vc, n, path, input)
	case *EnumNode:
		validateEnum(vc, n, path, input)
	case *ArrayNode:
		validateArray(vc, n, path, input)
	case *ObjectNode:
		validateObject(vc, n, path, input)
	case *TupleNode:
		validateTuple(vc, n, path, input)
	case *RecordNode:
		validateRecord(vc, n, path, input)
	case *MapNode:
		validateMap(vc, n, path, input)
	case *SetNode:
		validateSet(vc, n, path, input)
	case *UnionNode:
		validateUnion(vc, n, path, input)
	case *IntersectionNode:
		validateIntersection(vc, n, path, input)
	case *LazyNode:
		validateLazy(vc, n, path, input)
	case *PromiseNode:
		validatePromise(vc, n, path, input)
	case *PipeNode:
		validatePipe(vc, n, path, input)
	case *TransformNode:
		vc.addError(path, "unsupported",
			"transform schemas contain JS functions and cannot be validated in Go",
			"", "transform")
	case *RefineNode:
		vc.addError(path, "unsupported",
			"refine schemas contain JS functions and cannot be validated in Go",
			"", "refine")
	case *PreprocessNode:
		vc.addError(path, "unsupported",
			"preprocess schemas contain JS functions and cannot be validated in Go",
			"", "preprocess")
	case *ZodFunctionNode:
		vc.addError(path, "unsupported",
			"z.function() schemas cannot be validated in Go",
			"", "zod-function")
	case *FunctionNode:
		vc.addError(path, "unsupported",
			"function nodes cannot be validated",
			"", "function")
	case *FallbackNode:
		vc.addError(path, "fallback",
			"schema was not a valid Zod schema during serialization: "+string(n.Reason),
			"", "fallback")
	case *RawNode:
		vc.addError(path, "unsupported",
			"raw schema node: "+n.Code,
			"", "raw")
	default:
		vc.addError(path, "unknown",
			"unknown node type in validation",
			"", fmt.Sprintf("%T", node))
	}
}
