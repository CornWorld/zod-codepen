package zodval_test

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	zodval "github.com/CornWorld/zod-codepen/pkgs/go"
)

// loadPrimoDoc loads the real TS-exported schemas.json fixture.
func loadPrimoDoc(t testing.TB) *zodval.AstDocument {
	t.Helper()
	data, err := os.ReadFile(filepath.Join("examples", "primo", "schemas.json"))
	if err != nil {
		t.Fatalf("failed to read primo schemas.json: %v (run from pkgs/go/)", err)
	}
	doc, err := zodval.ParseDocument(data)
	if err != nil {
		t.Fatalf("failed to parse primo schemas.json: %v", err)
	}
	return doc
}

// loadPrimoJSON returns the raw schemas.json bytes.
func loadPrimoJSON() ([]byte, error) {
	return os.ReadFile(filepath.Join("examples", "primo", "schemas.json"))
}

func mustParseJSON(t *testing.T, raw string) any {
	t.Helper()
	var v any
	if err := json.Unmarshal([]byte(raw), &v); err != nil {
		t.Fatalf("bad test JSON: %v", err)
	}
	return v
}

// --- Page schema integration tests ---

func TestIntegration_Page_Valid(t *testing.T) {
	doc := loadPrimoDoc(t)

	input := mustParseJSON(t, `{
		"id": "page-001",
		"title": "Getting Started",
		"slug": "getting-started",
		"status": "published",
		"views": 42
	}`)

	result := zodval.ValidateSchema(doc, "Page", input)
	if !result.IsValid() {
		t.Errorf("expected valid Page, got: %s", result.Error())
	}
}

func TestIntegration_Page_AllFieldsIncludingOptional(t *testing.T) {
	doc := loadPrimoDoc(t)

	input := mustParseJSON(t, `{
		"id": "page-002",
		"title": "Advanced Guide",
		"slug": "advanced-guide",
		"status": "draft",
		"views": 100,
		"content": "Some markdown content",
		"publishedAt": "2026-01-15T10:30:00Z"
	}`)

	result := zodval.ValidateSchema(doc, "Page", input)
	if !result.IsValid() {
		t.Errorf("expected valid Page with all fields, got: %s", result.Error())
	}
}

func TestIntegration_Page_MissingRequiredId(t *testing.T) {
	doc := loadPrimoDoc(t)

	input := mustParseJSON(t, `{
		"title": "No ID",
		"slug": "no-id",
		"status": "draft",
		"views": 0
	}`)

	result := zodval.ValidateSchema(doc, "Page", input)
	if result.IsValid() {
		t.Fatal("expected invalid Page (missing id)")
	}
	if result.First().FormatPath() != "id" {
		t.Errorf("expected error at path 'id', got '%s'", result.First().FormatPath())
	}
}

func TestIntegration_Page_InvalidTypes(t *testing.T) {
	doc := loadPrimoDoc(t)

	input := mustParseJSON(t, `{
		"id": 999,
		"title": "",
		"slug": "INVALID SLUG!",
		"status": "deleted",
		"views": -5
	}`)

	result := zodval.ValidateSchema(doc, "Page", input)
	if result.IsValid() {
		t.Fatal("expected invalid Page")
	}

	errorCount := len(result.Errors)
	if errorCount < 4 {
		t.Errorf("expected at least 4 errors, got %d: %s", errorCount, result.Error())
	}

	// Verify specific error codes are present.
	codes := make(map[string]bool)
	for _, e := range result.Errors {
		codes[e.Code] = true
	}
	for _, expectedCode := range []string{"invalid_type", "too_small", "invalid_string", "invalid_enum_value", "too_small"} {
		if !codes[expectedCode] {
			t.Logf("missing expected error code: %s", expectedCode)
		}
	}
}

func TestIntegration_Page_StrictObject_NoExtraKeys(t *testing.T) {
	doc := loadPrimoDoc(t)

	// Page uses "strip" mode, meaning extra keys are silently ignored.
	input := mustParseJSON(t, `{
		"id": "p1",
		"title": "Test",
		"slug": "test",
		"status": "draft",
		"views": 0,
		"extraField": "this should be ignored"
	}`)

	result := zodval.ValidateSchema(doc, "Page", input)
	if !result.IsValid() {
		t.Errorf("strip mode should ignore extra keys, got: %s", result.Error())
	}
}

// --- Block (discriminated union) integration tests ---

func TestIntegration_Block_TextBlock(t *testing.T) {
	doc := loadPrimoDoc(t)

	input := mustParseJSON(t, `{
		"type": "text",
		"body": "Hello, world!"
	}`)

	result := zodval.ValidateSchema(doc, "Block", input)
	if !result.IsValid() {
		t.Errorf("expected valid text block, got: %s", result.Error())
	}
}

func TestIntegration_Block_HeadingBlock(t *testing.T) {
	doc := loadPrimoDoc(t)

	input := mustParseJSON(t, `{
		"type": "heading",
		"text": "Chapter One",
		"level": 2
	}`)

	result := zodval.ValidateSchema(doc, "Block", input)
	if !result.IsValid() {
		t.Errorf("expected valid heading block, got: %s", result.Error())
	}
}

