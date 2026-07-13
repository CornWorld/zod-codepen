// Command zod-sync automates the synchronization of Zod upstream changes
// into the zod-codepen project (TS cast layer + Go validator).
//
// It implements a 4-phase workflow designed for weak-model AI assist:
//
//	Phase 0: detect  — Fetch Zod releases, diff API surface → delta.json
//	Phase 1: plan    — Match delta against capabilities → sync-plan.md
//	Phase 2: generate — Fill templates → unified diff patches
//	Phase 3: verify  — Apply patches, run build+test
//
// Usage:
//
//	zod-sync detect --from 3.22.0 --to 3.23.0
//	zod-sync plan --delta delta.json
//	zod-sync generate --plan sync-plan.md
//	zod-sync verify --patch patches/zod-3.23.0.patch
//
// The tool is designed so that Phases 1-2 can be delegated to a weak AI model
// that only needs to fill in template variables — no codebase understanding required.
package main

import (
	"bytes"
	_ "embed"
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"text/template"
)

// ---------------------------------------------------------------------------
// Data structures
// ---------------------------------------------------------------------------

// DeltaChange represents a single change detected between Zod versions.
type DeltaChange struct {
	Type      string `json:"type"` // "new_constraint", "new_type", "new_modifier", "changed_api"
	Primitive string `json:"primitive,omitempty"`
	Name      string `json:"name"`
	ZodAPI    string `json:"zod_api,omitempty"`
	Params    string `json:"params,omitempty"` // JSON string of ConstraintParams
	Source    string `json:"source,omitempty"`
}

// Delta represents the full diff between two Zod versions.
type Delta struct {
	From    string        `json:"from"`
	To      string        `json:"to"`
	Changes []DeltaChange `json:"changes"`
}

// SyncAction describes a single file modification.
type SyncAction struct {
	File         string
	Template     string
	Variables    map[string]string
	SearchMarker string // text to search for (insertion point)
}

// SyncPlan is the output of Phase 1.
type SyncPlan struct {
	From    string       `json:"from"`
	To      string       `json:"to"`
	Actions []SyncAction `json:"actions"`
	Summary string       `json:"summary"`
}

// ---------------------------------------------------------------------------
// Embedded templates
// ---------------------------------------------------------------------------

//go:embed templates/ts-constraint.txt
var tsConstraintTmpl string

//go:embed templates/go-constraint-string-simple.txt
var goConstraintStringSimpleTmpl string

//go:embed templates/go-constraint-string-regex.txt
var goConstraintStringRegexTmpl string

//go:embed templates/sync-constraint-prompt.md
var syncConstraintPromptTmpl string

