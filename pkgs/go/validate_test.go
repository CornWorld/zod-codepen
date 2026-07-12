package zodval

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

// helper: assert validation passes.
func assertValid(t *testing.T, node IRNode, input any) {
	t.Helper()
	result := ValidateNode(node, input)
	if !result.IsValid() {
		t.Errorf("expected valid, got errors: %s", result.Error())
	}
}

// helper: assert validation fails.
func assertInvalid(t *testing.T, node IRNode, input any) {
	t.Helper()
	result := ValidateNode(node, input)
	if result.IsValid() {
		t.Errorf("expected invalid, but validation passed for input: %v", input)
	}
}

// helper: load a testdata fixture.
func loadFixture(t *testing.T, name string) *AstDocument {
	t.Helper()
	data, err := os.ReadFile(filepath.Join("testdata", name))
	if err != nil {
		t.Fatalf("failed to read fixture %s: %v", name, err)
	}
	doc, err := ParseDocument(data)
	if err != nil {
		t.Fatalf("failed to parse fixture %s: %v", name, err)
	}
	return doc
}

func TestValidate_String(t *testing.T) {
	node := mustParseNode(t, `{"kind":"primitive","primitive":"string","constraints":[]}`).(*PrimitiveNode)

	assertValid(t, node, "hello")
	assertValid(t, node, "")
	assertInvalid(t, node, 42)
	assertInvalid(t, node, true)
	assertInvalid(t, node, nil)
}

func TestValidate_Number(t *testing.T) {
	node := mustParseNode(t, `{"kind":"primitive","primitive":"number","constraints":[]}`).(*PrimitiveNode)

	assertValid(t, node, float64(42))
	assertValid(t, node, float64(3.14))
	assertInvalid(t, node, "hello")
	assertInvalid(t, node, true)
	assertInvalid(t, node, nil)
}

func TestValidate_Boolean(t *testing.T) {
	node := mustParseNode(t, `{"kind":"primitive","primitive":"boolean","constraints":[]}`).(*PrimitiveNode)

	assertValid(t, node, true)
	assertValid(t, node, false)
	assertInvalid(t, node, "hello")
	assertInvalid(t, node, 42)
}

func TestValidate_Null(t *testing.T) {
	node := mustParseNode(t, `{"kind":"primitive","primitive":"null","constraints":[]}`).(*PrimitiveNode)

	assertValid(t, node, nil)
	assertInvalid(t, node, "hello")
	assertInvalid(t, node, 0)
}

func TestValidate_Any(t *testing.T) {
	node := mustParseNode(t, `{"kind":"primitive","primitive":"any","constraints":[]}`).(*PrimitiveNode)

	assertValid(t, node, "anything")
	assertValid(t, node, 42)
	assertValid(t, node, true)
	assertValid(t, node, nil)
	assertValid(t, node, map[string]any{"x": 1})
	assertValid(t, node, []any{1, 2, 3})
}

func TestValidate_Unknown(t *testing.T) {
	node := mustParseNode(t, `{"kind":"primitive","primitive":"unknown","constraints":[]}`).(*PrimitiveNode)

	assertValid(t, node, "anything")
	assertValid(t, node, 42)
	assertValid(t, node, nil)
}

func TestValidate_Never(t *testing.T) {
	node := mustParseNode(t, `{"kind":"primitive","primitive":"never","constraints":[]}`).(*PrimitiveNode)

	assertInvalid(t, node, "hello")
	assertInvalid(t, node, 42)
	assertInvalid(t, node, nil)
	assertInvalid(t, node, true)
}

func TestValidate_StringMin(t *testing.T) {
	node := mustParseNode(t, `{
		"kind":"primitive","primitive":"string","constraints":[
			{"kind":"constraint","target":"string","name":"min","params":{"value":3}}
		]
	}`).(*PrimitiveNode)

	assertValid(t, node, "abc")
	assertValid(t, node, "hello")
	assertInvalid(t, node, "ab")
	assertInvalid(t, node, "")
}

