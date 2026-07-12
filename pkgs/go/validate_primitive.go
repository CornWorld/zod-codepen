package zodval

import (
	"fmt"
	"math"
	"math/big"
	"strconv"
	"strings"
)

func validatePrimitive(vc *validationCtx, n *PrimitiveNode, path []string, input any) {
	// Handle coerce first: z.coerce.X() converts before validating.
	if n.Coerce != nil && *n.Coerce {
		input = coerceValue(n.Primitive, input)
	}

	switch n.Primitive {
	case PrimString:
		validateString(vc, n, path, input)
	case PrimNumber:
		validateNumber(vc, n, path, input)
	case PrimBigInt:
		validateBigInt(vc, n, path, input)
	case PrimBoolean:
		validateBoolean(vc, n, path, input)
	case PrimDate:
		validateDate(vc, n, path, input)
	case PrimNull:
		if input != nil {
			vc.addError(path, "invalid_type",
				"expected null", "null", fmt.Sprintf("%T", input))
		}
	case PrimUndef, PrimVoid:
		// In JSON, undefined doesn't exist. nil is the closest.
		// z.undefined() accepts only undefined, which in JSON is absent.
		// z.void() accepts undefined/void.
		// For practical purposes, nil is accepted.
		// Non-nil is rejected.
		if input != nil {
			vc.addError(path, "invalid_type",
				"expected undefined", "undefined", fmt.Sprintf("%T", input))
		}
	case PrimAny:
		// z.any() accepts everything.
	case PrimUnknown:
		// z.unknown() accepts everything.
	case PrimNever:
		// z.never() rejects everything.
		vc.addError(path, "invalid_type",
			"expected never (always fails)", "never", fmt.Sprintf("%T", input))
	case PrimNaN:
		f, ok := toFloat(input)
		if !ok || !math.IsNaN(f) {
			vc.addError(path, "invalid_type",
				"expected NaN", "nan", fmt.Sprintf("%v", input))
		}
	case PrimSymbol:
		// Symbols don't exist in JSON.
		vc.addError(path, "invalid_type",
			"symbol type is not representable in JSON/Go", "symbol", fmt.Sprintf("%T", input))
	default:
		vc.addError(path, "unknown_primitive",
			fmt.Sprintf("unknown primitive type: %s", n.Primitive),
			"", "")
	}
}

func validateString(vc *validationCtx, n *PrimitiveNode, path []string, input any) {
	s, ok := input.(string)
	if !ok {
		vc.addError(path, "invalid_type",
			"expected string", "string", goTypeName(input))
		return
	}

	// Apply constraints.
	for _, c := range n.Constraints {
		validateStringConstraint(vc, c, path, s)
	}
}

func validateNumber(vc *validationCtx, n *PrimitiveNode, path []string, input any) {
	f, ok := toFloat(input)
	if !ok {
		vc.addError(path, "invalid_type",
			"expected number", "number", goTypeName(input))
		return
	}

	for _, c := range n.Constraints {
		validateNumberConstraint(vc, c, path, f)
	}
}

func validateBigInt(vc *validationCtx, n *PrimitiveNode, path []string, input any) {
	var bi *big.Int
	switch v := input.(type) {
	case *big.Int:
		bi = v
	case float64:
		bi = new(big.Int).SetInt64(int64(v))
	case int64:
		bi = new(big.Int).SetInt64(v)
	case int:
		bi = new(big.Int).SetInt64(int64(v))
	default:
		vc.addError(path, "invalid_type",
			"expected bigint", "bigint", goTypeName(input))
		return
	}

	for _, c := range n.Constraints {
		validateBigIntConstraint(vc, c, path, bi)
	}
}

func validateBoolean(vc *validationCtx, n *PrimitiveNode, path []string, input any) {
	if _, ok := input.(bool); !ok {
		vc.addError(path, "invalid_type",
			"expected boolean", "boolean", goTypeName(input))
		return
	}
}

