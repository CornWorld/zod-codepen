package zodval

import (
	"fmt"
	"math/big"
)

func validateObject(vc *validationCtx, n *ObjectNode, path []string, input any) {
	obj, ok := input.(map[string]any)
	if !ok {
		vc.addError(path, "invalid_type",
			"expected object", "object", goTypeName(input))
		return
	}

	// Build a set of known field keys.
	knownKeys := make(map[string]bool, len(n.Fields))
	for _, f := range n.Fields {
		knownKeys[f.Key] = true
		fieldPath := clonePath(path)
		fieldPath = append(fieldPath, f.Key)

		val, exists := obj[f.Key]
		if !exists {
			// Field is missing — let the value node handle it.
			// If it's optional/default, the modified node accepts nil.
			// If required, the inner validator (e.g., PrimitiveNode for "string")
			// will produce an "invalid_type" error.
			validate(vc, f.Value, fieldPath, nil)
			continue
		}
		validate(vc, f.Value, fieldPath, val)
	}

	// Handle unknown keys based on unknownMode.
	for key := range obj {
		if knownKeys[key] {
			continue
		}
		unknownPath := clonePath(path)
		unknownPath = append(unknownPath, key)

		switch n.UnknownMode {
		case ObjStrict:
			vc.addError(unknownPath, "unrecognized_key",
				fmt.Sprintf("unrecognized key: %q", key), "", key)
		case ObjPassthrough:
			// Allow unknown keys. If catchall is set, validate against it.
			if n.Catchall != nil {
				validate(vc, n.Catchall, unknownPath, obj[key])
			}
		case ObjStrip:
			// Unknown keys are silently stripped (ignored in validation).
			// If catchall is set, validate against it.
			if n.Catchall != nil {
				validate(vc, n.Catchall, unknownPath, obj[key])
			}
		}
	}
}

func validateArray(vc *validationCtx, n *ArrayNode, path []string, input any) {
	arr, ok := input.([]any)
	if !ok {
		vc.addError(path, "invalid_type",
			"expected array", "array", goTypeName(input))
		return
	}

	// Validate each element.
	for i, elem := range arr {
		elemPath := clonePath(path)
		elemPath = append(elemPath, fmt.Sprintf("[%d]", i))
		validate(vc, n.Element, elemPath, elem)
	}

	// Apply array-level constraints.
	for _, c := range n.Constraints {
		validateArrayConstraint(vc, c, path, arr)
	}
}

func validateArrayConstraint(vc *validationCtx, c ConstraintNode, path []string, arr []any) {
	length := len(arr)
	switch c.Name {
	case "min":
		n := constraintIntValue(c)
		if length < n {
			vc.addError(path, "too_small",
				fmt.Sprintf("array must contain at least %d item(s)", n),
				fmt.Sprintf(">=%d", n), fmt.Sprintf("len=%d", length))
		}
	case "max":
		n := constraintIntValue(c)
		if length > n {
			vc.addError(path, "too_big",
				fmt.Sprintf("array must contain at most %d item(s)", n),
				fmt.Sprintf("<=%d", n), fmt.Sprintf("len=%d", length))
		}
	case "length":
		n := constraintIntValue(c)
		if length != n {
			vc.addError(path, "invalid_length",
				fmt.Sprintf("array must contain exactly %d item(s)", n),
				fmt.Sprintf("==%d", n), fmt.Sprintf("len=%d", length))
		}
	case "nonempty":
		if length == 0 {
			vc.addError(path, "too_small",
				"array must not be empty", ">0", "len=0")
		}
	default:
		// Unknown array constraint — skip.
	}
}