func TestValidate_StringMax(t *testing.T) {
	node := mustParseNode(t, `{
		"kind":"primitive","primitive":"string","constraints":[
			{"kind":"constraint","target":"string","name":"max","params":{"value":5}}
		]
	}`).(*PrimitiveNode)

	assertValid(t, node, "hello")
	assertValid(t, node, "ab")
	assertInvalid(t, node, "too long")
}

func TestValidate_StringEmail(t *testing.T) {
	node := mustParseNode(t, `{
		"kind":"primitive","primitive":"string","constraints":[
			{"kind":"constraint","target":"string","name":"email","params":{}}
		]
	}`).(*PrimitiveNode)

	assertValid(t, node, "user@example.com")
	assertInvalid(t, node, "not-an-email")
	assertInvalid(t, node, "missing@domain")
}

func TestValidate_StringURL(t *testing.T) {
	node := mustParseNode(t, `{
		"kind":"primitive","primitive":"string","constraints":[
			{"kind":"constraint","target":"string","name":"url","params":{}}
		]
	}`).(*PrimitiveNode)

	assertValid(t, node, "https://example.com")
	assertValid(t, node, "http://foo.bar/baz")
	assertInvalid(t, node, "not-a-url")
	assertInvalid(t, node, "://missing-scheme")
}

func TestValidate_StringUUID(t *testing.T) {
	node := mustParseNode(t, `{
		"kind":"primitive","primitive":"string","constraints":[
			{"kind":"constraint","target":"string","name":"uuid","params":{}}
		]
	}`).(*PrimitiveNode)

	assertValid(t, node, "550e8400-e29b-41d4-a716-446655440000")
	assertInvalid(t, node, "not-a-uuid")
}

func TestValidate_StringRegex(t *testing.T) {
	node := mustParseNode(t, `{
		"kind":"primitive","primitive":"string","constraints":[
			{"kind":"constraint","target":"string","name":"regex","params":{"regex":{"_regex":"/^[a-z0-9-]+$/"}}}
		]
	}`).(*PrimitiveNode)

	assertValid(t, node, "hello-world")
	assertValid(t, node, "test123")
	assertInvalid(t, node, "UPPER")
	assertInvalid(t, node, "spaces here")
}

func TestValidate_NumberMin(t *testing.T) {
	node := mustParseNode(t, `{
		"kind":"primitive","primitive":"number","constraints":[
			{"kind":"constraint","target":"number","name":"min","params":{"value":0}}
		]
	}`).(*PrimitiveNode)

	assertValid(t, node, float64(0))
	assertValid(t, node, float64(100))
	assertInvalid(t, node, float64(-1))
}

func TestValidate_NumberMax(t *testing.T) {
	node := mustParseNode(t, `{
		"kind":"primitive","primitive":"number","constraints":[
			{"kind":"constraint","target":"number","name":"max","params":{"value":100}}
		]
	}`).(*PrimitiveNode)

	assertValid(t, node, float64(100))
	assertValid(t, node, float64(50))
	assertInvalid(t, node, float64(101))
}

func TestValidate_NumberInt(t *testing.T) {
	node := mustParseNode(t, `{
		"kind":"primitive","primitive":"number","constraints":[
			{"kind":"constraint","target":"number","name":"int","params":{}}
		]
	}`).(*PrimitiveNode)

	assertValid(t, node, float64(42))
	assertValid(t, node, float64(0))
	assertInvalid(t, node, float64(3.14))
}

func TestValidate_NumberPositive(t *testing.T) {
	node := mustParseNode(t, `{
		"kind":"primitive","primitive":"number","constraints":[
			{"kind":"constraint","target":"number","name":"positive","params":{}}
		]
	}`).(*PrimitiveNode)

	assertValid(t, node, float64(1))
	assertInvalid(t, node, float64(0))
	assertInvalid(t, node, float64(-1))
}