func validateDate(vc *validationCtx, n *PrimitiveNode, path []string, input any) {
	// In JSON, dates are represented as ISO 8601 strings.
	s, ok := input.(string)
	if !ok {
		vc.addError(path, "invalid_type",
			"expected date (ISO 8601 string)", "date", goTypeName(input))
		return
	}

	// Try parsing common date formats.
	if !isValidDateString(s) {
		vc.addError(path, "invalid_date",
			fmt.Sprintf("invalid date string: %q", s),
			"date", s)
		return
	}

	for _, c := range n.Constraints {
		validateDateConstraint(vc, c, path, s)
	}
}

// coerceValue attempts to coerce input to the target type, mimicking z.coerce.X().
func coerceValue(target PrimitiveName, input any) any {
	switch target {
	case PrimString:
		return fmt.Sprint(input)
	case PrimNumber:
		f, ok := toFloat(input)
		if ok {
			return f
		}
		// If string, try to parse.
		if s, ok := input.(string); ok {
			if v, err := strconv.ParseFloat(s, 64); err == nil {
				return v
			}
		}
		return input // uncoercible, will fail type check
	case PrimBoolean:
		// z.coerce.boolean(): falsy values → false, others → true
		switch v := input.(type) {
		case string:
			return v != ""
		case float64:
			return v != 0 && !math.IsNaN(v)
		case bool:
			return v
		case nil:
			return false
		default:
			return true
		}
	case PrimBigInt:
		if f, ok := toFloat(input); ok {
			return new(big.Int).SetInt64(int64(f))
		}
		if s, ok := input.(string); ok {
			bi := new(big.Int)
			if _, ok := bi.SetString(s, 10); ok {
				return bi
			}
		}
		return input
	default:
		return input
	}
}

// toFloat converts input to float64, returning false if not a number.
func toFloat(input any) (float64, bool) {
	switch v := input.(type) {
	case float64:
		return v, true
	case float32:
		return float64(v), true
	case int:
		return float64(v), true
	case int64:
		return float64(v), true
	case int32:
		return float64(v), true
	case int16:
		return float64(v), true
	case int8:
		return float64(v), true
	case uint64:
		return float64(v), true
	case uint:
		return float64(v), true
	case uint32:
		return float64(v), true
	case uint16:
		return float64(v), true
	case uint8:
		return float64(v), true
	case *big.Int:
		f, acc := new(big.Float).SetInt(v).Float64()
		// For values too large/precise for float64, accuracy is lost.
		// We still return the float64 approximation but mark it as
		// a valid number. Callers should be aware that constraints
		// (min/max) on extremely large big.Ints may be imprecise.
		_ = acc
		return f, true
	default:
		return 0, false
	}
}

// goTypeName returns a human-readable type name for error messages.
func goTypeName(input any) string {
	if input == nil {
		return "null"
	}
	switch input.(type) {
	case string:
		return "string"
	case float64, float32, int, int64, int32, int16, int8, uint, uint64, uint32, uint16, uint8:
		return "number"
	case *big.Int:
		return "bigint"
	case bool:
		return "boolean"
	case map[string]any:
		return "object"
	case []any:
		return "array"
	default:
		return fmt.Sprintf("%T", input)
	}
}

// isValidDateString checks if s looks like an ISO 8601 date.
func isValidDateString(s string) bool {
	// Simple heuristic: must contain at least "YYYY-MM-DD".
	if len(s) < 10 {
		return false
	}
	// Check for basic ISO format.
	if s[4] != '-' || s[7] != '-' {
		return false
	}
	for i := 0; i < 4; i++ {
		if s[i] < '0' || s[i] > '9' {
			return false
		}
	}
	for i := 5; i < 7; i++ {
		if s[i] < '0' || s[i] > '9' {
			return false
		}
	}
	for i := 8; i < 10; i++ {
		if s[i] < '0' || s[i] > '9' {
			return false
		}
	}
	// Check month range.
	month := (int(s[5]-'0')*10 + int(s[6]-'0'))
	day := (int(s[8]-'0')*10 + int(s[9]-'0'))
	if month < 1 || month > 12 {
		return false
	}
	if day < 1 || day > 31 {
		return false
	}
	return true
}