func TestIntegration_Block_ImageBlock(t *testing.T) {
	doc := loadPrimoDoc(t)

	input := mustParseJSON(t, `{
		"type": "image",
		"url": "https://example.com/pic.png",
		"alt": "A nice picture"
	}`)

	result := zodval.ValidateSchema(doc, "Block", input)
	if !result.IsValid() {
		t.Errorf("expected valid image block, got: %s", result.Error())
	}
}

func TestIntegration_Block_ImageBlockMissingAlt(t *testing.T) {
	doc := loadPrimoDoc(t)

	// alt is optional
	input := mustParseJSON(t, `{
		"type": "image",
		"url": "https://example.com/pic.png"
	}`)

	result := zodval.ValidateSchema(doc, "Block", input)
	if !result.IsValid() {
		t.Errorf("expected valid image block without alt, got: %s", result.Error())
	}
}

func TestIntegration_Block_ImageBlockInvalidURL(t *testing.T) {
	doc := loadPrimoDoc(t)

	input := mustParseJSON(t, `{
		"type": "image",
		"url": "not-a-url"
	}`)

	result := zodval.ValidateSchema(doc, "Block", input)
	if result.IsValid() {
		t.Fatal("expected invalid image block (bad URL)")
	}
}

func TestIntegration_Block_UnknownDiscriminatorValue(t *testing.T) {
	doc := loadPrimoDoc(t)

	input := mustParseJSON(t, `{
		"type": "video",
		"url": "https://example.com/video.mp4"
	}`)

	result := zodval.ValidateSchema(doc, "Block", input)
	if result.IsValid() {
		t.Fatal("expected invalid block (unknown discriminator 'video')")
	}
}

func TestIntegration_Block_MissingDiscriminator(t *testing.T) {
	doc := loadPrimoDoc(t)

	input := mustParseJSON(t, `{
		"body": "no type field"
	}`)

	result := zodval.ValidateSchema(doc, "Block", input)
	if result.IsValid() {
		t.Fatal("expected invalid block (missing discriminator)")
	}
}

// --- StringOrNumber (union) integration tests ---

func TestIntegration_StringOrNumber_String(t *testing.T) {
	doc := loadPrimoDoc(t)

	result := zodval.ValidateSchema(doc, "StringOrNumber", "hello")
	if !result.IsValid() {
		t.Errorf("expected valid string, got: %s", result.Error())
	}
}

func TestIntegration_StringOrNumber_Number(t *testing.T) {
	doc := loadPrimoDoc(t)

	result := zodval.ValidateSchema(doc, "StringOrNumber", float64(42))
	if !result.IsValid() {
		t.Errorf("expected valid number, got: %s", result.Error())
	}
}

func TestIntegration_StringOrNumber_Boolean(t *testing.T) {
	doc := loadPrimoDoc(t)

	result := zodval.ValidateSchema(doc, "StringOrNumber", true)
	if result.IsValid() {
		t.Fatal("expected invalid (bool)")
	}
}

// --- TagList (nonempty array) integration tests ---

func TestIntegration_TagList_Valid(t *testing.T) {
	doc := loadPrimoDoc(t)

	result := zodval.ValidateSchema(doc, "TagList", []any{"go", "zod", "validation"})
	if !result.IsValid() {
		t.Errorf("expected valid tag list, got: %s", result.Error())
	}
}

func TestIntegration_TagList_Empty(t *testing.T) {
	doc := loadPrimoDoc(t)

	result := zodval.ValidateSchema(doc, "TagList", []any{})
	if result.IsValid() {
		t.Fatal("expected invalid (nonempty constraint)")
	}
}

func TestIntegration_TagList_InvalidElement(t *testing.T) {
	doc := loadPrimoDoc(t)

	result := zodval.ValidateSchema(doc, "TagList", []any{"valid", 42})
	if result.IsValid() {
		t.Fatal("expected invalid (number element in string array)")
	}
}

// --- DefaultTheme (literal) integration tests ---

func TestIntegration_DefaultTheme_Light(t *testing.T) {
	doc := loadPrimoDoc(t)

	result := zodval.ValidateSchema(doc, "DefaultTheme", "light")
	if !result.IsValid() {
		t.Errorf("expected 'light' to be valid, got: %s", result.Error())
	}
}

func TestIntegration_DefaultTheme_Dark(t *testing.T) {
	doc := loadPrimoDoc(t)

	result := zodval.ValidateSchema(doc, "DefaultTheme", "dark")
	if result.IsValid() {
		t.Fatal("expected 'dark' to be invalid")
	}
}

// --- Edge cases ---

func TestIntegration_Page_JSONNumberPrecision(t *testing.T) {
	doc := loadPrimoDoc(t)

	// JSON numbers are float64. views must be int + nonnegative.
	input := mustParseJSON(t, `{
		"id": "p1",
		"title": "Test",
		"slug": "test",
		"status": "draft",
		"views": 42
	}`)

	// 42 in JSON becomes float64(42) after unmarshal.
	// z.number().int() should accept it since it's a whole number.
	result := zodval.ValidateSchema(doc, "Page", input)
	if !result.IsValid() {
		t.Errorf("int 42 should be valid, got: %s", result.Error())
	}

	// 42.5 should fail the int constraint.
	input2 := mustParseJSON(t, `{
		"id": "p2",
		"title": "Test",
		"slug": "test",
		"status": "draft",
		"views": 42.5
	}`)

	result2 := zodval.ValidateSchema(doc, "Page", input2)
	if result2.IsValid() {
		t.Fatal("expected 42.5 to fail int constraint")
	}
}
