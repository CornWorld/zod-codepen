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
	"io"
	"net/http"
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

//go:embed templates/go-constraint-number.txt
var goConstraintNumberTmpl string

//go:embed templates/go-constraint-array.txt
var goConstraintArrayTmpl string

//go:embed templates/go-new-primitive.txt
var goNewPrimitiveTmpl string

//go:embed templates/go-new-node.txt
var goNewNodeTmpl string

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
	case "go-constraint-number":
		src = goConstraintNumberTmpl
	case "go-constraint-array":
		src = goConstraintArrayTmpl
	case "go-new-primitive":
		src = goNewPrimitiveTmpl
	case "go-new-node":
		src = goNewNodeTmpl
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

	// Fetch Zod releases from GitHub API
	releases, err := fetchZodReleases()
	if err != nil {
		fmt.Fprintf(os.Stderr, "⚠️  GitHub API unavailable (%v), using stub\n", err)
		emitStubDelta(*from, *to)
		return
	}

	// Find relevant release notes
	var releaseNotes string
	for _, r := range releases {
		if r.TagName == "v"+*to || r.TagName == *to {
			releaseNotes = r.Body
			break
		}
	}

	changes := parseChangelog(releaseNotes, *from, *to)
	delta := Delta{
		From:    *from,
		To:      *to,
		Changes: changes,
	}

	out, _ := json.MarshalIndent(delta, "", "  ")
	fmt.Println(string(out))
	fmt.Fprintf(os.Stderr, "\n✅ Detected %d change(s)\n", len(changes))
	if len(changes) == 0 {
		fmt.Fprintf(os.Stderr, "💡 Use zod-sync prompt --delta delta.json to generate an AI prompt for manual analysis.\n")
	}
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
		case "changed_api":
			plan.Actions = append(plan.Actions, SyncAction{
				File:     fmt.Sprintf("⚠️ CHANGED API: %s — verify Go validator still matches", ch.Name),
				Template: "manual",
				Variables: map[string]string{
					"name":    ch.Name,
					"zod_api": ch.ZodAPI,
					"source":  ch.Source,
					"msg":     fmt.Sprintf("Zod %s behavior changed: %s. Verify Go validator is still correct.", ch.Name, ch.Source),
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

// ---------------------------------------------------------------------------
// GitHub API types & fetch
// ---------------------------------------------------------------------------

type githubRelease struct {
	TagName string `json:"tag_name"`
	Body    string `json:"body"`
}

func fetchZodReleases() ([]githubRelease, error) {
	url := "https://api.github.com/repos/colinhacks/zod/releases?per_page=10"
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/vnd.github.v3+json")
	req.Header.Set("User-Agent", "zod-codepen-sync/1.0")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("HTTP request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("GitHub API returned %d: %s", resp.StatusCode, string(body))
	}

	var releases []githubRelease
	if err := json.NewDecoder(resp.Body).Decode(&releases); err != nil {
		return nil, fmt.Errorf("JSON decode failed: %w", err)
	}
	return releases, nil
}

// parseChangelog extracts structured changes from Zod release notes.
// This is a best-effort parser that looks for common patterns.
func parseChangelog(notes, from, to string) []DeltaChange {
	changes := make([]DeltaChange, 0)

	if notes == "" {
		return changes
	}

	// Pattern 1: "Add z.string().xxx()" or "z.string().xxx() method"
	stringPattern := regexp.MustCompile(`z\.string\(\)\.(\w+)\(\)`)
	for _, match := range stringPattern.FindAllStringSubmatch(notes, -1) {
		changes = append(changes, DeltaChange{
			Type:      "new_constraint",
			Primitive: "string",
			Name:      match[1],
			ZodAPI:    "z.string()." + match[1] + "()",
			Source:    "detected from release notes",
		})
	}

	// Pattern 2: "Add z.number().xxx()"
	numberPattern := regexp.MustCompile(`z\.number\(\)\.(\w+)\(\)`)
	for _, match := range numberPattern.FindAllStringSubmatch(notes, -1) {
		changes = append(changes, DeltaChange{
			Type:      "new_constraint",
			Primitive: "number",
			Name:      match[1],
			ZodAPI:    "z.number()." + match[1] + "()",
			Source:    "detected from release notes",
		})
	}

	// Pattern 3: "Add z.xxx()" — new top-level type
	typePattern := regexp.MustCompile(`\bz\.(\w+)\(\)`)
	for _, match := range typePattern.FindAllStringSubmatch(notes, -1) {
		name := match[1]
		// Skip common base types and constraints
		if isCoreType(name) {
			continue
		}
		// Check if it looks like a new type (not a method chain)
		if !isConstraintName(name) {
			changes = append(changes, DeltaChange{
				Type:      "new_type",
				Name:      "Zod" + strings.ToUpper(name[:1]) + name[1:],
				ZodAPI:    "z." + name + "()",
				Source:    "detected from release notes",
			})
		}
	}

	return changes
}

var coreTypes = map[string]bool{
	"string": true, "number": true, "boolean": true, "bigint": true,
	"date": true, "symbol": true, "undefined": true, "null": true,
	"void": true, "any": true, "unknown": true, "never": true,
	"nan": true, "object": true, "array": true, "tuple": true,
	"record": true, "map": true, "set": true, "union": true,
	"discriminatedUnion": true, "intersection": true, "enum": true,
	"literal": true, "nativeEnum": true, "function": true, "lazy": true,
	"promise": true, "transform": true, "effects": true, "instanceof": true,
	"custom": true, "brand": true, "pipeline": true,
	"min": true, "max": true, "length": true,
	"email": true, "url": true, "uuid": true, "cuid": true,
	"cuid2": true, "datetime": true, "ip": true, "emoji": true,
	"regex": true, "includes": true, "startsWith": true, "endsWith": true,
	"trim": true, "toLowerCase": true, "toUpperCase": true,
	"int": true, "finite": true, "safe": true, "positive": true,
	"negative": true, "nonnegative": true, "nonpositive": true,
	"multipleOf": true, "optional": true, "nullable": true,
	"nullish": true, "default": true, "catch": true, "readonly": true,
}

func isCoreType(name string) bool {
	return coreTypes[name]
}

func isConstraintName(name string) bool {
	constraints := map[string]bool{
		"min": true, "max": true, "length": true, "email": true,
		"url": true, "uuid": true, "cuid": true, "cuid2": true,
		"datetime": true, "ip": true, "emoji": true, "regex": true,
		"includes": true, "startsWith": true, "endsWith": true,
		"trim": true, "int": true, "finite": true, "safe": true,
		"positive": true, "negative": true, "nonnegative": true,
		"nonpositive": true, "multipleOf": true, "optional": true,
		"nullable": true, "nullish": true, "default": true,
	}
	return constraints[name]
}

func emitStubDelta(from, to string) {
	delta := Delta{
		From:    from,
		To:      to,
		Changes: []DeltaChange{},
	}
	out, _ := json.MarshalIndent(delta, "", "  ")
	fmt.Println(string(out))
	fmt.Fprintf(os.Stderr, "\n💡 To fill the delta, paste the Zod changelog into the AI prompt:\n")
	fmt.Fprintf(os.Stderr, "   zod-sync prompt --delta /dev/stdin --from %s --to %s\n", from, to)
	fmt.Fprintf(os.Stderr, "   Then paste the output into the AI chat.\n")
}