func validateTuple(vc *validationCtx, n *TupleNode, path []string, input any) {
	arr, ok := input.([]any)
	if !ok {
		vc.addError(path, "invalid_type",
			"expected array (tuple)", "tuple", goTypeName(input))
		return
	}

	// Validate positional items.
	for i, itemNode := range n.Items {
		itemPath := clonePath(path)
		itemPath = append(itemPath, fmt.Sprintf("[%d]", i))

		if i < len(arr) {
			validate(vc, itemNode, itemPath, arr[i])
		} else {
			// Tuple has more items than input.
			vc.addError(itemPath, "invalid_type",
				fmt.Sprintf("tuple item %d missing", i), "item", "missing")
		}
	}

	// Handle rest.
	if n.Rest != nil {
		for i := len(n.Items); i < len(arr); i++ {
			restPath := clonePath(path)
			restPath = append(restPath, fmt.Sprintf("[%d]", i))
			validate(vc, n.Rest, restPath, arr[i])
		}
	} else if len(arr) > len(n.Items) {
		// No rest type, extra elements are invalid.
		vc.addError(path, "too_big",
			fmt.Sprintf("tuple has %d items but got %d elements", len(n.Items), len(arr)),
			fmt.Sprintf("==%d", len(n.Items)), fmt.Sprintf("len=%d", len(arr)))
	}
}

func validateRecord(vc *validationCtx, n *RecordNode, path []string, input any) {
	obj, ok := input.(map[string]any)
	if !ok {
		vc.addError(path, "invalid_type",
			"expected object (record)", "record", goTypeName(input))
		return
	}

	for key, val := range obj {
		entryPath := clonePath(path)
		entryPath = append(entryPath, key)

		// Validate key (usually z.string()).
		validate(vc, n.Key, entryPath, key)
		// Validate value.
		validate(vc, n.Value, entryPath, val)
	}
}

func validateMap(vc *validationCtx, n *MapNode, path []string, input any) {
	// JSON has no native Map. A z.map() schema in JSON is typically represented
	// as an object (map[string]any) or array of pairs.
	switch v := input.(type) {
	case map[string]any:
		// Treat like record.
		for key, val := range v {
			entryPath := clonePath(path)
			entryPath = append(entryPath, key)
			validate(vc, n.Key, entryPath, key)
			validate(vc, n.Value, entryPath, val)
		}
	case []any:
		// Array of [key, value] pairs.
		for i, pair := range v {
			pairPath := clonePath(path)
			pairPath = append(pairPath, fmt.Sprintf("[%d]", i))
			pairArr, ok := pair.([]any)
			if !ok || len(pairArr) != 2 {
				vc.addError(pairPath, "invalid_type",
					"expected [key, value] pair", "pair", goTypeName(pair))
				continue
			}
			validate(vc, n.Key, pairPath, pairArr[0])
			validate(vc, n.Value, pairPath, pairArr[1])
		}
	default:
		vc.addError(path, "invalid_type",
			"expected object or array of pairs (map)", "map", goTypeName(input))
	}
}

func validateSet(vc *validationCtx, n *SetNode, path []string, input any) {
	arr, ok := input.([]any)
	if !ok {
		vc.addError(path, "invalid_type",
			"expected array (set is represented as array in JSON)", "set", goTypeName(input))
		return
	}

	// Validate each element.
	for i, elem := range arr {
		elemPath := clonePath(path)
		elemPath = append(elemPath, fmt.Sprintf("[%d]", i))
		validate(vc, n.Element, elemPath, elem)
	}

	// Check uniqueness (sets must have unique elements).
	seen := make(map[string]bool, len(arr))
	for i, elem := range arr {
		key := setElementKey(elem)
		if seen[key] {
			dupPath := clonePath(path)
			dupPath = append(dupPath, fmt.Sprintf("[%d]", i))
			vc.addError(dupPath, "not_unique",
				"set elements must be unique", "unique", key)
		}
		seen[key] = true
	}

	// Apply set-level constraints (same as array constraints).
	for _, c := range n.Constraints {
		validateArrayConstraint(vc, c, path, arr)
	}
}

// setElementKey creates a hashable key for an element to check uniqueness.
func setElementKey(elem any) string {
	switch v := elem.(type) {
	case string, bool, float64, int, int64:
		return fmt.Sprint(v)
	case *big.Int:
		return "bigint:" + v.String()
	case nil:
		return "null"
	case map[string]any:
		return fmt.Sprintf("obj:%v", v)
	case []any:
		return fmt.Sprintf("arr:%v", v)
	default:
		return fmt.Sprintf("%T:%v", elem, elem)
	}
}

func validateIntersection(vc *validationCtx, n *IntersectionNode, path []string, input any) {
	// Both left and right schemas must validate successfully.
	// We run both even if the first fails, to collect all errors.
	validate(vc, n.Left, path, input)
	validate(vc, n.Right, path, input)
}