func TestValidate_NumberNonnegative(t *testing.T) {
	node := mustParseNode(t, `{
		"kind":"primitive","primitive":"number","constraints":[
			{"kind":"constraint","target":"number","name":"nonnegative","params":{}}
		]
	}`).(*PrimitiveNode)

	assertValid(t, node, float64(0))
	assertValid(t, node, float64(1))
	assertInvalid(t, node, float64(-1))
}

func TestValidate_NumberMultipleOf(t *testing.T) {
	node := mustParseNode(t, `{
		"kind":"primitive","primitive":"number","constraints":[
			{"kind":"constraint","target":"number","name":"multipleOf","params":{"value":5}}
		]
	}`).(*PrimitiveNode)

	assertValid(t, node, float64(10))
	assertValid(t, node, float64(0))
	assertInvalid(t, node, float64(7))
}

func TestValidate_Object(t *testing.T) {
	node := mustParseNode(t, `{
		"kind":"object",
		"fields":[
			{"key":"name","value":{"kind":"primitive","primitive":"string","constraints":[]}},
			{"key":"age","value":{"kind":"primitive","primitive":"number","constraints":[]}}
		],
		"unknownMode":"strip"
	}`).(*ObjectNode)

	assertValid(t, node, map[string]any{"name": "Alice", "age": float64(30)})
	assertInvalid(t, node, map[string]any{"name": "Alice"})                  // missing age
	assertInvalid(t, node, map[string]any{"name": "Alice", "age": "thirty"}) // wrong type
	assertInvalid(t, node, "not an object")
	assertInvalid(t, node, nil)
}

func TestValidate_ObjectStrict(t *testing.T) {
	node := mustParseNode(t, `{
		"kind":"object",
		"fields":[
			{"key":"id","value":{"kind":"primitive","primitive":"string","constraints":[]}}
		],
		"unknownMode":"strict"
	}`).(*ObjectNode)

	assertValid(t, node, map[string]any{"id": "abc"})
	assertInvalid(t, node, map[string]any{"id": "abc", "extra": "field"})
}

func TestValidate_ObjectPassthrough(t *testing.T) {
	node := mustParseNode(t, `{
		"kind":"object",
		"fields":[
			{"key":"id","value":{"kind":"primitive","primitive":"string","constraints":[]}}
		],
		"unknownMode":"passthrough"
	}`).(*ObjectNode)

	assertValid(t, node, map[string]any{"id": "abc", "extra": "field"})
}

func TestValidate_ObjectWithOptional(t *testing.T) {
	node := mustParseNode(t, `{
		"kind":"object",
		"fields":[
			{"key":"id","value":{"kind":"primitive","primitive":"string","constraints":[]}},
			{"key":"bio","value":{
				"kind":"modified",
				"inner":{"kind":"primitive","primitive":"string","constraints":[]},
				"modifiers":[{"kind":"modifier","name":"optional"}]
			}}
		],
		"unknownMode":"strip"
	}`).(*ObjectNode)

	assertValid(t, node, map[string]any{"id": "abc"})
	assertValid(t, node, map[string]any{"id": "abc", "bio": "hello"})
	assertInvalid(t, node, map[string]any{"bio": "hello"}) // missing required id
}

func TestValidate_Array(t *testing.T) {
	node := mustParseNode(t, `{
		"kind":"array",
		"element":{"kind":"primitive","primitive":"string","constraints":[]},
		"constraints":[]
	}`).(*ArrayNode)

	assertValid(t, node, []any{"a", "b", "c"})
	assertValid(t, node, []any{})
	assertInvalid(t, node, []any{"a", 123})
	assertInvalid(t, node, "not an array")
}

