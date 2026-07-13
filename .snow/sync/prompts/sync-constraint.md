# Sync Prompt: 新增 {{.Primitive}} 约束 {{.ConstraintName}}

## Task

同步 Zod 上游新增的约束 `{{.ZodAPI}}` 到 zod-codepen。

## Changes Required

### 1. TS cast layer

**File**: `pkgs/core/src/cast/runtime.ts`
**Template**: `.snow/sync/templates/ts-constraint.txt`
**Fill-in**:

- Primitive: {{.Primitive}}
- ZodCheckName: {{.ZodCheckName}}
- ConstraintTarget: {{.ConstraintTarget}}
- ConstraintName: {{.ConstraintName}}
- Params: {{.Params}}

### 2. Go validator

**File**: `pkgs/go/{{.GoFile}}`
**Template**: `.snow/sync/templates/{{.GoTemplate}}`
**Fill-in**:

- ConstraintName: {{.ConstraintName}}
- FuncName: {{.FuncName}}
- Description: {{.Description}}
  {{if .Pattern}}- Pattern: {{.Pattern}}
- varName: {{.varName}}{{end}}

### 3. Tests

**File**: `pkgs/go/validate_test.go`
**Template**: `.snow/sync/templates/test-go-constraint.txt`

### 4. Capabilities update

After sync, add `{{.ConstraintName}}` to `{{.Primitive}}_constraints` in `capabilities.yaml`.

## Verification

```bash
cd pkgs/go && go build ./... && go vet ./... && go test -count=1 ./...
cd pkgs/core && pnpm build && pnpm test
```
