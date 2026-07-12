package zodval

import (
	"encoding/json"
	"math"
	"math/big"
	"regexp"
	"testing"
)

// helper: parse a JSON string into an IRNode, fatal on error.
func mustParseNode(t *testing.T, jsonStr string) IRNode {
	t.Helper()
	node, err := ParseNode([]byte(jsonStr))
	if err != nil {
		t.Fatalf("ParseNode failed: %v\ninput: %s", err, jsonStr)
	}
	return node
}

func TestParsePrimitive_String(t *testing.T) {
	node := mustParseNode(t, `{"kind":"primitive","primitive":"string","constraints":[]}`).(*PrimitiveNode)
	if node.Primitive != PrimString {
		t.Errorf("expected primitive=string, got %s", node.Primitive)
	}
	if node.Coerce != nil {
		t.Error("expected coerce=nil")
	}
	if len(node.Constraints) != 0 {
		t.Errorf("expected 0 constraints, got %d", len(node.Constraints))
	}
}

func TestParsePrimitive_NumberWithCoerce(t *testing.T) {
	node := mustParseNode(t, `{"kind":"primitive","primitive":"number","coerce":true,"constraints":[]}`).(*PrimitiveNode)
	if node.Primitive != PrimNumber {
		t.Errorf("expected primitive=number, got %s", node.Primitive)
	}
	if node.Coerce == nil || !*node.Coerce {
		t.Error("expected coerce=true")
	}
}

func TestParsePrimitive_WithConstraints(t *testing.T) {
	node := mustParseNode(t, `{
		"kind":"primitive","primitive":"number","constraints":[
			{"kind":"constraint","target":"number","name":"min","params":{"value":5}},
			{"kind":"constraint","target":"number","name":"max","params":{"value":100}}
		]
	}`).(*PrimitiveNode)

	if len(node.Constraints) != 2 {
		t.Fatalf("expected 2 constraints, got %d", len(node.Constraints))
	}
	if node.Constraints[0].Name != "min" {
		t.Errorf("expected constraint[0].name=min, got %s", node.Constraints[0].Name)
	}
	if node.Constraints[0].Target != CTNumber {
		t.Errorf("expected constraint[0].target=number, got %s", node.Constraints[0].Target)
	}
}

func TestParseLiteral(t *testing.T) {
	cases := []struct {
		json string
		want any
	}{
		{`{"kind":"literal","value":"hello"}`, "hello"},
		{`{"kind":"literal","value":42}`, float64(42)},
		{`{"kind":"literal","value":true}`, true},
		{`{"kind":"literal","value":null}`, nil},
	}
	for _, tc := range cases {
		node := mustParseNode(t, tc.json).(*LiteralNode)
		got := node.Value.Any()
		if got != tc.want {
			t.Errorf("literal %s: expected %v (%T), got %v (%T)", tc.json, tc.want, tc.want, got, got)
		}
	}
}

func TestParseLiteral_BigInt(t *testing.T) {
	node := mustParseNode(t, `{"kind":"literal","value":{"_bigint":"123"}}`).(*LiteralNode)
	got := node.Value.Any()
	bi, ok := got.(*big.Int)
	if !ok {
		t.Fatalf("expected *big.Int, got %T", got)
	}
	if bi.String() != "123" {
		t.Errorf("expected bigint 123, got %s", bi.String())
	}
}

func TestParseLiteral_Regex(t *testing.T) {
	node := mustParseNode(t, `{"kind":"literal","value":{"_regex":"/^[a-z]+$/i"}}`).(*LiteralNode)
	got := node.Value.Any()
	re, ok := got.(*regexp.Regexp)
	if !ok {
		t.Fatalf("expected *regexp.Regexp, got %T", got)
	}
	if !re.MatchString("abc") {
		t.Error("regex should match 'abc'")
	}
	if !re.MatchString("ABC") {
		t.Error("regex with 'i' flag should match 'ABC'")
	}
}