// stringConstraint helpers

func validateStringConstraint(vc *validationCtx, c ConstraintNode, path []string, s string) {
	switch c.Name {
	case "min":
		n := constraintIntValue(c)
		if len(s) < n {
			vc.addError(path, "too_small",
				fmt.Sprintf("string must contain at least %d character(s)", n),
				fmt.Sprintf(">=%d", n), fmt.Sprintf("len=%d", len(s)))
		}
	case "max":
		n := constraintIntValue(c)
		if len(s) > n {
			vc.addError(path, "too_big",
				fmt.Sprintf("string must contain at most %d character(s)", n),
				fmt.Sprintf("<=%d", n), fmt.Sprintf("len=%d", len(s)))
		}
	case "length":
		n := constraintIntValue(c)
		if len(s) != n {
			vc.addError(path, "invalid_length",
				fmt.Sprintf("string must contain exactly %d character(s)", n),
				fmt.Sprintf("==%d", n), fmt.Sprintf("len=%d", len(s)))
		}
	case "nonempty":
		if len(s) == 0 {
			vc.addError(path, "too_small",
				"string must not be empty", ">0", "len=0")
		}
	case "email":
		if !isEmail(s) {
			vc.addError(path, "invalid_string",
				"invalid email address", "email", s)
		}
	case "url":
		if !isURL(s) {
			vc.addError(path, "invalid_string",
				"invalid URL", "url", s)
		}
	case "uuid":
		if !isUUID(s) {
			vc.addError(path, "invalid_string",
				"invalid UUID", "uuid", s)
		}
	case "regex":
		if re := constraintRegex(c); re != nil {
			if !re.MatchString(s) {
				vc.addError(path, "invalid_string",
					"string does not match regex pattern",
					re.String(), s)
			}
		}
	case "startsWith":
		prefix := constraintStringValue(c)
		if !strings.HasPrefix(s, prefix) {
			vc.addError(path, "invalid_string",
				fmt.Sprintf("string must start with %q", prefix),
				"startsWith("+prefix+")", s)
		}
	case "endsWith":
		suffix := constraintStringValue(c)
		if !strings.HasSuffix(s, suffix) {
			vc.addError(path, "invalid_string",
				fmt.Sprintf("string must end with %q", suffix),
				"endsWith("+suffix+")", s)
		}
	case "includes":
		substr := constraintStringValue(c)
		if !strings.Contains(s, substr) {
			vc.addError(path, "invalid_string",
				fmt.Sprintf("string must include %q", substr),
				"includes("+substr+")", s)
		}
	case "trim":
		// trim is a transform, not a constraint. No-op for validation.
	case "toLowerCase", "toUpperCase":
		// These are transforms, not constraints. No-op for validation.
	case "cuid":
		if !isCUID(s) {
			vc.addError(path, "invalid_string", "invalid CUID", "cuid", s)
		}
	case "cuid2":
		if !isCUID(s) { // simplified
			vc.addError(path, "invalid_string", "invalid CUID2", "cuid2", s)
		}
	case "datetime":
		if !isValidDateString(s) {
			vc.addError(path, "invalid_string", "invalid datetime", "datetime", s)
		}
	case "ip":
		if !isIP(s) {
			vc.addError(path, "invalid_string", "invalid IP address", "ip", s)
		}
	default:
		// Unknown constraint — skip silently. Forward-compatible.
	}
}

// numberConstraint helpers

