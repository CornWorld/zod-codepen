# QA Report: zod-codepen Go Package & Test Files

**Reviewer:** qa-go-tests  
**Date:** 2026-07-29  
**Status:** All 92+ tests PASS

---

## Files Reviewed

### Go Source Files

| #   | File                              | Lines | Description                                                   |
| --- | --------------------------------- | ----- | ------------------------------------------------------------- |
| 1   | `pkgs/go/ast.go`                  | 389   | AST node types and interfaces                                 |
| 2   | `pkgs/go/decode.go`               | 434   | JSON AST parsing and decoding                                 |
| 3   | `pkgs/go/errors.go`               | 94    | Validation error types                                        |
| 4   | `pkgs/go/specialvalue.go`         | 210   | Special value encoding/decoding                               |
| 5   | `pkgs/go/validate.go`             | 95    | Main validation dispatcher                                    |
| 6   | `pkgs/go/validate_composite.go`   | 412   | Composite type validation (object, array, tuple, union, etc.) |
| 7   | `pkgs/go/validate_constraints.go` | 189   | Constraint helper functions                                   |
| 8   | `pkgs/go/validate_modified.go`    | 95    | Modified node validation (optional, nullable, default, etc.)  |
| 9   | `pkgs/go/validate_primitive.go`   | 550   | Primitive type validation                                     |

### Go Test Files

| #   | File                          | Lines | Description                          |
| --- | ----------------------------- | ----- | ------------------------------------ |
| 10  | `pkgs/go/decode_test.go`      | 587   | Parse/decode unit tests              |
| 11  | `pkgs/go/validate_test.go`    | 786   | Validation unit tests                |
| 12  | `pkgs/go/integration_test.go` | 364   | Integration tests (external package) |
| 13  | `pkgs/go/bench_test.go`       | 99    | Benchmark tests                      |

---

## Issues by Severity

---

# CRITICAL ISSUES (5 — must fix before production)

---

### C1 — \_bigint decode fallthrough silently drops errors

| Field         | Value                                        |
| ------------- | -------------------------------------------- |
| **File**      | `pkgs/go/specialvalue.go`                    |
| **Lines**     | 102–111                                      |
| **Component** | `tryDecodeSpecialObject` → `_bigint` handler |

**Code (lines 100–111):**

```go
func tryDecodeSpecialObject(m map[string]json.RawMessage) (any, bool) {
    if raw, ok := m["_bigint"]; ok {
        var s string
        if err := json.Unmarshal(raw, &s); err == nil {
            bi := new(big.Int)
            if _, ok := bi.SetString(s, 10); ok {
                return bi, true   // line 106: success — valid bigint
            }
            return s, true        // line 108: JSON is a string but not a valid bigint → returns raw string
        }
        return s, true            // line 110: json.Unmarshal FAILED — s = "" (zero value), returns ("", true)!
    }
```

**Description:** When `_bigint` contains a value that cannot be unmarshalled as a string (e.g., `{"_bigint": 123}`), `json.Unmarshal` fails. However, the function still returns `("", true)` — which downstream code interprets as "successfully decoded empty string". This is silent data corruption.

**Attack vector:** A malformed or malicious AST with `{"_bigint": 123}` (numeric, not string) or `{"_bigint": null}` would pass through without error, with the empty string being used for validation instead of the intended value.

**Fix:** Line 110 should return `(nil, false)` to signal decode failure. Line 108 could also return `(nil, false)` or add a prefix to distinguish the fallback string from a real bigint.

**Test coverage gap:** No test verifies behavior for non-string `_bigint` values.

---

### C2 — parseRegexStr breaks on escaped slashes in pattern

| Field         | Value                     |
| ------------- | ------------------------- |
| **File**      | `pkgs/go/specialvalue.go` |
| **Line**      | 176                       |
| **Component** | `parseRegexStr`           |

**Code (lines 169–209):**

```go
func parseRegexStr(s string) (*regexp.Regexp, error) {
    if len(s) < 2 || s[0] != '/' {
        return regexp.Compile(s)
    }
    lastSlash := strings.LastIndex(s, "/")  // ← BUG: doesn't understand escaping
    if lastSlash <= 0 {
        return regexp.Compile(s)
    }
    pattern := s[1:lastSlash]
    flags := s[lastSlash+1:]
    // ... translation logic
}
```

**Description:** The function uses `strings.LastIndex(s, "/")` to find the delimiter between pattern and flags. This does not account for escaped forward slashes (`\/`) inside the pattern.

**Example:** For input `/^https?:\/\/example\.com\//ig`:

1. `LastIndex` finds `/` at position pointing to the `\/` before `example`, not the final `/`
2. `pattern` becomes `^https?:\` (truncated!)
3. `flags` becomes `example.com\/` (nonsense)
4. Go regex compilation fails with cryptic error

**Impact:** Any Zod regex constraint using escaped forward slashes will fail validation, potentially silently (if the truncated pattern still compiles but matches incorrectly).

**Fix:** Parse the regex format properly by scanning from the end, tracking character escapes (checking if `/` is preceded by an odd number of `\` characters). Or use a proper regex delimiter parser.

**Test coverage gap:** No test verifies regex with escaped forward slashes (`\/`).

---

### C3 — Discriminated union ignores ModifiedNode-wrapped options

| Field         | Value                           |
| ------------- | ------------------------------- |
| **File**      | `pkgs/go/validate_composite.go` |
| **Lines**     | 306–308                         |
| **Component** | `validateDiscriminatedUnion`    |

**Code (lines 306–325):**

```go
for _, opt := range n.Options {
    optObj, ok := opt.(*ObjectNode)
    if !ok {
        continue  // ← BUG: silently skips ModifiedNode!
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
            validate(vc, opt, path, input)
            return
        }
    }
}
```

**Description:** The discriminator matching loop attempts to cast each option to `*ObjectNode`. Options that are not bare `*ObjectNode` are silently skipped with `continue`. However, in the Zod AST, a discriminated union variant wrapped with `optional()`, `nullable()`, `default()`, or `readonly()` becomes a `*ModifiedNode` containing an inner `*ObjectNode`. These wrapped variants are completely invisible to the discriminator matching logic.

**Common Zod pattern that breaks:**

```typescript
z.discriminatedUnion("type", [
  z.object({ type: z.literal("a"), value: z.string() }).optional(), // ModifiedNode wrapping ObjectNode
  z.object({ type: z.literal("b"), value: z.number() }),
]);
```

**Impact:** The first variant is silently skipped. The input `{type: "a", value: "hello"}` fails validation with "discriminator value does not match any option" — even though "a" is a valid discriminator value.

**Fix:** Before checking discriminator fields, recursively unwrap `*ModifiedNode` (and potentially `*LazyNode`, `*PromiseNode`) to reach the inner `*ObjectNode`. Something like:

```go
func unwrapToObject(n IRNode) *ObjectNode {
    for {
        switch v := n.(type) {
        case *ObjectNode:
            return v
        case *ModifiedNode:
            n = v.Inner
        default:
            return nil
        }
    }
}
```

**Test coverage gap:** No test covers discriminated union with modifier-wrapped variants.

---

### C4 — setElementKey uses non-deterministic map serialization

| Field         | Value                           |
| ------------- | ------------------------------- |
| **File**      | `pkgs/go/validate_composite.go` |
| **Lines**     | 240–254                         |
| **Component** | `setElementKey`                 |

**Code (lines 240–255):**

```go
func setElementKey(elem any) string {
    switch v := elem.(type) {
    case string, bool, float64, int, int64:
        return fmt.Sprint(v)
    case *big.Int:
        return "bigint:" + v.String()
    case nil:
        return "null"
    case map[string]any:
        return fmt.Sprintf("obj:%v", v)   // ← NON-DETERMINISTIC
    case []any:
        return fmt.Sprintf("arr:%v", v)   // ← NON-DETERMINISTIC for nested maps
    default:
        return fmt.Sprintf("%T:%v", elem, elem)
    }
}
```

**Description:** Go's `fmt.Sprintf("%v", v)` for `map[string]any` produces non-deterministic output because Go intentionally randomizes map iteration order (specifically, map iteration order is randomized in Go 1.12+).

- `map[string]any{"a": 1, "b": 2}` may format as `"obj:map[a:1 b:2]"` or `"obj:map[b:2 a:1]"`
- Two identical maps could produce different keys → both kept in the set (false duplicate negative)
- Two different maps could produce the same key by coincidence → one incorrectly rejected (false duplicate positive)
- The `[]any` case is also non-deterministic when the array contains maps

**Impact:** Set uniqueness validation for sets with object/map elements is non-deterministic. The same valid input may pass or fail on different runs.

**Fix:** Use deterministic serialization:

- `json.Marshal` with sorted keys (custom marshaller)
- Collect keys, sort them, then format
- Use a structural hash (e.g., sorted-key SHA-256)

**Test coverage gap:** No test verifies set uniqueness with map/object elements.

---

### C5 — deepEqual(NaN, NaN) returns false

| Field         | Value                           |
| ------------- | ------------------------------- |
| **File**      | `pkgs/go/validate_composite.go` |
| **Lines**     | 398–401                         |
| **Component** | `deepEqual`                     |

**Code (lines 397–406):**

```go
// Number comparison (float64 with int).
if fa, ok := toFloat(a); ok {
    if fb, ok := toFloat(b); ok {
        return fa == fb   // NaN == NaN is ALWAYS false per IEEE 754
    }
}
// Direct equality.
return a == b
```

**Description:** `toFloat(math.NaN())` returns `(NaN, true)`. When `a` and `b` are both `NaN`, `fa == fb` evaluates to `false` per IEEE 754. This means `deepEqual(NaN, NaN)` returns `false`.

**Impact on `z.literal(NaN)`:** A Zod literal check `z.literal(NaN).parse(NaN)` should succeed in Zod. In this Go validator, it would fail.

**Note:** This technically matches JavaScript behavior (`NaN !== NaN`), so it's correct per JS semantics. However, `deepEqual` is meant for value comparison, and `z.literal(NaN)` is a valid Zod pattern. Flagged for awareness — if `deepEqual` is intended to match JS `===` semantics, this is correct. If it's intended for value equivalence, it's wrong.

**Fix:** Add explicit NaN handling:

```go
if fa, ok := toFloat(a); ok {
    if fb, ok := toFloat(b); ok {
        if math.IsNaN(fa) && math.IsNaN(fb) {
            return true
        }
        return fa == fb
    }
}
```

**Test coverage gap:** No test for `deepEqual` with NaN, Infinity, or big.Int values.

---

# HIGH ISSUES (6 — should fix next iteration)

---

### H1 — Missing ISO 8601 date format (milliseconds without timezone)

| Field         | Value                           |
| ------------- | ------------------------------- |
| **File**      | `pkgs/go/validate_primitive.go` |
| **Lines**     | 264–282                         |
| **Component** | `parseDateString`               |

**Code (lines 264–282):**

```go
func parseDateString(s string) (time.Time, error) {
    // Try date-only format.
    if len(s) == 10 && s[4] == '-' && s[7] == '-' {
        return time.Parse("2006-01-02", s)
    }
    // Try full ISO 8601 with timezone.
    if t, err := time.Parse(time.RFC3339, s); err == nil {
        return t, nil
    }
    // Try datetime without timezone.
    if t, err := time.Parse("2006-01-02T15:04:05", s); err == nil {
        return t, nil
    }
    // Try with milliseconds.
    if t, err := time.Parse("2006-01-02T15:04:05.000Z", s); err == nil {
        return t, nil
    }
    return time.Time{}, fmt.Errorf("unrecognized date format")
}
```

**Description:** The format chain has a gap. A timestamp like `"2024-01-15T10:30:00.123"` (milliseconds, no timezone) fails all attempts:

1. Length > 10 → fails date-only check
2. `time.RFC3339` requires timezone → fails
3. `"2006-01-02T15:04:05"` has no fraction support → `.123` exceeds expected length → fails
4. `"2006-01-02T15:04:05.000Z"` requires `Z` suffix → fails

**Also missing:**

- `"2006-01-02T15:04:05.000"` (milliseconds, no timezone)
- `"2006-01-02 15:04:05"` (space-separated ISO 8601 variant)
- `"2006-01-02T15:04:05.000Z07:00"` (ms with timezone offset instead of Z)
- Nanosecond precision formats

**Impact:** Valid ISO 8601 timestamps with millisecond precision and no timezone are rejected.

**Fix:** Add the missing format strings to the parse chain.

---

### H2 — \_infinity: 0 decoded as +Inf

| Field         | Value                                          |
| ------------- | ---------------------------------------------- |
| **File**      | `pkgs/go/specialvalue.go`                      |
| **Lines**     | 132–148                                        |
| **Component** | `tryDecodeSpecialObject` → `_infinity` handler |

**Code (lines 132–148):**

```go
if raw, ok := m["_infinity"]; ok {
    var n int
    if err := json.Unmarshal(raw, &n); err == nil {
        if n >= 0 {
            return math.Inf(1), true    // 0 → +Inf
        }
        return math.Inf(-1), true       // -1 → -Inf
    }
    // Could also be a float.
    var f float64
    if err := json.Unmarshal(raw, &f); err == nil {
        if f >= 0 {
            return math.Inf(1), true    // 0.0 → +Inf
        }
        return math.Inf(-1), true
    }
}
```

**Description:** When `_infinity` value is `0`, the check `n >= 0` evaluates to `true`, and `math.Inf(1)` is returned. Zero is treated identically to positive infinity. The TS side would never emit `_infinity: 0`, but malformed AST input could trigger this silent data corruption.

**Impact:** A value that should represent "zero" or "not infinity" is silently treated as positive infinity. This could cause validation to accept/reject values incorrectly.

**Fix:** Add explicit check: `if n <= 0 { return nil, false }` for the zero case, or use strict positive/negative checks.

---

### H3 — PrimUndef and PrimVoid have identical behavior

| Field         | Value                                        |
| ------------- | -------------------------------------------- |
| **File**      | `pkgs/go/validate_primitive.go`              |
| **Lines**     | 34–43                                        |
| **Component** | `validatePrimitive` → `PrimUndef`/`PrimVoid` |

**Code (lines 34–43):**

```go
case PrimUndef, PrimVoid:
    if input != nil {
        vc.addError(path, "invalid_type",
            "expected undefined", "undefined", fmt.Sprintf("%T", input))
    }