func TestValidate_ArrayMinConstraint(t *testing.T) {
	node := mustParseNode(t, `{
		"kind":"array",
		"element":{"kind":"primitive","primitive":"string","constraints":[]},
		"constraints":[
			{"kind":"constraint","target":"array","name":"min","params":{"value":2}}
		]
	}`).(*ArrayNode)

	assertValid(t, node, []any{"a", "b"})
	assertValid(t, node, []any{"a", "b", "c"})
	assertInvalid(t, node, []any{"a"})
	assertInvalid(t, node, []any{})
}

func TestValidate_ArrayNonempty(t *testing.T) {
	node := mustParseNode(t, `{
		"kind":"array",
		"element":{"kind":"primitive","primitive":"string","constraints":[]},
		"constraints":[
			{"kind":"constraint","target":"array","name":"nonempty","params":{}}
		]
	}`).(*ArrayNode)

	assertValid(t, node, []any{"a"})
	assertInvalid(t, node, []any{})
}

func TestValidate_Literal(t *testing.T) {
	node := mustParseNode(t, `{"kind":"literal","value":"light"}`).(*LiteralNode)

	assertValid(t, node, "light")
	assertInvalid(t, node, "dark")
	assertInvalid(t, node, 42)
}

func TestValidate_LiteralNumber(t *testing.T) {
	node := mustParseNode(t, `{"kind":"literal","value":42}`).(*LiteralNode)

	assertValid(t, node, float64(42))
	assertInvalid(t, node, float64(43))
}

func TestValidate_LiteralBoolean(t *testing.T) {
	node := mustParseNode(t, `{"kind":"literal","value":true}`).(*LiteralNode)

	assertValid(t, node, true)
	assertInvalid(t, node, false)
}

func TestValidate_LiteralNull(t *testing.T) {
	node := mustParseNode(t, `{"kind":"literal","value":null}`).(*LiteralNode)

	assertValid(t, node, nil)
	assertInvalid(t, node, "null")
}

func TestValidate_Enum(t *testing.T) {
	node := mustParseNode(t, `{"kind":"enum","variant":"enum","values":["draft","published","archived"]}`).(*EnumNode)

	assertValid(t, node, "draft")
	assertValid(t, node, "published")
	assertValid(t, node, "archived")
	assertInvalid(t, node, "deleted")
	assertInvalid(t, node, 42)
}

func TestValidate_Union(t *testing.T) {
	node := mustParseNode(t, `{
		"kind":"union",
		"options":[
			{"kind":"primitive","primitive":"string","constraints":[]},
			{"kind":"primitive","primitive":"number","constraints":[]}
		]
	}`).(*UnionNode)

	assertValid(t, node, "hello")
	assertValid(t, node, float64(42))
	assertInvalid(t, node, true)
	assertInvalid(t, node, nil)
}

func TestValidate_DiscriminatedUnion(t *testing.T) {
	node := mustParseNode(t, `{
		"kind":"union",
		"options":[
			{
				"kind":"object",
				"fields":[
					{"key":"type","value":{"kind":"literal","value":"text"}},
					{"key":"body","value":{"kind":"primitive","primitive":"string","constraints":[]}}
				],
				"unknownMode":"strip"
			},
			{
				"kind":"object",
				"fields":[
					{"key":"type","value":{"kind":"literal","value":"heading"}},
					{"key":"level","value":{"kind":"primitive","primitive":"number","constraints":[]}}
				],
				"unknownMode":"strip"
			}
		],
		"discriminator":"type"
	}`).(*UnionNode)

	assertValid(t, node, map[string]any{"type": "text", "body": "hello"})
	assertValid(t, node, map[string]any{"type": "heading", "level": float64(1)})
	assertInvalid(t, node, map[string]any{"type": "image"})
	assertInvalid(t, node, map[string]any{"body": "no type"})
	assertInvalid(t, node, map[string]any{"type": "text", "level": float64(1)})
}

