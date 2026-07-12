package zodval

import (
	"math/big"
	"net"
	"net/url"
	"regexp"
)

// constraint helpers extract values from ConstraintParams (which use SpecialValue).

func constraintIntValue(c ConstraintNode) int {
	if c.Params.Value != nil {
		v := c.Params.Value.Any()
		if f, ok := toFloat(v); ok {
			return int(f)
		}
	}
	return 0
}

// constraintFloatValue extracts a numeric value from params, falling back
// through Value → Minimum → Maximum. Prefer constraintMinFloatValue and
// constraintMaxFloatValue for semantic clarity in min/max checks.
func constraintFloatValue(c ConstraintNode) float64 {
	if c.Params.Value != nil {
		if f, ok := toFloat(c.Params.Value.Any()); ok {
			return f
		}
	}
	if c.Params.Minimum != nil {
		if f, ok := toFloat(c.Params.Minimum.Any()); ok {
			return f
		}
	}
	if c.Params.Maximum != nil {
		if f, ok := toFloat(c.Params.Maximum.Any()); ok {
			return f
		}
	}
	return 0
}

// constraintMinFloatValue extracts the min bound: tries Value first, then Minimum.
func constraintMinFloatValue(c ConstraintNode) float64 {
	if c.Params.Value != nil {
		if f, ok := toFloat(c.Params.Value.Any()); ok {
			return f
		}
	}
	if c.Params.Minimum != nil {
		if f, ok := toFloat(c.Params.Minimum.Any()); ok {
			return f
		}
	}
	return 0
}

// constraintMaxFloatValue extracts the max bound: tries Value first, then Maximum.
func constraintMaxFloatValue(c ConstraintNode) float64 {
	if c.Params.Value != nil {
		if f, ok := toFloat(c.Params.Value.Any()); ok {
			return f
		}
	}
	if c.Params.Maximum != nil {
		if f, ok := toFloat(c.Params.Maximum.Any()); ok {
			return f
		}
	}
	return 0
}

func constraintStringValue(c ConstraintNode) string {
	if c.Params.Value != nil {
		if s, ok := c.Params.Value.Any().(string); ok {
			return s
		}
	}
	return ""
}

func constraintInclusive(c ConstraintNode, defaultVal bool) bool {
	if c.Params.Inclusive != nil {
		return *c.Params.Inclusive
	}
	return defaultVal
}

func constraintRegex(c ConstraintNode) *regexp.Regexp {
	if c.Params.Regex != nil {
		if re, ok := c.Params.Regex.Any().(*regexp.Regexp); ok {
			return re
		}
		// Fallback: try to parse as string.
		if s, ok := c.Params.Regex.Any().(string); ok {
			re, err := parseRegexStr(s)
			if err == nil {
				return re
			}
		}
	}
	return nil
}

// constraintBigIntValue extracts a big.Int value from params, falling back
// through Value → Minimum → Maximum. Prefer constraintMinBigIntValue and
// constraintMaxBigIntValue for semantic clarity in min/max checks.
func constraintBigIntValue(c ConstraintNode) *big.Int {
	if c.Params.Value != nil {
		if bi, ok := c.Params.Value.Any().(*big.Int); ok {
			return bi
		}
	}
	if c.Params.Minimum != nil {
		if bi, ok := c.Params.Minimum.Any().(*big.Int); ok {
			return bi
		}
	}
	if c.Params.Maximum != nil {
		if bi, ok := c.Params.Maximum.Any().(*big.Int); ok {
			return bi
		}
	}
	return nil
}

// constraintMinBigIntValue extracts the min bound: tries Value first, then Minimum.
func constraintMinBigIntValue(c ConstraintNode) *big.Int {
	if c.Params.Value != nil {
		if bi, ok := c.Params.Value.Any().(*big.Int); ok {
			return bi
		}
	}
	if c.Params.Minimum != nil {
		if bi, ok := c.Params.Minimum.Any().(*big.Int); ok {
			return bi
		}
	}
	return nil
}

// constraintMaxBigIntValue extracts the max bound: tries Value first, then Maximum.
func constraintMaxBigIntValue(c ConstraintNode) *big.Int {
	if c.Params.Value != nil {
		if bi, ok := c.Params.Value.Any().(*big.Int); ok {
			return bi
		}
	}
	if c.Params.Maximum != nil {
		if bi, ok := c.Params.Maximum.Any().(*big.Int); ok {
			return bi
		}
	}
	return nil
}

// --- Built-in string validators ---

var (
	emailRegex = regexp.MustCompile(`^[^\s@]+@[^\s@]+\.[^\s@]+$`)
	uuidRegex  = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`)
	cuidRegex  = regexp.MustCompile(`^c[a-z0-9]{20,}$`)
)

func isEmail(s string) bool {
	return emailRegex.MatchString(s)
}

func isURL(s string) bool {
	u, err := url.Parse(s)
	if err != nil || u.Scheme == "" || u.Host == "" {
		return false
	}
	return true
}

func isUUID(s string) bool {
	return uuidRegex.MatchString(s)
}

func isCUID(s string) bool {
	return cuidRegex.MatchString(s)
}

func isIP(s string) bool {
	return net.ParseIP(s) != nil
}