func loadTemplate(name string) *template.Template {
	var src string
	switch name {
	case "ts-constraint":
		src = tsConstraintTmpl
	case "go-constraint-string-simple":
		src = goConstraintStringSimpleTmpl
	case "go-constraint-string-regex":
		src = goConstraintStringRegexTmpl
	case "sync-constraint-prompt":
		src = syncConstraintPromptTmpl
	default:
		return nil
	}
	return template.Must(template.New(name).Parse(src))
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

func main() {
	if len(os.Args) < 2 {
		printUsage()
		return
	}

	switch os.Args[1] {
	case "detect":
		cmdDetect(os.Args[2:])
	case "plan":
		cmdPlan(os.Args[2:])
	case "generate":
		cmdGenerate(os.Args[2:])
	case "verify":
		cmdVerify(os.Args[2:])
	case "prompt":
		cmdPrompt(os.Args[2:])
	default:
		fmt.Fprintf(os.Stderr, "unknown command: %s\n", os.Args[1])
		printUsage()
	}
}

func printUsage() {
	fmt.Println(`zod-sync — sync Zod upstream changes into zod-codepen

Usage:
  zod-sync detect  --from <ver> --to <ver>    Phase 0: detect API changes
  zod-sync plan    --delta delta.json          Phase 1: generate sync plan
  zod-sync generate --plan sync-plan.md         Phase 2: fill templates → patch
  zod-sync verify  --patch file.patch           Phase 3: apply & test
  zod-sync prompt  --delta delta.json           Generate AI prompt for Phase 1-2`)
}

// ---------------------------------------------------------------------------
// Phase 0: detect
// ---------------------------------------------------------------------------

func cmdDetect(args []string) {
	fs := flag.NewFlagSet("detect", flag.ExitOnError)
	from := fs.String("from", "", "source Zod version (e.g. 3.22.0)")
	to := fs.String("to", "", "target Zod version (e.g. 3.23.0)")
	fs.Parse(args)

	if *from == "" || *to == "" {
		fmt.Fprintln(os.Stderr, "detect requires --from and --to")
		os.Exit(1)
	}

	fmt.Fprintf(os.Stderr, "🔍 Detecting changes: zod %s → %s\n", *from, *to)
	fmt.Fprintln(os.Stderr, "   (This would fetch GitHub releases API + npm diff)")

	// In a full implementation, this would:
	// 1. Fetch https://api.github.com/repos/colinhacks/zod/releases
	// 2. Find the release notes for the target version
	// 3. Parse markdown changelog for new features
	// 4. Compare npm tarballs for API surface changes
	//
	// For now, stub the output and instruct the user.
	delta := Delta{
		From:    *from,
		To:      *to,
		Changes: []DeltaChange{},
	}

	out, _ := json.MarshalIndent(delta, "", "  ")
	fmt.Println(string(out))
	fmt.Fprintf(os.Stderr, "\n💡 To fill the delta, paste the Zod changelog into the AI prompt:\n")
	fmt.Fprintf(os.Stderr, "   zod-sync prompt --delta /dev/stdin --from %s --to %s\n", *from, *to)
	fmt.Fprintf(os.Stderr, "   Then paste the output into the AI chat.\n")
}

// ---------------------------------------------------------------------------
// Phase 1: plan
// ---------------------------------------------------------------------------

func cmdPlan(args []string) {
	fs := flag.NewFlagSet("plan", flag.ExitOnError)
	deltaFile := fs.String("delta", "", "path to delta.json")
	fs.Parse(args)

	if *deltaFile == "" {
		fmt.Fprintln(os.Stderr, "plan requires --delta")
		os.Exit(1)
	}

	delta, err := loadDelta(*deltaFile)
	if err != nil {
		fmt.Fprintf(os.Stderr, "failed to load delta: %v\n", err)
		os.Exit(1)
	}

	plan := generatePlan(delta)

	out, _ := json.MarshalIndent(plan, "", "  ")
	fmt.Println(string(out))
	fmt.Fprintf(os.Stderr, "\n✅ Generated sync plan: %d actions\n", len(plan.Actions))
}

func loadDelta(path string) (*Delta, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var d Delta
	if err := json.Unmarshal(data, &d); err != nil {
		return nil, fmt.Errorf("invalid delta.json: %w", err)
	}
	return &d, nil
}

// generatePlan produces a SyncPlan from a Delta by matching each change
// against the known capabilities. This is pure rule-matching — no AI needed.
func generatePlan(delta *Delta) *SyncPlan {
	plan := &SyncPlan{
		From:    delta.From,
		To:      delta.To,
		Actions: []SyncAction{},
	}

	for _, ch := range delta.Changes {
		switch ch.Type {
		case "new_constraint":
			action := planConstraint(ch)
			if action != nil {
				plan.Actions = append(plan.Actions, *action)
			}
		case "new_type":
			plan.Actions = append(plan.Actions, SyncAction{
				File:     "⚠️ NEW TYPE — requires human review",
				Template: "manual",
				Variables: map[string]string{
					"name":    ch.Name,
					"zod_api": ch.ZodAPI,
				},
			})
		case "new_modifier":
			plan.Actions = append(plan.Actions, SyncAction{
				File:     "⚠️ NEW MODIFIER — requires human review",
				Template: "manual",
				Variables: map[string]string{
					"name": ch.Name,
				},
			})
		}
	}

	if len(plan.Actions) == 0 {
		plan.Summary = "No actionable changes detected."
	} else {
		plan.Summary = fmt.Sprintf("%d change(s) to sync.", len(plan.Actions))
	}
	return plan
}

// planConstraint maps a new constraint to the files and templates needed.
func planConstraint(ch DeltaChange) *SyncAction {
	action := &SyncAction{
		Variables: map[string]string{
			"ConstraintName": ch.Name,
			"ZodAPI":         ch.ZodAPI,
			"Primitive":      ch.Primitive,
		},
	}

	switch ch.Primitive {
	case "string":
		action.File = "pkgs/go/validate_primitive.go"
		// Decide template based on constraint type.
		// Simple string checks use the simple template.
		// Regex-based constraints use the regex template.
		if strings.Contains(ch.Source, "regex") || strings.Contains(ch.Source, "pattern") {
			action.Template = "go-constraint-string-regex"
			action.Variables["varName"] = toCamelCase(ch.Name)
		} else {
			action.Template = "go-constraint-string-simple"
			action.Variables["FuncName"] = "is" + toPascalCase(ch.Name)
			action.Variables["Description"] = ch.Name
		}
		action.SearchMarker = `default:
		// Unknown constraint — skip`

		// Also add TS cast action.
		// (In full implementation, one delta change → multiple actions)
	case "number":
		action.File = "pkgs/go/validate_primitive.go"
		action.Template = "go-constraint-number"
		action.SearchMarker = `default:
		// Unknown constraint — skip`
	case "array":
		action.File = "pkgs/go/validate_composite.go"
		action.Template = "go-constraint-array"
		action.SearchMarker = `default:
		// Unknown array constraint`
	default:
		return nil
	}

	return action
}

// ---------------------------------------------------------------------------
// Phase 2: generate
// ---------------------------------------------------------------------------

func cmdGenerate(args []string) {
	fs := flag.NewFlagSet("generate", flag.ExitOnError)
	planFile := fs.String("plan", "", "path to sync-plan.json")
	outDir := fs.String("out", ".snow/sync/patches", "output directory for patches")
	fs.Parse(args)

	if *planFile == "" {
		fmt.Fprintln(os.Stderr, "generate requires --plan")
		os.Exit(1)
	}

	var plan SyncPlan
	data, err := os.ReadFile(*planFile)
	if err != nil {
		fmt.Fprintf(os.Stderr, "failed to read plan: %v\n", err)
		os.Exit(1)
	}
	if err := json.Unmarshal(data, &plan); err != nil {
		fmt.Fprintf(os.Stderr, "invalid plan: %v\n", err)
		os.Exit(1)
	}

	os.MkdirAll(*outDir, 0755)

	patchName := filepath.Join(*outDir, fmt.Sprintf("zod-%s-%s.patch", plan.From, plan.To))
	f, err := os.Create(patchName)
	if err != nil {
		fmt.Fprintf(os.Stderr, "failed to create patch: %v\n", err)
		os.Exit(1)
	}
	defer f.Close()

	for _, action := range plan.Actions {
		if action.Template == "manual" {
			fmt.Fprintf(f, "## MANUAL: %s (%s)\n\n", action.File, action.Variables["name"])
			continue
		}
		tmpl := loadTemplate(action.Template)
		if tmpl == nil {
			fmt.Fprintf(f, "## UNKNOWN TEMPLATE: %s\n\n", action.Template)
			continue
		}
		var buf bytes.Buffer
		if err := tmpl.Execute(&buf, action.Variables); err != nil {
			fmt.Fprintf(f, "## TEMPLATE ERROR: %s: %v\n\n", action.Template, err)
			continue
		}
		f.Write(buf.Bytes())
		f.WriteString("\n")
	}

	fmt.Fprintf(os.Stderr, "✅ Generated patch: %s\n", patchName)
}

// ---------------------------------------------------------------------------
// Phase 3: verify
// ---------------------------------------------------------------------------

func cmdVerify(args []string) {
	fs := flag.NewFlagSet("verify", flag.ExitOnError)
	patchFile := fs.String("patch", "", "path to patch file")
	rootDir := fs.String("root", "../..", "project root directory")
	fs.Parse(args)

	if *patchFile == "" {
		fmt.Fprintln(os.Stderr, "verify requires --patch")
		os.Exit(1)
	}

	fmt.Fprintf(os.Stderr, "🔧 Applying patch: %s\n", *patchFile)
	cmd := exec.Command("git", "apply", *patchFile)
	cmd.Dir = *rootDir
	if out, err := cmd.CombinedOutput(); err != nil {
		fmt.Fprintf(os.Stderr, "❌ Failed to apply patch:\n%s\n", out)
		os.Exit(1)
	}

	fmt.Fprintln(os.Stderr, "🔨 Building Go module...")
	goBuild := exec.Command("go", "build", "./...")
	goBuild.Dir = *rootDir + "/pkgs/go"
	if out, err := goBuild.CombinedOutput(); err != nil {
		fmt.Fprintf(os.Stderr, "❌ Go build failed:\n%s\n", out)
		fmt.Fprintln(os.Stderr, "Rolling back...")
		rollback(*patchFile, *rootDir)
		os.Exit(1)
	}

	fmt.Fprintln(os.Stderr, "🧪 Running Go tests...")
	goTest := exec.Command("go", "test", "-count=1", "./...")
	goTest.Dir = *rootDir + "/pkgs/go"
	if out, err := goTest.CombinedOutput(); err != nil {
		fmt.Fprintf(os.Stderr, "❌ Go test failed:\n%s\n", out)
		fmt.Fprintln(os.Stderr, "Rolling back...")
		rollback(*patchFile, *rootDir)
		os.Exit(1)
	}

	fmt.Fprintln(os.Stderr, "✅ All checks pass. Patch applied successfully.")
}

func rollback(patchFile, rootDir string) {
	cmd := exec.Command("git", "apply", "-R", patchFile)
	cmd.Dir = rootDir
	cmd.Run()
}

// ---------------------------------------------------------------------------
// prompt — Generate AI prompt for weak-model sync
// ---------------------------------------------------------------------------

func cmdPrompt(args []string) {
	fs := flag.NewFlagSet("prompt", flag.ExitOnError)
	deltaFile := fs.String("delta", "", "path to delta.json")
	from := fs.String("from", "", "source Zod version")
	to := fs.String("to", "", "target Zod version")
	fs.Parse(args)

	if *deltaFile == "" {
		fmt.Fprintln(os.Stderr, "prompt requires --delta")
		os.Exit(1)
	}

	delta, err := loadDelta(*deltaFile)
	if err != nil {
		fmt.Fprintf(os.Stderr, "failed to load delta: %v\n", err)
		os.Exit(1)
	}

	tmpl := loadTemplate("sync-constraint-prompt")
	if tmpl == nil {
		fmt.Fprintln(os.Stderr, "prompt template not found")
		os.Exit(1)
	}

	type promptData struct {
		From    string
		To      string
		Delta   *Delta
		Actions []SyncAction
	}

	plan := generatePlan(delta)
	data := promptData{
		From:    *from,
		To:      *to,
		Delta:   delta,
		Actions: plan.Actions,
	}

	var buf bytes.Buffer
	if err := tmpl.Execute(&buf, data); err != nil {
		fmt.Fprintf(os.Stderr, "template error: %v\n", err)
		os.Exit(1)
	}

	fmt.Println(buf.String())
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

var (
	matchFirstCap = regexp.MustCompile("(.)([A-Z][a-z]+)")
	matchAllCap   = regexp.MustCompile("([a-z0-9])([A-Z])")
)

func toCamelCase(s string) string {
	result := strings.ToLower(s[:1]) + s[1:]
	result = matchFirstCap.ReplaceAllString(result, "${1}_${2}")
	result = matchAllCap.ReplaceAllString(result, "${1}_${2}")
	return strings.ToLower(result)
}

func toPascalCase(s string) string {
	result := strings.ToUpper(s[:1]) + s[1:]
	return result
}