```

**Description:** Both `z.undefined()` and `z.void()` are treated identically — they accept `nil` and reject everything else. In Zod:

- `z.undefined()` accepts ONLY `undefined`
- `z.void()` accepts `undefined` OR `null`

In JSON, `undefined` doesn't exist (absent fields become Go `nil`). However, `null` in JSON becomes Go `nil` too. So:

- `z.undefined()` incorrectly accepts `null` (JSON null → Go nil)
- `z.void()` correctly accepts `null` (nil ≈ null)

**Impact:** `z.undefined()` is overly permissive — it accepts JSON `null` when it should reject it. This is a semantic mismatch with Zod behavior.

**Fix:** Split the cases: `PrimUndef` should reject `nil` (since nil represents JSON null, not JS undefined), while `PrimVoid` should accept `nil`.

---

### H4 — coerceValue string uses Go-specific fmt.Sprint formatting

| Field         | Value                           |
| ------------- | ------------------------------- |
| **File**      | `pkgs/go/validate_primitive.go` |
| **Line**      | 151                             |
| **Component** | `coerceValue` → `PrimString`    |

**Code (lines 149–151):**

```go
case PrimString:
    return fmt.Sprint(input)
```

**Description:** `fmt.Sprint` produces Go-specific string representations that differ from JavaScript's `String()`:

| Input Type              | Go `fmt.Sprint` | JS `String()`       | Match? |
| ----------------------- | --------------- | ------------------- | ------ |
| `[]any{1, 2, 3}`        | `"[1 2 3]"`     | `"1,2,3"`           | ✗      |
| `map[string]any{"a":1}` | `"map[a:1]"`    | `"[object Object]"` | ✗      |
| `true`                  | `"true"`        | `"true"`            | ✓      |
| `42`                    | `"42"`          | `"42"`              | ✓      |
| `nil`                   | `"<nil>"`       | `"null"`            | ✗      |
| `float64(3.14)`         | `"3.14"`        | `"3.14"`            | ✓      |

**Impact:** Coerced string values differ between Go validation and actual Zod behavior, breaking the "equivalent to Zod's .parse()" contract. This matters when the coerced value is then validated against string constraints (e.g., `.min()` on a coerced array string).

**Fix:** Implement JS-compatible coercion with explicit formatting for each type.

---

### H5 — coerceValue number doesn't handle hex/binary/octal strings

| Field         | Value                                        |
| ------------- | -------------------------------------------- |
| **File**      | `pkgs/go/validate_primitive.go`              |
| **Lines**     | 158–162                                      |
| **Component** | `coerceValue` → `PrimNumber` string handling |

**Code (lines 158–162):**

```go
if s, ok := input.(string); ok {
    if v, err := strconv.ParseFloat(s, 64); err == nil {
        return v
    }
}
```

**Description:** `strconv.ParseFloat` does not handle JavaScript's numeric prefixes:

- `"0xFF"` → ParseFloat fails (JS: `Number("0xFF")` = 255)
- `"0b1010"` → ParseFloat fails (JS: `Number("0b1010")` = 10)
- `"0o777"` → ParseFloat fails (JS: `Number("0o777")` = 511)

**Impact:** `z.coerce.number()` would successfully coerce `"0xff"` to `255`, but this Go implementation leaves it uncoerced. The original string is returned, which then fails type checking.

**Fix:** Add hex/binary/octal parsing before falling back to ParseFloat:

```go
if s, ok := input.(string); ok {
    if strings.HasPrefix(s, "0x") || strings.HasPrefix(s, "0X") {
        if v, err := strconv.ParseInt(s[2:], 16, 64); err == nil {
            return float64(v)
        }
    }
    // ... similar for 0b and 0o prefixes
    if v, err := strconv.ParseFloat(s, 64); err == nil {
        return v
    }
}
```

---

### H6 — validationCtx not safe for concurrent use

| Field         | Value               |
| ------------- | ------------------- |
| **File**      | `pkgs/go/errors.go` |
| **Lines**     | 70–88               |
| **Component** | `validationCtx`     |

**Code (lines 70–88):**

```go
type validationCtx struct {
    result *ValidationResult
}