func TestParseEnum(t *testing.T) {
	node := mustParseNode(t, `{"kind":"enum","variant":"enum","values":["a","b","c"]}`).(*EnumNode)
	if node.Variant != "enum" {
		t.Errorf("expected variant=enum, got %s", node.Variant)
	}
	if len(node.Values) != 3 {
		t.Fatalf("expected 3 values, got %d", len(node.Values))
	}
}

func TestParseEnum_WithDiscriminator(t *testing.T) {
	node := mustParseNode(t, `{
		"kind":"enum","variant":"enum","values":["text","heading"],
		"discriminator":"type",
		"options":[
			{"kind":"object","fields":[{"key":"type","value":{"kind":"literal","value":"text"}}],"unknownMode":"strip"},
			{"kind":"object","fields":[{"key":"type","value":{"kind":"literal","value":"heading"}}],"unknownMode":"strip"}
		]
	}`).(*EnumNode)

	if node.Discriminator == nil || *node.Discriminator != "type" {
		t.Fatal("expected discriminator='type'")
	}
	if len(node.Options) != 2 {
		t.Fatalf("expected 2 options, got %d", len(node.Options))
	}
}

func TestParseObject(t *testing.T) {
	node := mustParseNode(t, `{
		"kind":"object",
		"fields":[
			{"key":"name","value":{"kind":"primitive","primitive":"string","constraints":[]}},
			{"key":"age","value":{"kind":"primitive","primitive":"number","constraints":[]}}
		],
		"unknownMode":"strip"
	}`).(*ObjectNode)

	if len(node.Fields) != 2 {
		t.Fatalf("expected 2 fields, got %d", len(node.Fields))
	}
	if node.Fields[0].Key != "name" {
		t.Errorf("expected fields[0].key=name, got %s", node.Fields[0].Key)
	}
	if node.UnknownMode != ObjStrip {
		t.Errorf("expected unknownMode=strip, got %s", node.UnknownMode)
	}
}

func TestParseObject_WithCatchall(t *testing.T) {
	node := mustParseNode(t, `{
		"kind":"object",
		"fields":[],
		"unknownMode":"passthrough",
		"catchall":{"kind":"primitive","primitive":"string","constraints":[]}
	}`).(*ObjectNode)

	if node.UnknownMode != ObjPassthrough {
		t.Errorf("expected passthrough, got %s", node.UnknownMode)
	}
	if node.Catchall == nil {
		t.Fatal("expected catchall node")
	}
}

func TestParseArray(t *testing.T) {
	node := mustParseNode(t, `{
		"kind":"array",
		"element":{"kind":"primitive","primitive":"string","constraints":[]},
		"constraints":[
			{"kind":"constraint","target":"array","name":"min","params":{"value":1}},
			{"kind":"constraint","target":"array","name":"max","params":{"value":10}}
		]
	}`).(*ArrayNode)

	if node.Element == nil {
		t.Fatal("expected element node")
	}
	if len(node.Constraints) != 2 {
		t.Fatalf("expected 2 constraints, got %d", len(node.Constraints))
	}
}

func TestParseModified(t *testing.T) {
	node := mustParseNode(t, `{
		"kind":"modified",
		"inner":{"kind":"primitive","primitive":"string","constraints":[]},
		"modifiers":[
			{"kind":"modifier","name":"optional"},
			{"kind":"modifier","name":"default","value":"hello"}
		]
	}`).(*ModifiedNode)

	if node.Inner == nil {
		t.Fatal("expected inner node")
	}
	if len(node.Modifiers) != 2 {
		t.Fatalf("expected 2 modifiers, got %d", len(node.Modifiers))
	}
	if node.Modifiers[0].Name != ModOptional {
		t.Errorf("expected modifier[0].name=optional, got %s", node.Modifiers[0].Name)
	}
	if node.Modifiers[1].Name != ModDefault {
		t.Errorf("expected modifier[1].name=default, got %s", node.Modifiers[1].Name)
	}
}

