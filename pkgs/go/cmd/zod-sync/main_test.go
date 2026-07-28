package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// ---------------------------------------------------------------------------
// Phase 1: plan generation tests
// ---------------------------------------------------------------------------

func TestGeneratePlan_Empty_Changes(t *testing.T) {
	delta := &Delta{
		From:    "3.22.0",
		To:      "3.23.0",
		Changes: []DeltaChange{},
	}

	plan := generatePlan(delta)
	if len(plan.Actions) != 0 {
		t.Errorf("expected 0 actions, got %d", len(plan.Actions))
	}
	if plan.Summary != "No actionable changes detected." {
		t.Errorf("expected empty summary, got %q", plan.Summary)
	}
}

func TestGeneratePlan_NewStringConstraint(t *testing.T) {
	delta := &Delta{
		From: "3.22.0",
		To:   "3.23.0",
		Changes: []DeltaChange{
			{
				Type:      "new_constraint",
				Primitive: "string",
				Name:      "emoji",
				ZodAPI:    "z.string().emoji()",
				Params:    "{}",
				Source:    "new ZodString method: emoji()",
			},
		},
	}

	plan := generatePlan(delta)
	if len(plan.Actions) != 1 {
		t.Fatalf("expected 1 action, got %d", len(plan.Actions))
	}

	a := plan.Actions[0]
	if a.File != "pkgs/go/validate_primitive.go" {
		t.Errorf("expected validate_primitive.go, got %s", a.File)
	}
	if a.Template != "go-constraint-string-simple" {
		t.Errorf("expected go-constraint-string-simple, got %s", a.Template)
	}
	if a.Variables["ConstraintName"] != "emoji" {
		t.Errorf("expected ConstraintName=emoji, got %s", a.Variables["ConstraintName"])
	}
	if a.Variables["FuncName"] != "isEmoji" {
		t.Errorf("expected FuncName=isEmoji, got %s", a.Variables["FuncName"])
	}
}

func TestGeneratePlan_NewStringRegexConstraint(t *testing.T) {
	delta := &Delta{
		From: "3.22.0",
		To:   "3.23.0",
		Changes: []DeltaChange{
			{
				Type:      "new_constraint",
				Primitive: "string",
				Name:      "hexColor",
				ZodAPI:    "z.string().hexColor()",
				Source:    "regex-based validation for hex colors",
			},
		},
	}

	plan := generatePlan(delta)
	if len(plan.Actions) != 1 {
		t.Fatalf("expected 1 action, got %d", len(plan.Actions))
	}
	a := plan.Actions[0]
	if a.Template != "go-constraint-string-regex" {
		t.Errorf("expected go-constraint-string-regex for regex source, got %s", a.Template)
	}
}

func TestGeneratePlan_NewNumberConstraint(t *testing.T) {
	delta := &Delta{
		From: "3.22.0",
		To:   "3.23.0",
		Changes: []DeltaChange{
			{
				Type:      "new_constraint",
				Primitive: "number",
				Name:      "multipleOf",
				ZodAPI:    "z.number().multipleOf(5)",
				Source:    "add multipleOf constraint",
			},
		},
	}

	plan := generatePlan(delta)
	if len(plan.Actions) != 1 {
		t.Fatalf("expected 1 action, got %d", len(plan.Actions))
	}
	if plan.Actions[0].File != "pkgs/go/validate_primitive.go" {
		t.Errorf("expected validate_primitive.go, got %s", plan.Actions[0].File)
	}
}

func TestGeneratePlan_NewType(t *testing.T) {
	delta := &Delta{
		From: "3.22.0",
		To:   "3.23.0",
		Changes: []DeltaChange{
			{
				Type:   "new_type",
				Name:   "file",
				ZodAPI: "z.file()",
				Source: "new top-level type",
			},
		},
	}

	plan := generatePlan(delta)
	if len(plan.Actions) != 1 {
		t.Fatalf("expected 1 action, got %d", len(plan.Actions))
	}
	if plan.Actions[0].Template != "manual" {
		t.Errorf("new types should require manual review, got %s", plan.Actions[0].Template)
		if !strings.Contains(plan.Actions[0].File, "⚠️") {
			t.Error("new type action should be marked for human review")
		}
	}
}