func (vc *validationCtx) addError(path []string, code, message, expected, received string) {
    vc.result.Errors = append(vc.result.Errors, &ValidationError{...})
}
```

**Description:** `validationCtx.addError` appends to the shared `Errors` slice without any synchronization. While single-threaded recursive tree walk is the expected usage pattern, nothing prevents concurrent misuse:

- Calling `ValidateNode` from multiple goroutines with the same node
- Future optimizations that parallelize validation
- The union validator creates independent sub-contexts but the main context is shared

**Impact:** Under concurrent use, the `append` to `Errors` slice can race, causing data corruption, panics (concurrent write to slice), or lost error reports.

**Fix:** Either:

1. Add a `sync.Mutex` to `validationCtx` and lock in `addError`
2. Or clearly document that `ValidationResult` and `validationCtx` are not safe for concurrent use

---

# MEDIUM ISSUES (7)

---

### M1 — constraintFloatValue confusing fallback chain

| Field         | Value                             |
| ------------- | --------------------------------- |
| **File**      | `pkgs/go/validate_constraints.go` |
| **Lines**     | 25–42                             |
| **Component** | `constraintFloatValue`            |

**Code (lines 25–42):**

```go
func constraintFloatValue(c ConstraintNode) float64 {
    if c.Params.Value != nil {
        if f, ok := toFloat(c.Params.Value.Any()); ok {
            return f
        }
    }
    if c.Params.Minimum != nil {  // ← fallback to Minimum
        ...
    }
    if c.Params.Maximum != nil {  // ← fallback to Maximum
        ...
    }
    return 0
}
```

**Description:** The function cascades through Value → Minimum → Maximum. Both `min` and `max` constraint handlers call this same generic function. If a constraint has only `Maximum` set (some schemas may structure params this way), a `min` check would silently use the Maximum value as the minimum — which is logically incorrect.

The same pattern exists in `constraintBigIntValue` (lines 109–126).

Separate functions `constraintMinFloatValue` and `constraintMaxFloatValue` exist specifically to avoid this ambiguity, but not all callers use them consistently.

**Fix:** Audit all callers and use `constraintMinFloatValue` / `constraintMaxFloatValue` for `min`/`max` checks respectively, reserving the generic function only for cases where the param field is semantically `value`.

---

### M2 — maxParseDepth of 256 may approach stack limits

| Field         | Value               |
| ------------- | ------------------- |
| **File**      | `pkgs/go/decode.go` |
| **Line**      | 11                  |
| **Component** | `maxParseDepth`     |

**Code (lines 8–12):**

```go
const (
    maxParseDepth = 256
)
```

**Description:** Go's default goroutine stack starts at ~2 KB and grows dynamically. However, each recursive call in `parseNode` involves several struct allocations and function frames. At 256 levels of recursion for complex nested schemas, this could approach stack limits or cause performance degradation.

**Recommendation:** Document the recursion limit and whether it's configurable. Consider adding a benchmark for deeply nested schemas.

---

### M3 — Discarded big.Float accuracy in toFloat

| Field         | Value                           |
| ------------- | ------------------------------- |
| **File**      | `pkgs/go/validate_primitive.go` |
| **Lines**     | 222–228                         |
| **Component** | `toFloat` → `*big.Int` handling |

**Code (lines 222–228):**

```go
case *big.Int:
    f, acc := new(big.Float).SetInt(v).Float64()
    // For values too large/precise for float64, accuracy is lost.
    // We still return the float64 approximation but mark it as
    // a valid number. Callers should be aware that constraints
    // (min/max) on extremely large big.Ints may be imprecise.
    _ = acc
    return f, true