func TestParseUnion(t *testing.T) {
	node := mustParseNode(t, `{
		"kind":"union",
		"options":[
			{"kind":"primitive","primitive":"string","constraints":[]},
			{"kind":"primitive","primitive":"number","constraints":[]}
		]
	}`).(*UnionNode)

	if len(node.Options) != 2 {
		t.Fatalf("expected 2 options, got %d", len(node.Options))
	}
}

func TestParseUnion_Discriminated(t *testing.T) {
	node := mustParseNode(t, `{
		"kind":"union",
		"options":[
			{"kind":"object","fields":[{"key":"type","value":{"kind":"literal","value":"a"}}],"unknownMode":"strip"},
			{"kind":"object","fields":[{"key":"type","value":{"kind":"literal","value":"b"}}],"unknownMode":"strip"}
		],
		"discriminator":"type"
	}`).(*UnionNode)

	if node.Discriminator == nil || *node.Discriminator != "type" {
		t.Fatal("expected discriminator='type'")
	}
}

func TestParseTuple(t *testing.T) {
	node := mustParseNode(t, `{
		"kind":"tuple",
		"items":[
			{"kind":"primitive","primitive":"string","constraints":[]},
			{"kind":"primitive","primitive":"number","constraints":[]}
		],
		"rest":{"kind":"primitive","primitive":"string","constraints":[]}
	}`).(*TupleNode)

	if len(node.Items) != 2 {
		t.Fatalf("expected 2 items, got %d", len(node.Items))
	}
	if node.Rest == nil {
		t.Fatal("expected rest node")
	}
}

func TestParseRecord(t *testing.T) {
	node := mustParseNode(t, `{
		"kind":"record",
		"key":{"kind":"primitive","primitive":"string","constraints":[]},
		"value":{"kind":"primitive","primitive":"number","constraints":[]}
	}`).(*RecordNode)

	if node.Key == nil || node.Value == nil {
		t.Fatal("expected key and value nodes")
	}
}

func TestParseMap(t *testing.T) {
	node := mustParseNode(t, `{
		"kind":"map",
		"key":{"kind":"primitive","primitive":"string","constraints":[]},
		"value":{"kind":"primitive","primitive":"number","constraints":[]}
	}`).(*MapNode)

	if node.Key == nil || node.Value == nil {
		t.Fatal("expected key and value nodes")
	}
}

func TestParseSet(t *testing.T) {
	node := mustParseNode(t, `{
		"kind":"set",
		"element":{"kind":"primitive","primitive":"string","constraints":[]},
		"constraints":[
			{"kind":"constraint","target":"set","name":"min","params":{"value":1}}
		]
	}`).(*SetNode)

	if node.Element == nil {
		t.Fatal("expected element node")
	}
	if len(node.Constraints) != 1 {
		t.Fatalf("expected 1 constraint, got %d", len(node.Constraints))
	}
}

func TestParseIntersection(t *testing.T) {
	node := mustParseNode(t, `{
		"kind":"intersection",
		"left":{"kind":"primitive","primitive":"string","constraints":[]},
		"right":{"kind":"object","fields":[],"unknownMode":"strip"}
	}`).(*IntersectionNode)

	if node.Left == nil || node.Right == nil {
		t.Fatal("expected left and right nodes")
	}
}

func TestParseLazy(t *testing.T) {
	node := mustParseNode(t, `{"kind":"lazy","placeholder":true}`).(*LazyNode)
	if !node.Placeholder {
		t.Error("expected placeholder=true")
	}
}

func TestParseLazy_WithInner(t *testing.T) {
	node := mustParseNode(t, `{
		"kind":"lazy","placeholder":false,
		"inner":{"kind":"primitive","primitive":"string","constraints":[]}
	}`).(*LazyNode)

	if node.Placeholder {
		t.Error("expected placeholder=false")
	}
	if node.Inner == nil {
		t.Fatal("expected inner node")
	}
}

func TestParseFallback(t *testing.T) {
	node := mustParseNode(t, `{"kind":"fallback","reason":"not-a-zod-schema"}`).(*FallbackNode)
	if node.Reason != FBNotZodSchema {
		t.Errorf("expected reason=not-a-zod-schema, got %s", node.Reason)
	}
}