func TestGeneratePlan_NewModifier(t *testing.T) {
	delta := &Delta{
		From: "3.22.0",
		To:   "3.23.0",
		Changes: []DeltaChange{
			{
				Type: "new_modifier",
				Name: "readonly",
			},
		},
	}

	plan := generatePlan(delta)
	if len(plan.Actions) != 1 {
		t.Fatalf("expected 1 action, got %d", len(plan.Actions))
	}
	if plan.Actions[0].Template != "manual" {
		t.Errorf("new modifiers should require manual review, got %s", plan.Actions[0].Template)
	}
}

func TestGeneratePlan_Mixed_Changes(t *testing.T) {
	delta := &Delta{
		From: "3.22.0",
		To:   "3.23.0",
		Changes: []DeltaChange{
			{Type: "new_constraint", Primitive: "string", Name: "emoji", ZodAPI: "z.string().emoji()"},
			{Type: "new_constraint", Primitive: "string", Name: "cuid2", ZodAPI: "z.string().cuid2()"},
			{Type: "new_type", Name: "file", ZodAPI: "z.file()"},
			{Type: "changed_api", Name: "min", Source: "min now accepts bigint"},
		},
	}

	plan := generatePlan(delta)
	// 2 auto-syncable + 1 manual new_type + 1 changed_api (manual)
	if len(plan.Actions) != 4 {
		t.Fatalf("expected 4 actions, got %d", len(plan.Actions))
	}

	templateCount := 0
	manualCount := 0
	for _, a := range plan.Actions {
		if a.Template == "manual" {
			manualCount++
		} else {
			templateCount++
		}
	}
	if templateCount != 2 {
		t.Errorf("expected 2 template actions, got %d", templateCount)
	}
	if manualCount != 2 {
		t.Errorf("expected 2 manual actions, got %d", manualCount)
	}
}

func TestGeneratePlan_ChangedAPI(t *testing.T) {
	delta := &Delta{
		From: "4.3.6",
		To:   "4.4.0",
		Changes: []DeltaChange{
			{
				Type:      "changed_api",
				Primitive: "string",
				Name:      "base64",
				ZodAPI:    "z.string().base64()",
				Source:    "z.base64() now rejects whitespace",
			},
		},
	}

	plan := generatePlan(delta)
	if len(plan.Actions) != 1 {
		t.Fatalf("expected 1 action, got %d", len(plan.Actions))
	}
	if plan.Actions[0].Template != "manual" {
		t.Errorf("changed_api should require manual review, got %s", plan.Actions[0].Template)
	}
}

// ---------------------------------------------------------------------------
// Template rendering tests
// ---------------------------------------------------------------------------

func TestTemplate_GoConstraintStringSimple(t *testing.T) {
	tmpl := loadTemplate("go-constraint-string-simple")
	if tmpl == nil {
		t.Fatal("template not found")
	}

	var buf strings.Builder
	err := tmpl.Execute(&buf, map[string]string{
		"ConstraintName": "emoji",
		"FuncName":       "isEmoji",
		"Description":    "emoji",
	})
	if err != nil {
		t.Fatalf("template execute failed: %v", err)
	}

	out := buf.String()
	if !strings.Contains(out, "emoji") {
		t.Error("output should contain 'emoji'")
	}
	if !strings.Contains(out, "isEmoji") {
		t.Error("output should contain 'isEmoji'")
	}
	if !strings.Contains(out, "invalid_string") {
		t.Error("output should contain 'invalid_string'")
	}
	// Should NOT have double "is" prefix bug
	if strings.Contains(out, "isisEmoji") {
		t.Error("output should not have double 'is' prefix")
	}
}

func TestTemplate_GoConstraintStringRegex(t *testing.T) {
	tmpl := loadTemplate("go-constraint-string-regex")
	if tmpl == nil {
		t.Fatal("template not found")
	}

	var buf strings.Builder
	err := tmpl.Execute(&buf, map[string]string{
		"ConstraintName": "hexColor",
		"varName":        "hexColor",
		"Pattern":        "^#[0-9a-fA-F]{6}$",
		"Description":    "hex color",
	})
	if err != nil {
		t.Fatalf("template execute failed: %v", err)
	}

	out := buf.String()
	if !strings.Contains(out, "hexColorRegex") {
		t.Error("output should contain 'hexColorRegex'")
	}
	if !strings.Contains(out, "MatchString") {
		t.Error("output should contain 'MatchString'")
	}
}