```

**Description:** The accuracy result from `big.Float.Float64()` is discarded with `_ = acc`. For big.Int values larger than 2^53, float64 loses precision silently. The comment explains this, but the function still returns `true` for "was convertible to float" even when precision was lost.

**Impact:** A big.Int with value `2^53 + 1` would be converted to `float64(2^53)`, which equals `9007199254740992` instead of `9007199254740993`. Constraint checks (min/max) would use this imprecise value.

**Fix:** Check the accuracy and return `false` when accuracy is lost:

```go
case *big.Int:
    f, acc := new(big.Float).SetInt(v).Float64()
    if acc == big.Above || acc == big.Below {
        return 0, false  // precision would be lost
    }
    return f, true
```

---

### M4 — validateIntersection doesn't merge objects

| Field         | Value                           |
| ------------- | ------------------------------- |
| **File**      | `pkgs/go/validate_composite.go` |
| **Lines**     | 257–262                         |
| **Component** | `validateIntersection`          |

**Code (lines 257–262):**

```go
func validateIntersection(vc *validationCtx, n *IntersectionNode, path []string, input any) {
    // Both left and right schemas must validate successfully.
    // We run both even if the first fails, to collect all errors.
    validate(vc, n.Left, path, input)
    validate(vc, n.Right, path, input)
}
```

**Description:** Zod's `z.intersection(A, B)` for objects produces a merged type (combining fields from both A and B). This Go implementation just runs both validators independently. For validation purposes this is correct — a value must satisfy both schemas. However, error messages could be confusing when both A and B define the same field with different types (both errors fire rather than a single merged error).

**Note:** This is an architectural limitation, not a bug. For pure validation (no type transformation), running both validators is sufficient.

**Recommendation:** Document this limitation. If future versions need to support `z.intersection().and()` merging, a different approach would be needed.

---

### M5 — validateMap with map[string]any always uses string keys

| Field         | Value                           |
| ------------- | ------------------------------- |
| **File**      | `pkgs/go/validate_composite.go` |
| **Line**      | 179                             |
| **Component** | `validateMap`                   |

**Code (lines 176–184):**

```go
case map[string]any:
    for key, val := range v {
        entryPath := clonePath(path)
        entryPath = append(entryPath, key)
        validate(vc, n.Key, entryPath, key)  // key is always string
        validate(vc, n.Value, entryPath, val)
    }
```

**Description:** When the input is `map[string]any`, all keys are Go strings. If the Zod schema specifies a non-string key type (e.g., `z.map(z.number(), z.string())`), validation will always fail because the key schema receives a string instead of a number. The `[]any` pair form handles this correctly by passing the raw key value.

**Impact:** `z.map(z.number(), z.string())` validated against `{"1": "a", "2": "b"}` would fail because `n.Key` (a number schema) receives `"1"` (string).

**Note:** This is a fundamental JSON limitation — JSON object keys are always strings. The behavior matches what you'd get from JSON.parse().

**Fix:** Document the limitation. Optionally attempt to parse string keys as the expected type when the key schema expects a number.

---

### M6 — cuid2 constraint is just cuid1 check

| Field         | Value                                  |
| ------------- | -------------------------------------- |
| **File**      | `pkgs/go/validate_primitive.go`        |
| **Lines**     | 373–376                                |
| **Component** | `validateStringConstraint` → `"cuid2"` |

**Code (lines 373–376):**

```go
case "cuid2":
    if !isCUID(s) { // simplified
        vc.addError(path, "invalid_string", "invalid CUID2", "cuid2", s)
    }
```

**Description:** The `"cuid2"` constraint just calls `isCUID(s)`, which uses the CUID1 regex `^c[a-z0-9]{20,}$`. CUID2 has a different format:

- CUID1: starts with `c`, 21+ alphanumeric chars
- CUID2: starts with one of several prefixes, different length requirements

The `// simplified` comment acknowledges this approximation.

**Impact:** Valid CUID2 values may fail validation (false negative), and invalid CUID2 values that happen to match CUID1 format may pass (false positive).

**Fix:** Implement a proper CUID2 regex or document the limitation prominently with a recommendation for users needing exact CUID2 validation.

---

### M7 — emailRegex is overly simplistic

| Field         | Value                             |
| ------------- | --------------------------------- |
| **File**      | `pkgs/go/validate_constraints.go` |
| **Line**      | 161                               |
| **Component** | `emailRegex`                      |

**Code (line 161):**

```go
var (
    emailRegex = regexp.MustCompile(`^[^\s@]+@[^\s@]+\.[^\s@]+$`)
)
```

**Description:** The email regex is particularly permissive:

- Accepts `"a@b.c"` (valid per RFC 5321, but unusually short)
- Accepts `"user@host..com"` (double dot in domain)
- Accepts `"user@[IP]"` without proper IPv4/IPv6 handling
- Accepts unicode characters in local part without normalization

**Impact:** The email validation is more permissive than Zod's own email validation. Zod uses a more comprehensive regex that catches more invalid patterns. This is a behavioral mismatch with Zod.

**Note:** Neither Go's nor Zod's email validation is RFC 5322 compliant (that regex is notoriously complex). However, differences between the two implementations can lead to surprising failures in Go when Zod accepted an email, or vice versa.

**Fix:** Either use a more comprehensive regex that matches Zod's behavior, or document the differences.

---

# LOW ISSUES (5)

---

### L1 — ValidationResult.Error() returns "" on success

| Field         | Value                      |
| ------------- | -------------------------- |
| **File**      | `pkgs/go/errors.go`        |
| **Lines**     | 50–52                      |
| **Component** | `ValidationResult.Error()` |