func TestParseFallback_WithDetail(t *testing.T) {
	node := mustParseNode(t, `{"kind":"fallback","reason":"unhandled","detail":"z.custom"}`).(*FallbackNode)
	if node.Detail == nil || *node.Detail != "z.custom" {
		t.Error("expected detail='z.custom'")
	}
}

func TestParseRaw(t *testing.T) {
	node := mustParseNode(t, `{"kind":"raw","code":"z.custom(someCheck)","reason":"custom-type"}`).(*RawNode)
	if node.Code != "z.custom(someCheck)" {
		t.Errorf("expected code, got %s", node.Code)
	}
}

func TestParsePromise(t *testing.T) {
	node := mustParseNode(t, `{
		"kind":"promise",
		"inner":{"kind":"primitive","primitive":"string","constraints":[]}
	}`).(*PromiseNode)
	if node.Inner == nil {
		t.Fatal("expected inner node")
	}
}

func TestParseTransform(t *testing.T) {
	node := mustParseNode(t, `{
		"kind":"transform",
		"inner":{"kind":"primitive","primitive":"string","constraints":[]},
		"fn":{"kind":"function","usage":"transform","mode":"placeholder"}
	}`).(*TransformNode)

	if node.Inner == nil {
		t.Fatal("expected inner node")
	}
	if node.Fn.Usage != FUTransform {
		t.Errorf("expected fn.usage=transform, got %s", node.Fn.Usage)
	}
}

func TestParsePipe(t *testing.T) {
	node := mustParseNode(t, `{
		"kind":"pipe",
		"in":{"kind":"primitive","primitive":"string","constraints":[]},
		"out":{"kind":"primitive","primitive":"number","constraints":[]}
	}`).(*PipeNode)

	if node.In == nil || node.Out == nil {
		t.Fatal("expected in and out nodes")
	}
}

func TestParseZodFunction(t *testing.T) {
	node := mustParseNode(t, `{
		"kind":"zod-function",
		"args":[{"kind":"primitive","primitive":"string","constraints":[]}],
		"returns":{"kind":"primitive","primitive":"number","constraints":[]}
	}`).(*ZodFunctionNode)

	if len(node.Args) != 1 {
		t.Fatalf("expected 1 arg, got %d", len(node.Args))
	}
	if node.Returns == nil {
		t.Fatal("expected returns node")
	}
}

// --- Document-level tests ---

func TestParseDocument(t *testing.T) {
	doc, err := ParseDocument([]byte(`{
		"version": 1,
		"schemas": {
			"Name": {"kind":"primitive","primitive":"string","constraints":[]},
			"Age": {"kind":"primitive","primitive":"number","constraints":[]}
		}
	}`))
	if err != nil {
		t.Fatalf("ParseDocument failed: %v", err)
	}
	if doc.Version != 1 {
		t.Errorf("expected version=1, got %d", doc.Version)
	}
	if len(doc.Schemas) != 2 {
		t.Fatalf("expected 2 schemas, got %d", len(doc.Schemas))
	}
}

func TestParseDocument_UnknownVersion(t *testing.T) {
	_, err := ParseDocument([]byte(`{"version":99,"schemas":{}}`))
	if err == nil {
		t.Fatal("expected error for unknown version")
	}
}

func TestParseSchema(t *testing.T) {
	doc, err := ParseDocument([]byte(`{
		"version": 1,
		"schemas": {
			"User": {"kind":"object","fields":[{"key":"name","value":{"kind":"primitive","primitive":"string","constraints":[]}}],"unknownMode":"strip"}
		}
	}`))
	if err != nil {
		t.Fatalf("ParseDocument failed: %v", err)
	}

	node, err := doc.ParseSchema("User")
	if err != nil {
		t.Fatalf("ParseSchema failed: %v", err)
	}
	obj, ok := node.(*ObjectNode)
	if !ok {
		t.Fatalf("expected *ObjectNode, got %T", node)
	}
	if len(obj.Fields) != 1 {
		t.Fatalf("expected 1 field, got %d", len(obj.Fields))
	}
}

