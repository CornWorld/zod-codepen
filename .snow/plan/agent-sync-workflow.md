# Agent Workflow: 同步 Zod Baseline 改动

## 问题描述

当 Zod 上游发布新版本（新增类型/约束/修饰符），需要将改动同步到：

1. TS 端 cast 层（`cast/runtime.ts`、`cast/ast.ts`）
2. TS 端 IR（`ir/nodes.ts`，仅新增节点类型时）
3. Go 端校验器（`pkgs/go/validate_*.go`）
4. 三端测试

目标：设计一个 agent 工作流，**允许用较弱能力模型（如 DS v4 Flash）** 快速同步改动，而非每次都需要 Claude/高级模型从头分析。

## 关键洞察：同步面其实很小

Zod 的大多数改动是**线性扩展**而非**架构变更**。三类改动及影响面：

| 改动类型         | 频率 | TS cast      | TS IR        | Go                    | 示例                 |
| ---------------- | ---- | ------------ | ------------ | --------------------- | -------------------- |
| **新增约束**     | 高   | 1 行映射     | 不改         | 1 个 case             | `z.string().emoji()` |
| **新增修饰符**   | 低   | 3-5 行       | 不改         | 1 个 case             | `.brand()`           |
| **新增节点类型** | 极低 | 新 cast 函数 | 新 interface | 新 struct + validator | `z.file()`           |

→ 80% 的同步工作是“加一个 case”，完全可以用弱模型 + 模板完成。

## 总体工作流

```
┌─────────────────────────────────────────────────────────────────┐
│                    Phase 0: 变更检测（自动，无 AI）               │
│                                                                 │
│  GitHub API → 获取 Zod releases diff                            │
│  npm diff → 对比两个版本的 exports                              │
│  输出: delta.json（结构化变更清单）                               │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                  Phase 1: 影响分析（弱模型，小上下文）            │
│                                                                 │
│  输入: delta.json + 当前 capabilities.yaml（能力清单）            │
│  输出: sync-plan.md（需要改动的文件 + 模板化步骤）                │
│  模型要求: 理解 JSON structure + 匹配 pattern                    │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│              Phase 2: 代码生成（弱模型 + 模板，分文件）           │
│                                                                 │
│  输入: sync-plan.md + 对应源文件 + 模板                          │
│  输出: 每个文件的 unified diff patch                             │
│  模型要求: 填空（模板已给出，弱模型只需填值）                     │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                 Phase 3: 验证（自动 + 人工）                     │
│                                                                 │
│  go build / go test / go vet / gofmt                            │
│  → 如失败，回滚 patch 并标记需要人工/强模型介入                   │
│  → 如成功，生成 commit message 并提示 review                     │
└─────────────────────────────────────────────────────────────────┘
```

---

## Phase 0: 变更检测（自动化脚本，零 AI 依赖）

### 0.1 获取 Zod 版本 diff

```bash
# 从 GitHub releases API 获取 changelog
curl -s https://api.github.com/repos/colinhacks/zod/releases | jq '.[0]'

# npm diff 检测导出 API 变化
npm pack zod@3.22.0 --pack-destination /tmp
npm pack zod@3.23.0 --pack-destination /tmp
# 对比两个 tarball 中的 index.d.ts
```

### 0.2 生成结构化 delta

输出文件 `delta.json`：

```json
{
  "from": "3.22.0",
  "to": "3.23.0",
  "changes": [
    {
      "type": "new_constraint",
      "primitive": "string",
      "name": "emoji",
      "params": {},
      "zod_api": "z.string().emoji()",
      "source": "added in z.string() checks"
    },
    {
      "type": "new_type",
      "name": "ZodFile",
      "kind": "ZodType<File, ...>",
      "source": "new top-level export"
    }
  ]
}
```

### 0.3 关键：生成稳定的"检测签名"

Zod 的 `index.d.ts` 是稳定的 API 签名。我们可以：

1. 把两个版本的 `.d.ts` 转成 AST 符号表
2. Diff 符号表 → 得到精确的 API 变更
3. 这完全不需要 AI

可以用 `ts-morph` 或 `tsc --declaration` + 简单解析完成。

---

## Phase 1: 影响分析（弱模型 + 小上下文）

### 1.1 输入

两个文件：