**Code (lines 50–59):**

```go
func (r *ValidationResult) Error() string {
    if r.IsValid() {
        return ""
    }
    var parts []string
    for _, e := range r.Errors {
        parts = append(parts, e.Error())
    }
    return strings.Join(parts, "; ")
}
```

**Description:** `ValidationResult` implements the `error` interface by returning empty string when valid. This is a standard Go pattern, but `ValidateSchema` returns `*ValidationResult` (not `error`). Callers must explicitly check `.IsValid()` first.

**Recommendation:** Document the usage pattern: always check `.IsValid()` or use `.First()` to check for errors.

---

### L2 — isURL doesn't require TLD dot in hostname

| Field         | Value                             |
| ------------- | --------------------------------- |
| **File**      | `pkgs/go/validate_constraints.go` |
| **Lines**     | 170–176                           |
| **Component** | `isURL`                           |

**Code (lines 170–176):**

```go
func isURL(s string) bool {
    u, err := url.Parse(s)
    if err != nil || u.Scheme == "" || u.Host == "" {
        return false
    }
    return true
}
```

**Description:** Accepts `"http://a"` as a valid URL because `url.Parse` parses it as scheme `http`, host `a`. Zod's URL validation requires at least a dot in the hostname (e.g., `"example.com"` vs just `"a"`).

**Impact:** `z.string().url()` in Zod would reject `"http://a"`, but the Go validator would accept it.

**Fix:** Add a check for at least one dot in the host: `strings.Contains(u.Host, ".")`.

---

### L3 — goTypeName returns "number" for all numeric types

| Field         | Value                           |
| ------------- | ------------------------------- |
| **File**      | `pkgs/go/validate_primitive.go` |
| **Lines**     | 242–243                         |
| **Component** | `goTypeName`                    |

**Code (lines 242–243):**

```go
case float64, float32, int, int64, int32, int16, int8, uint, uint64, uint32, uint16, uint8:
    return "number"
```

**Description:** All numeric Go types are reported as `"number"` in error messages. This is correct for Zod compatibility (Zod uses `"number"` as the type name) but loses type specificity for debugging.

**Recommendation:** This is correct behavior for Zod compatibility. No change needed unless debugging-specific type information is desired.

---

### L4 — No tests for combined regex flags or escaped slashes

| **File**                 | Missing Tests                            |
| ------------------------ | ---------------------------------------- |
| `pkgs/go/decode_test.go` | Combined flags (`"gi"`, `"im"`, `"msi"`) |
| `pkgs/go/decode_test.go` | Escaped slashes in pattern               |
| `pkgs/go/decode_test.go` | Empty pattern `"//"`                     |
| `pkgs/go/decode_test.go` | Go-incompatible JS flags (`u`, `y`)      |
| `pkgs/go/decode_test.go` | Flag-only pattern `"/pattern/"`          |

**Impact:** The `parseRegexStr` function has limited test coverage for the flag parsing logic. Changes to this code could introduce regressions that aren't caught by existing tests.

---

### L5 — No test for `g` (global) flag handling

| Field              | Value                             |
| ------------------ | --------------------------------- |
| **File**           | `pkgs/go/validate_constraints.go` |
| **Relevant lines** | 90–104 (`constraintRegex`)        |
| **Test file**      | `pkgs/go/decode_test.go`          |

**Description:** The `g` (global) flag has no Go equivalent and is correctly ignored in `parseRegexStr`. However, there is no explicit test verifying this behavior. A future contributor might accidentally change the flag handling and break compatibility with JS regex patterns that include the `g` flag.

---

# MISSING TEST COVERAGE — Comprehensive List

## decode_test.go gaps

| Missing Test                                                                                      | Description                                              |
| ------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Parse every PrimitiveName (bigint, date, symbol, null, undefined, any, unknown, never, void, nan) | Only string, number, and boolean are tested              |
| Literal with negative numeric value                                                               | `{"kind":"literal","value":-42}`                         |
| Literal with floating-point value                                                                 | `{"kind":"literal","value":3.14}`                        |
| Literal with NaN                                                                                  | `{"kind":"literal","value":{"_nan":true}}`               |
| Literal with Infinity                                                                             | `{"kind":"literal","value":{"_infinity":1}}`             |
| Literal with UnsupportedValue                                                                     | `{"kind":"literal","value":{"_unsupported":"function"}}` |
| ParseNode with unknown kind                                                                       | Should return error                                      |
| ParseNode with malformed JSON                                                                     | Should return error                                      |
| ParseDocument with missing schemas field                                                          | Should handle gracefully                                 |
| ParseDocument with empty schemas                                                                  | `{"version":1,"schemas":{}}`                             |
| ParseDocument with invalid version (< 1)                                                          | Only tests version > 1                                   |
| Symbol primitive parsing                                                                          | `{"kind":"primitive","primitive":"symbol"}`              |
| NaN primitive parsing                                                                             | `{"kind":"primitive","primitive":"nan"}`                 |
| Void primitive parsing                                                                            | `{"kind":"primitive","primitive":"void"}`                |
| BigInt primitive parsing                                                                          | `{"kind":"primitive","primitive":"bigint"}`              |
| Date primitive parsing                                                                            | `{"kind":"primitive","primitive":"date"}`                |
| \_bigint with non-string value                                                                    | `{"_bigint":123}` — edge case for C1                     |
| \_bigint with non-numeric string                                                                  | `{"_bigint":"abc"}` — edge case for C1                   |
| Regex with escaped slash                                                                          | `"/^https?:\\/\\//i"` — edge case for C2                 |
| Regex with combined flags                                                                         | `"/pattern/gi"`, `"/pattern/ms"`                         |
| Regex with empty pattern                                                                          | `"//"`                                                   |
| Regex with dotall+multiline                                                                       | `"/pattern/ms"` or `"/pattern/sm"`                       |
| Go-only regex (no /pattern/ syntax)                                                               | `"^[a-z]+$"` (no delimiters)                             |
| Regular JSON object via SpecialValue                                                              | `{"key":"value"}`                                        |
| Regular JSON array via SpecialValue                                                               | `[1,2,3]`                                                |
| Nested special values                                                                             | `{"nested":{"_bigint":"123"}}`                           |