func validateUnion(vc *validationCtx, n *UnionNode, path []string, input any) {
	if n.Discriminator != nil && *n.Discriminator != "" {
		validateDiscriminatedUnion(vc, n, path, input)
		return
	}

	// Plain union: try each option, first match wins.
	for _, opt := range n.Options {
		subVC := newValidationCtx()
		validate(subVC, opt, path, input)
		if subVC.result.IsValid() {
			return // Found a valid option.
		}
	}

	// No option matched.
	vc.addError(path, "invalid_union",
		"input does not match any union member",
		"union", goTypeName(input))
}

func validateDiscriminatedUnion(vc *validationCtx, n *UnionNode, path []string, input any) {
	discKey := *n.Discriminator

	obj, ok := input.(map[string]any)
	if !ok {
		vc.addError(path, "invalid_type",
			"expected object (discriminated union)", "object", goTypeName(input))
		return
	}

	discValue, exists := obj[discKey]
	if !exists {
		discPath := clonePath(path)
		discPath = append(discPath, discKey)
		vc.addError(discPath, "invalid_discriminator",
			fmt.Sprintf("discriminator key %q is missing", discKey),
			"", "missing")
		return
	}

	// Find the matching option by looking at the literal value in the discriminator field.
	for _, opt := range n.Options {
		optObj, ok := opt.(*ObjectNode)
		if !ok {
			continue
		}

		// Find the discriminator field in this option.
		for _, f := range optObj.Fields {
			if f.Key != discKey {
				continue
			}
			lit, ok := f.Value.(*LiteralNode)
			if !ok {
				continue
			}
			if deepEqual(discValue, lit.Value.Any()) {
				// Found matching option — validate the full object against it.
				validate(vc, opt, path, input)
				return
			}
		}
	}

	// No option matched.
	validValues := make([]string, 0)
	for _, opt := range n.Options {
		if optObj, ok := opt.(*ObjectNode); ok {
			for _, f := range optObj.Fields {
				if f.Key == discKey {
					if lit, ok := f.Value.(*LiteralNode); ok {
						validValues = append(validValues, fmt.Sprintf("%v", lit.Value.Any()))
					}
				}
			}
		}
	}

	vc.addError(path, "invalid_discriminator",
		fmt.Sprintf("discriminator value %v does not match any option (valid: %v)",
			discValue, validValues),
		"", fmt.Sprintf("%v", discValue))
}

func validateLiteral(vc *validationCtx, n *LiteralNode, path []string, input any) {
	expected := n.Value.Any()
	if !deepEqual(input, expected) {
		vc.addError(path, "invalid_literal",
			fmt.Sprintf("expected literal value %v", formatValue(expected)),
			formatValue(expected), formatValue(input))
	}
}

func validateEnum(vc *validationCtx, n *EnumNode, path []string, input any) {
	s, ok := input.(string)
	if !ok {
		vc.addError(path, "invalid_type",
			"expected string (enum)", "enum", goTypeName(input))
		return
	}

	for _, v := range n.Values {
		if s == v {
			return
		}
	}

	vc.addError(path, "invalid_enum_value",
		fmt.Sprintf("value %q is not a valid enum value (valid: %v)", s, n.Values),
		"", s)
}

// deepEqual compares two Go values, handling special types like big.Int.
func deepEqual(a, b any) bool {
	// Handle nil cases.
	if a == nil || b == nil {
		return a == nil && b == nil
	}

	// big.Int comparison.
	if ba, ok := a.(*big.Int); ok {
		if bb, ok := b.(*big.Int); ok {
			return ba.Cmp(bb) == 0
		}
		// Compare big.Int with number using big.Float for precision.
		if fb, ok := toFloat(b); ok {
			bf := new(big.Float).SetInt(ba)
			cmp := bf.Cmp(big.NewFloat(fb))
			return cmp == 0
		}
	}

	// Number comparison (float64 with int).
	if fa, ok := toFloat(a); ok {
		if fb, ok := toFloat(b); ok {
			return fa == fb
		}
	}

	// Direct equality.
	return a == b
}

// formatValue renders a Go value for error messages.
func formatValue(v any) string {
	return fmt.Sprintf("%v", v)
}