func TestValidate_Optional(t *testing.T) {
	node := mustParseNode(t, `{
		"kind":"modified",
		"inner":{"kind":"primitive","primitive":"string","constraints":[]},
		"modifiers":[{"kind":"modifier","name":"optional"}]
	}`).(*ModifiedNode)

	assertValid(t, node, "hello")
	assertValid(t, node, nil)
	assertInvalid(t, node, 42)
}

func TestValidate_Nullable(t *testing.T) {
	node := mustParseNode(t, `{
		"kind":"modified",
		"inner":{"kind":"primitive","primitive":"string","constraints":[]},
		"modifiers":[{"kind":"modifier","name":"nullable"}]
	}`).(*ModifiedNode)

	assertValid(t, node, "hello")
	assertValid(t, node, nil)
	assertInvalid(t, node, 42)
}

func TestValidate_Nullish(t *testing.T) {
	node := mustParseNode(t, `{
		"kind":"modified",
		"inner":{"kind":"primitive","primitive":"string","constraints":[]},
		"modifiers":[{"kind":"modifier","name":"nullish"}]
	}`).(*ModifiedNode)

	assertValid(t, node, "hello")
	assertValid(t, node, nil)
	assertInvalid(t, node, 42)
}

func TestValidate_Default(t *testing.T) {
	node := mustParseNode(t, `{
		"kind":"modified",
		"inner":{"kind":"primitive","primitive":"string","constraints":[]},
		"modifiers":[{"kind":"modifier","name":"default","value":"fallback"}]
	}`).(*ModifiedNode)

	assertValid(t, node, "hello")
	assertValid(t, node, nil) // nil uses default "fallback"
	assertInvalid(t, node, 42)
}

func TestValidate_OptionalDefault(t *testing.T) {
	node := mustParseNode(t, `{
		"kind":"modified",
		"inner":{"kind":"primitive","primitive":"string","constraints":[]},
		"modifiers":[
			{"kind":"modifier","name":"optional"},
			{"kind":"modifier","name":"default","value":"fallback"}
		]
	}`).(*ModifiedNode)

	assertValid(t, node, "hello")
	assertValid(t, node, nil)
}

func TestValidate_Readonly(t *testing.T) {
	node := mustParseNode(t, `{
		"kind":"modified",
		"inner":{"kind":"primitive","primitive":"string","constraints":[]},
		"modifiers":[{"kind":"modifier","name":"readonly"}]
	}`).(*ModifiedNode)

	assertValid(t, node, "hello")
	assertInvalid(t, node, 42)
}

// --- Full document tests ---

func TestValidateSchema_FromFixture(t *testing.T) {
	doc := loadFixture(t, "primitives.json")

	tests := []struct {
		schema string
		input  any
		valid  bool
	}{
		{"StringSchema", "hello", true},
		{"StringSchema", 42, false},
		{"StringWithConstraints", "user@example.com", true},
		{"StringWithConstraints", "ab", false}, // too short
		{"StringWithConstraints", "not-email", false},
		{"NumberWithConstraints", float64(50), true},
		{"NumberWithConstraints", float64(-1), false},   // min 0
		{"NumberWithConstraints", float64(3.14), false}, // not int
		{"BooleanSchema", true, true},
		{"BooleanSchema", "true", false},
		{"AnySchema", map[string]any{"x": 1}, true},
		{"NeverSchema", "anything", false},
	}

	for _, tc := range tests {
		result := ValidateSchema(doc, tc.schema, tc.input)
		if tc.valid && !result.IsValid() {
			t.Errorf("ValidateSchema(%q, %v): expected valid, got: %s", tc.schema, tc.input, result.Error())
		}
		if !tc.valid && result.IsValid() {
			t.Errorf("ValidateSchema(%q, %v): expected invalid", tc.schema, tc.input)
		}
	}
}