## validate_test.go gaps

| Missing Test                               | Description                                     |
| ------------------------------------------ | ----------------------------------------------- |
| BigInt primitive validation                | `z.bigint()` basic validation                   |
| Date primitive validation                  | `z.date()` basic validation                     |
| Symbol primitive → should always fail      | `z.symbol()` in JSON context                    |
| Void primitive acceptance                  | `z.void()` with nil                             |
| Undefined primitive acceptance             | `z.undefined()` with nil                        |
| startsWith constraint                      | `z.string().startsWith("prefix")`               |
| endsWith constraint                        | `z.string().endsWith("suffix")`                 |
| includes constraint                        | `z.string().includes("substr")`                 |
| datetime string constraint                 | `z.string().datetime()`                         |
| IP address string constraint               | `z.string().ip()`                               |
| CUID string constraint                     | `z.string().cuid()`                             |
| CUID2 string constraint                    | `z.string().cuid2()` (currently just alias)     |
| trim transform (should be no-op)           | `z.string().trim()`                             |
| toLowerCase/toUpperCase transforms (no-op) | `z.string().toLowerCase()`                      |
| negative constraint                        | `z.number().negative()`                         |
| non-positive constraint                    | `z.number().nonpositive()`                      |
| finite constraint                          | `z.number().finite()`                           |
| safe integer constraint                    | `z.number().safe()`                             |
| min with inclusive=false                   | `z.number().gt(5)` (not `gte`)                  |
| max with inclusive=false                   | `z.number().lt(10)` (not `lte`)                 |
| multipleOf: 0 edge case                    | Division by zero                                |
| BigInt min constraint                      | `z.bigint().min()`                              |
| BigInt max constraint                      | `z.bigint().max()`                              |
| BigInt multipleOf constraint               | `z.bigint().multipleOf()`                       |
| Date min constraint                        | `z.date().min()`                                |
| Date max constraint                        | `z.date().max()`                                |
| Object with no fields                      | Empty object `z.object({})`                     |
| Object with default value field            | Optional field with default                     |
| Object with catchall in strip mode         | catchall in strip mode                          |
| Object with catchall in strict mode        | catchall in strict mode                         |
| Array length constraint                    | `z.array().length()`                            |
| Array max constraint                       | `z.array().max()`                               |
| Tuple with rest element                    | `z.tuple([...]).rest()`                         |
| Tuple too short                            | Fewer items than tuple defines                  |
| Tuple too long no rest                     | More items than tuple defines without rest      |
| Record with non-string key                 | `z.record(z.number(), z.string())`              |
| Map with array-of-pairs input              | `z.map()` with `[[k,v]]` input                  |
| Map with malformed pairs                   | `[[1]]` instead of `[k, v]`                     |
| Set without constraints                    | Element validation only                         |
| Set uniqueness with complex elements       | Objects/maps in set — edge case for C4          |
| Intersection of two objects                | Different fields on left/right                  |
| Intersection with type conflict            | Same field, different types                     |
| Union with three+ options                  | More than 2 options                             |
| Union failure error collection             | Proper error when no option matches             |
| Discriminated union with modifiers         | optional/nullable variants — edge case for C3   |
| Discriminated union nested objects         | Complex nested object options                   |
| Nullish modifier with nil input            | `z.string().nullish()`                          |
| Catch modifier with nil input              | `z.string().catch("fallback")`                  |
| Prefault modifier with nil input           | `z.string().prefault("fallback")`               |
| Brand modifier (no-op)                     | `z.string().brand("myBrand")`                   |
| Chained modifiers                          | `z.string().optional().default("x").brand("B")` |
| Coerced bigint                             | `z.coerce.bigint()`                             |
| Coerced boolean with falsy values          | 0, "", null, false                              |
| Coerced boolean with truthy values         | 1, "hello", {}                                  |
| Lazy placeholder (accept anything)         | `z.lazy(() => ...)` placeholder                 |
| Promise validation                         | `z.promise()` inner validation                  |
| Pipe validation                            | Validates 'in' only                             |
| Transform → unsupported error              | Clear error message                             |
| Refine → unsupported error                 | Clear error message                             |
| Preprocess → unsupported error             | Clear error message                             |
| Fallback → fallback error                  | Error from serialization                        |
| Raw → unsupported error                    | Raw schema node                                 |
| JSON input with nested objects             | Deeply nested JSON validation                   |
| Error string with code                     | Format `[code] path: message`                   |
| Error string without code                  | Format `path: message`                          |
| FormatPath for root path                   | Empty path → `<root>`                           |
| FormatPath for nested path                 | `["a","b","c"]` → `"a.b.c"`                     |
| First() for non-empty result               | Returns the first error                         |

## integration_test.go gaps