func validateNumberConstraint(vc *validationCtx, c ConstraintNode, path []string, f float64) {
	switch c.Name {
	case "min":
		min := constraintFloatValue(c)
		inclusive := constraintInclusive(c, true)
		if inclusive {
			if f < min {
				vc.addError(path, "too_small",
					fmt.Sprintf("number must be >= %v", min), fmt.Sprintf(">=%v", min), fmt.Sprintf("%v", f))
			}
		} else {
			if f <= min {
				vc.addError(path, "too_small",
					fmt.Sprintf("number must be > %v", min), fmt.Sprintf(">%v", min), fmt.Sprintf("%v", f))
			}
		}
	case "max":
		max := constraintFloatValue(c)
		inclusive := constraintInclusive(c, true)
		if inclusive {
			if f > max {
				vc.addError(path, "too_big",
					fmt.Sprintf("number must be <= %v", max), fmt.Sprintf("<=%v", max), fmt.Sprintf("%v", f))
			}
		} else {
			if f >= max {
				vc.addError(path, "too_big",
					fmt.Sprintf("number must be < %v", max), fmt.Sprintf("<%v", max), fmt.Sprintf("%v", f))
			}
		}
	case "int":
		if f != math.Trunc(f) {
			vc.addError(path, "invalid_type",
				"expected integer", "int", fmt.Sprintf("%v", f))
		}
	case "finite":
		if math.IsInf(f, 0) || math.IsNaN(f) {
			vc.addError(path, "not_finite",
				"number must be finite", "finite", fmt.Sprintf("%v", f))
		}
	case "positive":
		if f <= 0 {
			vc.addError(path, "too_small",
				"number must be positive", ">0", fmt.Sprintf("%v", f))
		}
	case "negative":
		if f >= 0 {
			vc.addError(path, "too_big",
				"number must be negative", "<0", fmt.Sprintf("%v", f))
		}
	case "nonnegative":
		if f < 0 {
			vc.addError(path, "too_small",
				"number must be non-negative", ">=0", fmt.Sprintf("%v", f))
		}
	case "nonpositive":
		if f > 0 {
			vc.addError(path, "too_big",
				"number must be non-positive", "<=0", fmt.Sprintf("%v", f))
		}
	case "multipleOf":
		div := constraintFloatValue(c)
		if div == 0 {
			return
		}
		quotient := f / div
		if quotient != math.Trunc(quotient) {
			vc.addError(path, "not_multiple_of",
				fmt.Sprintf("number must be a multiple of %v", div),
				fmt.Sprintf("%%%v", div), fmt.Sprintf("%v", f))
		}
	case "safe":
		// z.number().safe() — number must be a safe integer.
		if f < -9007199254740991 || f > 9007199254740991 || f != math.Trunc(f) {
			vc.addError(path, "not_safe",
				"number must be a safe integer", "safe", fmt.Sprintf("%v", f))
		}
	default:
		// Unknown constraint — skip.
	}
}

func validateBigIntConstraint(vc *validationCtx, c ConstraintNode, path []string, bi *big.Int) {
	switch c.Name {
	case "min":
		min := constraintBigIntValue(c)
		if min != nil && bi.Cmp(min) < 0 {
			vc.addError(path, "too_small",
				fmt.Sprintf("bigint must be >= %s", min.String()), ">="+min.String(), bi.String())
		}
	case "max":
		max := constraintBigIntValue(c)
		if max != nil && bi.Cmp(max) > 0 {
			vc.addError(path, "too_big",
				fmt.Sprintf("bigint must be <= %s", max.String()), "<="+max.String(), bi.String())
		}
	case "multipleOf":
		div := constraintBigIntValue(c)
		if div != nil && div.Sign() != 0 {
			rem := new(big.Int)
			if rem.Mod(bi, div).Sign() != 0 {
				vc.addError(path, "not_multiple_of",
					fmt.Sprintf("bigint must be a multiple of %s", div.String()),
					"%"+div.String(), bi.String())
			}
		}
	default:
	}
}

func validateDateConstraint(vc *validationCtx, c ConstraintNode, path []string, _ string) {
	// Date constraints would need actual time parsing.
	// For now, skip date constraints as they require full time.Time support.
	switch c.Name {
	case "min":
		vc.addError(path, "unsupported_constraint",
			"date min constraint not yet implemented", "", "")
	case "max":
		vc.addError(path, "unsupported_constraint",
			"date max constraint not yet implemented", "", "")
	}
}