func TestValidateSchema_Objects(t *testing.T) {
	doc := loadFixture(t, "objects.json")

	result := ValidateSchema(doc, "SimpleObject", map[string]any{
		"name": "Alice",
		"age":  float64(30),
	})
	if !result.IsValid() {
		t.Errorf("expected valid, got: %s", result.Error())
	}

	result = ValidateSchema(doc, "SimpleObject", map[string]any{
		"name": "Alice",
	})
	if result.IsValid() {
		t.Error("expected missing age to fail")
	}

	result = ValidateSchema(doc, "StrictObject", map[string]any{
		"id":    "abc",
		"extra": "field",
	})
	if result.IsValid() {
		t.Error("expected strict mode to reject extra key")
	}

	result = ValidateSchema(doc, "PassthroughObject", map[string]any{
		"id":    "abc",
		"extra": "field",
	})
	if !result.IsValid() {
		t.Errorf("expected passthrough mode to accept extra key, got: %s", result.Error())
	}

	result = ValidateSchema(doc, "ObjectWithOptional", map[string]any{
		"id": "abc",
	})
	if !result.IsValid() {
		t.Errorf("expected optional field to be accepted when missing, got: %s", result.Error())
	}
}

func TestValidateSchema_Unions(t *testing.T) {
	doc := loadFixture(t, "unions.json")

	// StringOrNumber union
	result := ValidateSchema(doc, "StringOrNumber", "hello")
	if !result.IsValid() {
		t.Errorf("expected string to be valid in StringOrNumber, got: %s", result.Error())
	}
	result = ValidateSchema(doc, "StringOrNumber", float64(42))
	if !result.IsValid() {
		t.Errorf("expected number to be valid in StringOrNumber, got: %s", result.Error())
	}
	result = ValidateSchema(doc, "StringOrNumber", true)
	if result.IsValid() {
		t.Error("expected bool to be invalid in StringOrNumber")
	}

	// DiscriminatedBlock
	result = ValidateSchema(doc, "DiscriminatedBlock", map[string]any{
		"type": "text",
		"body": "hello",
	})
	if !result.IsValid() {
		t.Errorf("expected text block to be valid, got: %s", result.Error())
	}

	result = ValidateSchema(doc, "DiscriminatedBlock", map[string]any{
		"type": "image",
		"url":  "https://example.com/img.png",
	})
	if result.IsValid() {
		t.Error("expected image type to be invalid (not in options)")
	}

	// Enum
	result = ValidateSchema(doc, "Enum", "draft")
	if !result.IsValid() {
		t.Error("expected 'draft' to be valid enum value")
	}
	result = ValidateSchema(doc, "Enum", "deleted")
	if result.IsValid() {
		t.Error("expected 'deleted' to be invalid enum value")
	}

	// Literal
	result = ValidateSchema(doc, "LiteralValue", "light")
	if !result.IsValid() {
		t.Error("expected 'light' to be valid")
	}
	result = ValidateSchema(doc, "LiteralValue", "dark")
	if result.IsValid() {
		t.Error("expected 'dark' to be invalid")
	}
}

func TestValidateSchema_Modified(t *testing.T) {
	doc := loadFixture(t, "modified.json")

	// OptionalString
	result := ValidateSchema(doc, "OptionalString", "hello")
	if !result.IsValid() {
		t.Error("expected string to be valid for OptionalString")
	}
	result = ValidateSchema(doc, "OptionalString", nil)
	if !result.IsValid() {
		t.Error("expected nil to be valid for OptionalString")
	}

	// DefaultString
	result = ValidateSchema(doc, "DefaultString", nil)
	if !result.IsValid() {
		t.Errorf("expected nil to be valid for DefaultString, got: %s", result.Error())
	}
}

func TestValidate_CoerceString(t *testing.T) {
	node := mustParseNode(t, `{
		"kind":"primitive","primitive":"string","coerce":true,"constraints":[]
	}`).(*PrimitiveNode)

	assertValid(t, node, "hello")
	assertValid(t, node, 42)   // coerced to "42"
	assertValid(t, node, true) // coerced to "true"
}