| Missing Test                            | Description                   |
| --------------------------------------- | ----------------------------- |
| Nil input for every schema type         | Edge case handling            |
| All primitive types against real schema | Real-world validation         |
| Deeply nested object validation         | Complex nested structures     |
| Self-referencing (lazy) schema          | Circular references           |
| All Block discriminated union variants  | Every variant in Block type   |
| Valid type but invalid subfield         | e.g., text block without body |
| Enum value case sensitivity             | "DRAFT" vs "draft"            |
| Leading/trailing whitespace handling    | String constraint edge cases  |
| Very large integer values               | MaxInt64 boundary             |
| Zero values for all types               | Boundary testing              |
| Multiple error collection               | Not fail-fast verification    |
| Error message format verification       | Match expected patterns       |

## bench_test.go gaps

| Missing Test                              | Description                  |
| ----------------------------------------- | ---------------------------- |
| Deeply nested object benchmark            | Stack depth performance      |
| Large array validation benchmark          | Array iteration performance  |
| Discriminated union all options benchmark | Worst-case union dispatch    |
| Large document parse benchmark            | Document parsing performance |

---

# CODE QUALITY OBSERVATIONS

## Strengths

1. **Excellent architecture**: Clean separation of concerns — `ast.go` (types) → `decode.go` (parsing) → `validate.go` (dispatch) → `validate_primitive.go` / `validate_composite.go` / `validate_modified.go` (type-specific validation) → `validate_constraints.go` (shared constraints). Makes the code easy to navigate and extend.

2. **Depth protection**: `maxParseDepth` (256) prevents stack overflow from deeply nested JSON AST files. A well-designed safety measure.

3. **Thread-safe SpecialValue**: `sync.Once` ensures lazy decoding of special values is race-free. The `UnmarshalJSON` method properly resets the `sync.Once` for each decode cycle.

4. **Comprehensive error collection**: `ValidationResult` collects all errors rather than failing fast (matching Zod's behavior that reports all validation issues at once). The `clonePath` function correctly prevents slice mutation across recursive calls.

5. **Forward-compatible constraint handling**: Unknown constraint names and primitive types are silently skipped, preventing crashes when the TS side adds new constraint types that the Go side doesn't yet handle.

6. **Graceful handling of JS-specific schemas**: Transform, Refine, Preprocess, ZodFunction, Fallback, and Raw nodes all produce clear, descriptive error messages explaining why they can't be validated in Go.

7. **Path cloning safety**: `clonePath` followed by `append` in recursive validation prevents the common Go gotcha of slice backing array mutation.

8. **Test quality**: 92+ tests pass, covering the basic happy paths and common failure modes. The fixture-based tests (JSON files in `testdata/`) are well-structured and provide integration-level coverage.

9. **Benchmark infrastructure**: Benchmarks measure both valid-path validation and full pipeline (parse + validate) performance.

## Style / Maintainability Concerns

1. **Repetitive constraint extractors**: `constraintFloatValue`, `constraintMinFloatValue`, `constraintMaxFloatValue` have nearly identical structure (only differ in which params they check). The same pattern repeats for BigInt variants. Consider a generic extractor or code generation.

2. **Repetitive decode functions**: `decodeArray`, `decodeSet`, `decodeTransform`, `decodeRefine`, `decodePreprocess` all follow the same pattern: decode struct → decode inner child node → set field. Consider a generic `decodeWrapper` helper.

3. **Magic strings for constraint names**: Constraint names like `"min"`, `"max"`, `"email"`, `"url"`, etc. are used directly as string literals in switch cases. No typed constants defined. This could lead to typos or inconsistencies.

4. **Large switch-case functions**: `validateStringConstraint` (~100 lines), `validateNumberConstraint` (~80 lines), and `validatePrimitive` (~60 lines) are long switch functions that could benefit from being split into separate files or using a strategy pattern.

5. **No interface for validation functions**: All `validate*` functions are package-level functions with the same signature but no interface tying them together. This makes it harder to add new types dynamically.

---

# OVERALL VERDICT: PASS WITH CONCERNS

## Summary

| Category     | Count | Status                     |
| ------------ | ----- | -------------------------- |
| **Critical** | 5     | Must fix before production |
| **High**     | 6     | Should fix next iteration  |
| **Medium**   | 7     | Should address             |
| **Low**      | 5     | Note / document            |
| **Tests**    | 92+   | All pass                   |

## Must-Fix (Pre-Merge)

1. **C1** — `_bigint` decode fallthrough returns empty string on JSON unmarshal error (`specialvalue.go:110`)
2. **C2** — `parseRegexStr` broken on escaped forward slashes in pattern (`specialvalue.go:176`)
3. **C3** — Discriminated union ignores `ModifiedNode`-wrapped object options (`validate_composite.go:306-308`)
4. **C4** — `setElementKey` map serialization is non-deterministic (`validate_composite.go:248-249`)

## Should-Fix (Next Iteration)

5. **H1** — Missing ISO 8601 date format (ms without timezone) (`validate_primitive.go:264-282`)
6. **H3** — `z.void()` vs `z.undefined()` distinction (`validate_primitive.go:34-43`)
7. **H4** — Coerced string uses Go-specific formatting instead of JS-compatible (`validate_primitive.go:151`)
8. **H5** — Hex/binary/octal string coercion not supported (`validate_primitive.go:158-162`)
9. **H6** — Thread safety for `validationCtx.addError` (`errors.go:70-88`)
10. **H2** — `_infinity: 0` decoded as `+Inf` (`specialvalue.go:132-148`)

The codebase is well-architected with clean separation of concerns. All existing tests pass. The identified critical bugs relate to edge cases in special value decoding, regex parsing, discriminated union matching, and set uniqueness — areas where the existing test coverage is weakest.