- `delta.json`（Phase 0 输出，< 1KB）
- `capabilities.yaml`（当前能力清单，~3KB）

`capabilities.yaml` 示例：

```yaml
version: 1
ir_node_kinds:
  - primitive
  - literal
  - enum
  - array
  - object
  - tuple
  - record
  - map
  - set
  - union
  - intersection
  - modified
  - transform
  - refine
  - preprocess
  - pipe
  - zod-function
  - lazy
  - promise
  - fallback
  - raw

primitive_types:
  - string
  - number
  - bigint
  - boolean
  - date
  - null
  - undefined
  - void
  - any
  - unknown
  - never
  - nan
  - symbol

string_constraints:
  - min
  - max
  - length
  - nonempty
  - email
  - url
  - uuid
  - regex
  - startsWith
  - endsWith
  - includes
  - cuid
  - cuid2
  - datetime
  - ip

number_constraints:
  - min
  - max
  - int
  - finite
  - positive
  - negative
  - nonnegative
  - nonpositive
  - multipleOf
  - safe

array_constraints:
  - min
  - max
  - length
  - nonempty

modifier_names:
  - optional
  - nullable
  - nullish
  - default
  - catch
  - brand
  - readonly
  - prefault
```

### 1.2 输出

`sync-plan.md`：

```markdown
# Sync Plan: Zod 3.22.0 → 3.23.0

## New Constraints (2)

### 1. z.string().emoji()

- **Type**: new_constraint
- **IR Impact**: none (fits existing ConstraintNode)
- **TS cast**: Add to `castConstraints()` in `runtime.ts` line ~263
- **Go validate**: Add case in `validateStringConstraint()` in `validate_primitive.go`
- **Template**: string_constraint_simple

### 2. z.string().nanoid()

- **Type**: new_constraint
- **IR Impact**: none
- **TS cast**: Add to `castConstraints()` in `runtime.ts`
- **Go validate**: Add case in `validateStringConstraint()`
- **Template**: string_constraint_simple

## Summary

- New nodes: 0
- New primitives: 0
- New constraints: 2 (both string)
- New modifiers: 0
- Files to modify: 2 (runtime.ts, validate_primitive.go)
```

### 1.3 为什么弱模型能做

- `delta.json` 已经结构化了变更
- `capabilities.yaml` 已经编码了当前能力
- 映射逻辑是**纯机械的**：`new_constraint + primitive=string → add case in validate_primitive.go`
- 决策树 < 10 个分支

---

## Phase 2: 代码生成（弱模型 + 模板）

### 2.1 模板系统

预定义模板文件 `templates/`：

**`templates/ts-constraint-string.txt`**:

```
// In cast/runtime.ts, inside castConstraints():
// After the last string constraint case, add:
		case "{{.ZodCheckName}}":
			{
				target: "string",
				name: "{{.ConstraintName}}",
				params: {},
			},
```

**`templates/go-constraint-string-simple.txt`**:

```
// In validate_primitive.go, inside validateStringConstraint():
// After the last string constraint case, add:
	case "{{.ConstraintName}}":
		if !is{{.FuncName}}(s) {
			vc.addError(path, "invalid_string",
				"invalid {{.Description}}", "{{.ConstraintName}}", s)
		}
```

**`templates/go-constraint-string-regex.txt`**:

```
// Pattern-based constraint.
var {{.varName}}Regex = regexp.MustCompile(`{{.Pattern}}`)
// ... (add validation case)
```

### 2.2 弱模型的任务

给出 `sync-plan.md` + 源文件（只给相关片段，不是整个文件）+ 模板，弱模型只需要：

1. 读模板
2. 填 `{{.ConstraintName}}`、`{{.FuncName}}` 等变量
3. 输出 unified diff patch

→ 这是**填空题**，不需要理解整个代码库。

### 2.3 分文件策略

对于每个要修改的文件，单独发一个 agent task：

- 上下文 = 该文件 + 该文件的模板 + sync-plan 中该条目的参数
- 弱模型完全能处理单文件、小上下文的填空任务

---

## Phase 3: 验证

```bash
# 自动验证流水线
cd pkgs/go && go build ./... && go test ./... && go vet ./...
# TS 端
cd pkgs/core && pnpm build && pnpm test
```

如果失败：

- 回滚 patch（`git apply -R`）
- 标记该条 change 需要人工或强模型介入
- 其余 change 继续