func TestParseSchema_NotFound(t *testing.T) {
	doc, _ := ParseDocument([]byte(`{"version":1,"schemas":{}}`))
	_, err := doc.ParseSchema("Nonexistent")
	if err == nil {
		t.Fatal("expected error for nonexistent schema")
	}
}

func TestParseAllSchemas(t *testing.T) {
	doc, err := ParseDocument([]byte(`{
		"version": 1,
		"schemas": {
			"A": {"kind":"primitive","primitive":"string","constraints":[]},
			"B": {"kind":"primitive","primitive":"number","constraints":[]}
		}
	}`))
	if err != nil {
		t.Fatal(err)
	}
	all, err := doc.ParseAllSchemas()
	if err != nil {
		t.Fatal(err)
	}
	if len(all) != 2 {
		t.Fatalf("expected 2 schemas, got %d", len(all))
	}
}

// --- Special value encoding tests ---

func TestDecodeValue_BigInt(t *testing.T) {
	sv := &SpecialValue{}
	json.Unmarshal([]byte(`{"_bigint":"99999999999999999999"}`), sv)
	got := sv.Any()
	bi, ok := got.(*big.Int)
	if !ok {
		t.Fatalf("expected *big.Int, got %T", got)
	}
	if bi.String() != "99999999999999999999" {
		t.Errorf("got %s", bi.String())
	}
}

func TestDecodeValue_NaN(t *testing.T) {
	sv := &SpecialValue{}
	json.Unmarshal([]byte(`{"_nan":true}`), sv)
	got := sv.Any()
	f, ok := got.(float64)
	if !ok {
		t.Fatalf("expected float64, got %T", got)
	}
	if !math.IsNaN(f) {
		t.Error("expected NaN")
	}
}

func TestDecodeValue_Infinity(t *testing.T) {
	sv := &SpecialValue{}
	json.Unmarshal([]byte(`{"_infinity":1}`), sv)
	got := sv.Any()
	f, ok := got.(float64)
	if !ok {
		t.Fatalf("expected float64, got %T", got)
	}
	if !math.IsInf(f, 1) {
		t.Error("expected +Inf")
	}

	sv2 := &SpecialValue{}
	json.Unmarshal([]byte(`{"_infinity":-1}`), sv2)
	got2 := sv2.Any()
	f2, _ := got2.(float64)
	if !math.IsInf(f2, -1) {
		t.Error("expected -Inf")
	}
}

func TestDecodeValue_Unsupported(t *testing.T) {
	sv := &SpecialValue{}
	json.Unmarshal([]byte(`{"_unsupported":"function"}`), sv)
	got := sv.Any()
	uns, ok := got.(UnsupportedValue)
	if !ok {
		t.Fatalf("expected UnsupportedValue, got %T", got)
	}
	if uns.Type != "function" {
		t.Errorf("expected type='function', got %s", uns.Type)
	}
}

func TestParseRegexStr(t *testing.T) {
	re, err := parseRegexStr("/^[a-z]+$/i")
	if err != nil {
		t.Fatal(err)
	}
	if !re.MatchString("abc") {
		t.Error("should match 'abc'")
	}
	if !re.MatchString("ABC") {
		t.Error("should match 'ABC' with i flag")
	}
}

func TestParseRegexStr_NoFlags(t *testing.T) {
	re, err := parseRegexStr("/^[0-9]+$/")
	if err != nil {
		t.Fatal(err)
	}
	if !re.MatchString("123") {
		t.Error("should match '123'")
	}
	if re.MatchString("abc") {
		t.Error("should not match 'abc'")
	}
}

func TestParseRegexStr_Multiline(t *testing.T) {
	re, err := parseRegexStr("/^hello/m")
	if err != nil {
		t.Fatal(err)
	}
	if !re.MatchString("world\nhello") {
		t.Error("should match with multiline")
	}
}
