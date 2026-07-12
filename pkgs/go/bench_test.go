package zodval_test

import (
	"testing"

	zodval "github.com/CornWorld/zod-codepen/pkgs/go"
)

// BenchmarkValidate_Page_Valid measures validation of a valid Primo Page schema.
// Compare: Goja JS VM takes 1-5ms per Zod.parse() call.
func BenchmarkValidate_Page_Valid(b *testing.B) {
	doc := loadPrimoDoc(b)

	input := map[string]any{
		"id":     "page-001",
		"title":  "Getting Started",
		"slug":   "getting-started",
		"status": "published",
		"views":  float64(42),
	}

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_ = zodval.ValidateSchema(doc, "Page", input)
	}
}

// BenchmarkValidate_Page_Invalid measures validation that fails with multiple errors.
func BenchmarkValidate_Page_Invalid(b *testing.B) {
	doc := loadPrimoDoc(b)

	input := map[string]any{
		"id":     123,
		"title":  "",
		"slug":   "INVALID SLUG!",
		"status": "deleted",
		"views":  float64(-5),
	}

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_ = zodval.ValidateSchema(doc, "Page", input)
	}
}

// BenchmarkValidate_ParseAndValidate measures the full lifecycle:
// JSON parse → validate.
func BenchmarkValidate_FullPipeline(b *testing.B) {
	data, err := loadPrimoJSON()
	if err != nil {
		b.Fatal(err)
	}

	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		doc, _ := zodval.ParseDocument(data)
		input := map[string]any{
			"id":     "page-001",
			"title":  "Getting Started",
			"slug":   "getting-started",
			"status": "published",
			"views":  float64(42),
		}
		_ = zodval.ValidateSchema(doc, "Page", input)
	}
}

// BenchmarkValidate_Block_DiscriminatedUnion tests discriminated union dispatch.
func BenchmarkValidate_Block_TextBlock(b *testing.B) {
	doc := loadPrimoDoc(b)

	input := map[string]any{
		"type": "text",
		"body": "Hello, world!",
	}

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_ = zodval.ValidateSchema(doc, "Block", input)
	}
}

// BenchmarkValidate_Block_ImageBlock tests discriminated union with more complex option.
func BenchmarkValidate_Block_ImageBlock(b *testing.B) {
	doc := loadPrimoDoc(b)

	input := map[string]any{
		"type": "image",
		"url":  "https://example.com/pic.png",
		"alt":  "A picture",
	}

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_ = zodval.ValidateSchema(doc, "Block", input)
	}
}