---

## 具体实现计划

### Step 1: 创建 `capabilities.yaml`

在 `.snow/sync/` 下创建能力清单文件。每次同步完成后自动更新。

### Step 2: 创建模板文件

在 `.snow/sync/templates/` 下创建以下模板：

| 模板文件                   | 用途                       |
| -------------------------- | -------------------------- |
| `ts-constraint-*.txt`      | TS cast 层添加约束         |
| `ts-primitive.txt`         | TS cast 层添加新 primitive |
| `go-constraint-string.txt` | Go 端添加 string 约束      |
| `go-constraint-number.txt` | Go 端添加 number 约束      |
| `go-constraint-array.txt`  | Go 端添加 array 约束       |
| `go-new-type.txt`          | Go 端添加新节点类型        |
| `test-go-constraint.txt`   | Go 测试模板                |
| `test-ts-constraint.txt`   | TS 测试模板                |

### Step 3: 编写 Phase 0 检测脚本

`scripts/zod-diff.sh` — 用 GitHub API + npm diff 生成 `delta.json`。

### Step 4: 编写 Phase 1 匹配逻辑

可以用简单的 Go/TS 脚本实现（规则匹配，不依赖 AI），也可以用小上下文 prompt 让弱模型做。规则匹配更稳定：

```go
// Pseudocode: mechanical mapping
func planSync(delta Delta, caps Capabilities) SyncPlan {
    for _, change := range delta.Changes {
        switch change.Type {
        case "new_constraint":
            if caps.HasConstraint(change.Primitive, change.Name) {
                continue // already implemented
            }
            plan.Add(ChangeItem{
                Files: []string{
                    castRuntimeFile,
                    validatePrimitiveFile,
                    testFile,
                },
                Template: fmt.Sprintf("go-constraint-%s.txt", change.Primitive),
            })
        }
    }
}
```

### Step 5: 创建 sync agent prompt 模板

`.snow/sync/prompts/sync-constraint.md` — 标准 prompt，填空即可。

---

## 弱模型能力边界

| 能做的                          | 不能做的（需要强模型）          |
| ------------------------------- | ------------------------------- |
| 加一个 string/number/array 约束 | 新增节点类型（架构变更）        |
| 加一个已知类型的修饰符          | Zod 内部 API 大改（v3→v4 级别） |
| 复制粘贴测试模板                | 跨层兼容性问题（v3/v4 差异）    |
| 填模板参数                      | 设计新 IR 字段语义              |
| 更新 capabilities.yaml          | 判断是否需要新的 IR 节点        |

**判断标准**：如果改动是“加一个 case”，弱模型做。如果是“设计新概念”，人工或强模型做。

---

## 实施优先级

1. ✅ **P0**: 创建 `capabilities.yaml` + `templates/`（一次性工作）
2. **P1**: 编写 `zod-diff.sh` 检测脚本
3. **P1**: 编写 Phase 1 规则匹配脚本
4. **P2**: 创建 Claude Code custom slash command `/sync-zod <from> <to>`
5. **P3**: 集成到 CI（定期检测 + 自动创建 PR）

---

## 示例：完整的同步流程

```bash
# 1. 检测
$ ./scripts/zod-diff.sh 3.22.0 3.23.0
✅ delta.json generated: 2 new constraints, 0 new types

# 2. 分析 + 生成计划
$ ./scripts/sync-plan.sh delta.json
✅ sync-plan.md generated
   Files to modify: 2 (runtime.ts, validate_primitive.go)
   Templates: go-constraint-string.txt, ts-constraint-string.txt

# 3. 生成 patch (弱模型 fill-in)
$ snow sync:execute sync-plan.md --model ds-v4-flash
✅ Generated patch: .snow/sync/patches/zod-3.23.0.patch
   runtime.ts: +2 lines
   validate_primitive.go: +12 lines (+ emoji validator)
   validate_test.go: +8 lines

# 4. 验证
$ git apply .snow/sync/patches/zod-3.23.0.patch
$ cd pkgs/go && go build ./... && go test ./...
✅ All tests pass

# 5. 更新 capabilities + 提交
$ ./scripts/update-capabilities.sh
$ git add -A && git commit -m "sync: Zod 3.23.0 — add emoji/nanoid string constraints"
```