func TestTemplate_SyncPrompt(t *testing.T) {
	tmpl := loadTemplate("sync-constraint-prompt")
	if tmpl == nil {
		t.Fatal("template not found")
	}

	delta := &Delta{
		From: "3.22.0",
		To:   "3.23.0",
		Changes: []DeltaChange{
			{Type: "new_constraint", Primitive: "string", Name: "emoji", ZodAPI: "z.string().emoji()"},
		},
	}
	plan := generatePlan(delta)

	var buf strings.Builder
	err := tmpl.Execute(&buf, map[string]any{
		"From":    delta.From,
		"To":      delta.To,
		"Delta":   delta,
		"Actions": plan.Actions,
	})
	if err != nil {
		t.Fatalf("template execute failed: %v", err)
	}

	out := buf.String()
	if !strings.Contains(out, "emoji") {
		t.Error("output should mention emoji constraint")
	}
	if !strings.Contains(out, "Sync Zod upstream changes") {
		t.Error("output should contain task description")
	}
}

// ---------------------------------------------------------------------------
// Delta roundtrip test
// ---------------------------------------------------------------------------

func TestDeltaRoundtrip(t *testing.T) {
	original := Delta{
		From: "3.22.0",
		To:   "3.23.0",
		Changes: []DeltaChange{
			{Type: "new_constraint", Primitive: "string", Name: "emoji", Source: "test"},
		},
	}

	data, err := json.Marshal(original)
	if err != nil {
		t.Fatal(err)
	}

	var restored Delta
	if err := json.Unmarshal(data, &restored); err != nil {
		t.Fatal(err)
	}

	if restored.From != original.From || restored.To != original.To {
		t.Error("version mismatch")
	}
	if len(restored.Changes) != 1 || restored.Changes[0].Name != "emoji" {
		t.Error("changes mismatch")
	}
}

// ---------------------------------------------------------------------------
// Full pipeline: delta → plan → patch (integration)
// ---------------------------------------------------------------------------

func TestFullPipeline_PlanToPatch(t *testing.T) {
	delta := &Delta{
		From: "3.22.0",
		To:   "3.23.0",
		Changes: []DeltaChange{
			{Type: "new_constraint", Primitive: "string", Name: "emoji", ZodAPI: "z.string().emoji()", Params: "{}"},
			{Type: "new_constraint", Primitive: "string", Name: "hexColor", ZodAPI: "z.string().hexColor()", Source: "regex validation for hex colors"},
			{Type: "new_type", Name: "file", ZodAPI: "z.file()"},
		},
	}

	plan := generatePlan(delta)

	// Verify plan structure.
	if len(plan.Actions) != 3 {
		t.Fatalf("expected 3 actions, got %d", len(plan.Actions))
	}

	// Verify each action has required fields.
	for i, action := range plan.Actions {
		if action.Template == "" {
			t.Errorf("action[%d]: template is empty", i)
		}
		if action.File == "" {
			t.Errorf("action[%d]: file is empty", i)
		}
		if action.Template != "manual" {
			if action.Variables == nil {
				t.Errorf("action[%d]: variables is nil for templated action", i)
			}
		}
	}

	// Write plan to temp file and verify it can be read back.
	tmpDir := t.TempDir()
	planPath := filepath.Join(tmpDir, "plan.json")
	data, _ := json.MarshalIndent(plan, "", "  ")
	if err := os.WriteFile(planPath, data, 0644); err != nil {
		t.Fatal(err)
	}

	// Verify the file can be read back.
	reRead, err := os.ReadFile(planPath)
	if err != nil {
		t.Fatal(err)
	}
	var rePlan SyncPlan
	if err := json.Unmarshal(reRead, &rePlan); err != nil {
		t.Fatalf("plan roundtrip failed: %v", err)
	}
	if len(rePlan.Actions) != len(plan.Actions) {
		t.Errorf("roundtrip: expected %d actions, got %d", len(plan.Actions), len(rePlan.Actions))
	}
}

// ---------------------------------------------------------------------------
// Helper function tests
// ---------------------------------------------------------------------------

func TestToPascalCase(t *testing.T) {
	cases := []struct{ in, want string }{
		{"emoji", "Emoji"},
		{"hexColor", "HexColor"},
		{"cuid2", "Cuid2"},
		{"httpUrl", "HttpUrl"},
	}
	for _, tc := range cases {
		got := toPascalCase(tc.in)
		if got != tc.want {
			t.Errorf("toPascalCase(%q) = %q, want %q", tc.in, got, tc.want)
		}
	}
}

