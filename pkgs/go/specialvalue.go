package zodval

import (
	"encoding/json"
	"fmt"
	"math"
	"math/big"
	"regexp"
	"strings"
	"sync"
)

// SpecialValue wraps a decoded JSON value that may use the special encoding
// defined in the JSON AST format. After decoding, .Any() returns the Go value.
// The value is lazily decoded once on first access; subsequent calls return
// the cached result. Thread-safe via sync.Once.
type SpecialValue struct {
	raw    json.RawMessage
	once   sync.Once
	cached any
}

// UnmarshalJSON implements json.Unmarshaler for SpecialValue.
func (sv *SpecialValue) UnmarshalJSON(data []byte) error {
	// Reset: UnmarshalJSON is called by the JSON decoder for each field,
	// so we need to create a fresh sync.Once each time.
	sv.raw = make(json.RawMessage, len(data))
	copy(sv.raw, data)
	sv.once = sync.Once{}
	sv.cached = nil
	return nil
}

// Any returns the decoded Go value, resolving any special encoding.
func (sv *SpecialValue) Any() any {
	if sv == nil || sv.raw == nil {
		return nil
	}
	sv.once.Do(func() {
		sv.cached = decodeRawValue(sv.raw)
	})
	return sv.cached
}

// Raw returns the raw JSON bytes.
func (sv *SpecialValue) Raw() json.RawMessage {
	if sv == nil {
		return nil
	}
	return sv.raw
}

// decodeRawValue decodes a JSON value, resolving special encoding wrappers
// like {"_bigint":"123"}, {"_regex":"/.../"}, {"_nan":true}, etc.
func decodeRawValue(data []byte) any {
	trimmed := strings.TrimSpace(string(data))
	if trimmed == "" || trimmed == "null" {
		return nil
	}

	// Check if it's an object with a special key.
	if strings.HasPrefix(trimmed, "{") {
		var probe map[string]json.RawMessage
		if err := json.Unmarshal(data, &probe); err == nil {
			if enc, ok := tryDecodeSpecialObject(probe); ok {
				return enc
			}
			// Regular JSON object.
			result := make(map[string]any)
			for k, v := range probe {
				result[k] = decodeRawValue(v)
			}
			return result
		}
	}

	// Array.
	if strings.HasPrefix(trimmed, "[") {
		var arr []json.RawMessage
		if err := json.Unmarshal(data, &arr); err == nil {
			result := make([]any, len(arr))
			for i, v := range arr {
				result[i] = decodeRawValue(v)
			}
			return result
		}
	}

	// Scalar: string, number, bool.
	var v any
	if err := json.Unmarshal(data, &v); err == nil {
		return v
	}

	return nil
}

// tryDecodeSpecialObject checks if a JSON object is a special encoding wrapper.
// Returns (decodedValue, true) if it is, or (nil, false) if it's a regular object.
func tryDecodeSpecialObject(m map[string]json.RawMessage) (any, bool) {
	if raw, ok := m["_bigint"]; ok {
		var s string
		if err := json.Unmarshal(raw, &s); err == nil {
			bi := new(big.Int)
			if _, ok := bi.SetString(s, 10); ok {
				return bi, true
			}
			return nil, false
		}
		return nil, false
	}

	if raw, ok := m["_regex"]; ok {
		var s string
		if err := json.Unmarshal(raw, &s); err == nil {
			re, err := parseRegexStr(s)
			if err != nil {
				return s, true
			}
			return re, true
		}
		return s, true
	}

	if raw, ok := m["_nan"]; ok {
		var b bool
		if err := json.Unmarshal(raw, &b); err == nil && b {
			return math.NaN(), true
		}
	}

	if raw, ok := m["_infinity"]; ok {
		var n int
		if err := json.Unmarshal(raw, &n); err == nil {
			if n >= 0 {
				return math.Inf(1), true
			}
			return math.Inf(-1), true
		}
		// Could also be a float.
		var f float64
		if err := json.Unmarshal(raw, &f); err == nil {
			if f >= 0 {
				return math.Inf(1), true
			}
			return math.Inf(-1), true
		}
	}

	if raw, ok := m["_unsupported"]; ok {
		var s string
		if err := json.Unmarshal(raw, &s); err == nil {
			return UnsupportedValue{Type: s}, true
		}
	}

	return nil, false
}

// UnsupportedValue is a sentinel for values that can't be represented in Go
// (functions, symbols, etc.).
type UnsupportedValue struct {
	Type string
}

// findLastUnescapedSlash finds the last '/' character in s that is not escaped
// by a preceding backslash. Returns -1 if no unescaped slash is found.
func findLastUnescapedSlash(s string) int {
	for i := len(s) - 1; i >= 1; i-- {
		if s[i] != '/' {
			continue
		}
		// Count consecutive backslashes before this position
		backslashes := 0
		for j := i - 1; j >= 0 && s[j] == '\\'; j-- {
			backslashes++
		}
		if backslashes%2 == 0 {
			return i // Even number of backslashes → this slash is not escaped
		}
	}
	return -1
}

// parseRegexStr parses a regex string in the form /pattern/flags.
// Flags: i (case-insensitive), m (multiline), s (dotall), plus JS-only flags
// (g, u, y) which are ignored in Go.
func parseRegexStr(s string) (*regexp.Regexp, error) {
	if len(s) < 2 || s[0] != '/' {
		// Not in /pattern/flags form; try to compile directly.
		return regexp.Compile(s)
	}

	// Find the last '/' that separates pattern from flags.
	lastSlash := findLastUnescapedSlash(s)
	if lastSlash <= 0 {
		return regexp.Compile(s)
	}

	pattern := s[1:lastSlash]
	flags := s[lastSlash+1:]

	// Translate JS regex flags to Go.
	var goPattern strings.Builder
	goPattern.WriteString("(?")

	for _, f := range flags {
		switch f {
		case 'i':
			goPattern.WriteRune('i')
		case 'm':
			goPattern.WriteRune('m')
		case 's':
			goPattern.WriteRune('s')
		case 'g', 'u', 'y':
			// JS-only flags, no Go equivalent. Ignore.
		}
	}

	goPattern.WriteByte(')')
	goPattern.WriteString(pattern)

	re, err := regexp.Compile(goPattern.String())
	if err != nil {
		return nil, fmt.Errorf("failed to compile regex %q: %w", s, err)
	}
	return re, nil
}