func TestValidate_CoerceNumber(t *testing.T) {
	node := mustParseNode(t, `{
		"kind":"primitive","primitive":"number","coerce":true,"constraints":[]
	}`).(*PrimitiveNode)

	assertValid(t, node, float64(42))
	assertValid(t, node, "42") // coerced to 42
}

func TestValidate_Tuple(t *testing.T) {
	node := mustParseNode(t, `{
		"kind":"tuple",
		"items":[
			{"kind":"primitive","primitive":"string","constraints":[]},
			{"kind":"primitive","primitive":"number","constraints":[]}
		]
	}`).(*TupleNode)

	assertValid(t, node, []any{"hello", float64(42)})
	assertInvalid(t, node, []any{"hello"})
	assertInvalid(t, node, []any{float64(42), "hello"})
}

func TestValidate_Record(t *testing.T) {
	node := mustParseNode(t, `{
		"kind":"record",
		"key":{"kind":"primitive","primitive":"string","constraints":[]},
		"value":{"kind":"primitive","primitive":"number","constraints":[]}
	}`).(*RecordNode)

	assertValid(t, node, map[string]any{"a": float64(1), "b": float64(2)})
	assertInvalid(t, node, map[string]any{"a": "not a number"})
}

func TestValidate_Set(t *testing.T) {
	node := mustParseNode(t, `{
		"kind":"set",
		"element":{"kind":"primitive","primitive":"string","constraints":[]},
		"constraints":[{"kind":"constraint","target":"set","name":"nonempty","params":{}}]
	}`).(*SetNode)

	assertValid(t, node, []any{"a", "b", "c"})
	assertInvalid(t, node, []any{})
	assertInvalid(t, node, []any{"a", 42})
}

func TestValidate_SetUnique(t *testing.T) {
	node := mustParseNode(t, `{
		"kind":"set",
		"element":{"kind":"primitive","primitive":"string","constraints":[]},
		"constraints":[]
	}`).(*SetNode)

	assertInvalid(t, node, []any{"a", "a", "b"})
}

func TestValidate_Intersection(t *testing.T) {
	node := mustParseNode(t, `{
		"kind":"intersection",
		"left":{"kind":"object","fields":[
			{"key":"a","value":{"kind":"primitive","primitive":"string","constraints":[]}}
		],"unknownMode":"passthrough"},
		"right":{"kind":"object","fields":[
			{"key":"b","value":{"kind":"primitive","primitive":"number","constraints":[]}}
		],"unknownMode":"passthrough"}
	}`).(*IntersectionNode)

	assertValid(t, node, map[string]any{"a": "hello", "b": float64(42)})
	assertInvalid(t, node, map[string]any{"a": "hello"})     // missing b
	assertInvalid(t, node, map[string]any{"b": float64(42)}) // missing a
}

func TestValidateSchema_NotFound(t *testing.T) {
	doc := loadFixture(t, "primitives.json")
	result := ValidateSchema(doc, "Nonexistent", "test")
	if result.IsValid() {
		t.Error("expected error for nonexistent schema")
	}
}

func TestValidateJSONInput(t *testing.T) {
	// Test that we can validate JSON-parsed input directly.
	doc := loadFixture(t, "objects.json")

	var input map[string]any
	json.Unmarshal([]byte(`{"name":"Alice","age":30}`), &input)

	result := ValidateSchema(doc, "SimpleObject", input)
	if !result.IsValid() {
		t.Errorf("expected valid, got: %s", result.Error())
	}
}

func TestValidationError_Format(t *testing.T) {
	ve := &ValidationError{
		Path:    []string{"user", "name"},
		Message: "expected string",
		Code:    "invalid_type",
	}
	s := ve.Error()
	if s == "" {
		t.Error("expected non-empty error string")
	}
}

func TestValidationResult_First(t *testing.T) {
	vr := &ValidationResult{Errors: []*ValidationError{}}
	if vr.First() != nil {
		t.Error("expected nil for empty result")
	}
}