func TestToCamelCase(t *testing.T) {
	cases := []struct{ in, want string }{
		{"Emoji", "emoji"},
		{"HexColor", "hex_color"},
		{"Cuid2", "cuid2"},
	}
	for _, tc := range cases {
		got := toCamelCase(tc.in)
		if got != tc.want {
			t.Errorf("toCamelCase(%q) = %q, want %q", tc.in, got, tc.want)
		}
	}
}

// ---------------------------------------------------------------------------
// New template tests: number + array constraints
// ---------------------------------------------------------------------------

func TestTemplate_GoConstraintNumber(t *testing.T) {
	tmpl := loadTemplate("go-constraint-number")
	if tmpl == nil {
		t.Fatal("template not found")
	}

	var buf strings.Builder
	err := tmpl.Execute(&buf, map[string]string{
		"ConstraintName": "multipleOf",
		"FuncName":       "multipleOf",
		"Description":    "multiple of",
	})
	if err != nil {
		t.Fatalf("template execute failed: %v", err)
	}

	out := buf.String()
	if !strings.Contains(out, "multipleOf") {
		t.Error("output should contain 'multipleOf'")
	}
	if !strings.Contains(out, "invalid_number") {
		t.Error("output should contain 'invalid_number'")
	}
	if !strings.Contains(out, "validateNumberConstraint") {
		t.Error("output should reference validateNumberConstraint")
	}
}

func TestTemplate_GoConstraintArray(t *testing.T) {
	tmpl := loadTemplate("go-constraint-array")
	if tmpl == nil {
		t.Fatal("template not found")
	}

	var buf strings.Builder
	err := tmpl.Execute(&buf, map[string]string{
		"ConstraintName": "nonempty",
		"FuncName":       "nonempty",
		"Description":    "non-empty",
	})
	if err != nil {
		t.Fatalf("template execute failed: %v", err)
	}

	out := buf.String()
	if !strings.Contains(out, "nonempty") {
		t.Error("output should contain 'nonempty'")
	}
	if !strings.Contains(out, "invalid_array") {
		t.Error("output should contain 'invalid_array'")
	}
	if !strings.Contains(out, "validateArrayConstraint") {
		t.Error("output should reference validateArrayConstraint")
	}
}

// ---------------------------------------------------------------------------
// ParseChangelog tests
// ---------------------------------------------------------------------------

func TestParseChangelog_EmptyNotes(t *testing.T) {
	changes := parseChangelog("", "3.22.0", "3.23.0")
	if len(changes) != 0 {
		t.Errorf("expected 0 changes, got %d", len(changes))
	}
}

func TestParseChangelog_StringConstraint(t *testing.T) {
	notes := `## New Features

- Added z.string().emoji() to validate emoji characters
- z.string().hexColor() now available`
	changes := parseChangelog(notes, "3.22.0", "3.23.0")
	if len(changes) < 2 {
		t.Fatalf("expected at least 2 changes, got %d", len(changes))
	}
	found := false
	for _, c := range changes {
		if c.Name == "emoji" && c.Primitive == "string" {
			found = true
			break
		}
	}
	if !found {
		t.Error("expected 'emoji' string constraint to be detected")
	}
}

func TestParseChangelog_NumberConstraint(t *testing.T) {
	notes := `## Changes

- Add z.number().multipleOf() to check if a number is a multiple of another`
	changes := parseChangelog(notes, "3.22.0", "3.23.0")
	found := false
	for _, c := range changes {
		if c.Name == "multipleOf" && c.Primitive == "number" {
			found = true
			break
		}
	}
	if !found {
		t.Error("expected 'multipleOf' number constraint to be detected")
	}
}

func TestParseChangelog_IgnoresCoreTypes(t *testing.T) {
	// Ensure core types like z.string(), z.number() don't generate noise
	notes := `z.string() basic type remains unchanged
z.number() updates`
	changes := parseChangelog(notes, "3.22.0", "3.23.0")
	for _, c := range changes {
		if c.Type == "new_type" && (c.Name == "ZodString" || c.Name == "ZodNumber") {
			t.Errorf("should not detect core type: %s", c.Name)
		}
	}
}
