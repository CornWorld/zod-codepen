# Go 原生 Zod Schema 校验器（替代 Goja JS VM）

## Context

Primo CMS 后端目前通过 `//go:embed` 嵌入 Vite 编译的 CJS Zod 校验库，每次 PocketBase 写入事件都启动一个 Goja JS 虚拟机执行 `Zod.parse()` 校验，单次耗时 1–5ms。

Issue #7 的 TS 端工作已完成：`@zod-codepen/core` 可将 Zod schema 序列化为 JSON AST（`schemasToJson()`），`@zod-codepen/vite-plugin` 的 `generateSchemasFromSource({ outputFormat: "json" })` 可在构建期导出 `.json` 文件。JSON AST 格式规范见 `docs/api/json-ast.md`，当前版本 1。

**本计划范围**: 实现 Go 原生校验器，读取 TS 端导出的 JSON AST，在 Go 中执行等价于 `Zod.parse()` 的校验。不涉及 TS 端改动，不实现序列化/cast/codegen，纯消费端。

**核心定位**: 这个 Go 库**替代 Zod 的校验作用**，而非重新实现 zod-codepen 的核心序列化能力。数据流：

```
TS: Zod Schema → cast → IRNode → irToJson → JSON AST file (.json)
                                                          ↓
Go: JSON AST file → parse → IRNode tree → validate(input) → result
```

**Primo CMS 实际使用的 Zod 子集**（约 13 种，优先实现）：

- 基础结构：`z.object()`, `z.string()`, `z.number()`, `z.literal()`, `z.discriminatedUnion()`, `z.any()`
- 修饰符：`.optional()`, `.nullable()`, `.nonempty()`
- 联合：`z.string().or(z.file())`（`z.union()`）
- 不含 `.transform()`, `.superRefine()`, `.preprocess()`（Go 端对这些返回 "unsupported" 错误）

## Analysis

### 输入格式

JSON AST 顶层结构：

```json
{
  "version": 1,
  "schemas": {
    "Page": { "kind": "object", "fields": [...], "unknownMode": "strip" },
    "Block": { "kind": "union", "options": [...], "discriminator": "type" }
  }
}
```

21 种节点 `kind`（按优先级分层）：

**P0 — Primo 子集（必须实现）**:

- `primitive` (string/number/boolean/null/undefined/any/unknown/never/void + constraints)
- `object` (fields + unknownMode strip/strict/passthrough + catchall)
- `enum` (values + 可选 discriminator/options)
- `literal` (value + 特殊编码)
- `union` (options + 可选 discriminator)
- `modified` (inner + modifiers: optional/nullable/nullish/default)
- `array` (element + constraints: min/max/length/nonempty)
- `constraint` (target/name/params — 作为 primitive/array/set 的子结构)
- `modifier` (name/value — 作为 modified 的子结构)

**P1 — 完整覆盖（应该实现）**:

- `tuple` (items + rest)
- `record` (key + value)
- `map` (key + value)
- `set` (element + constraints)
- `intersection` (left + right)
- `bigint` primitive + `_bigint` 编码
- `date` primitive
- `symbol` primitive
- `nan` primitive
- coerce flag 处理

**P2 — 跳过/降级（返回明确错误）**:

- `transform`, `refine`, `preprocess` — 包含 JS 函数，Go 无法执行
- `pipe` — 管道中的 transform 无法执行
- `zod-function` — 函数签名校验在 Go 中无意义
- `lazy` — 循环引用占位符
- `promise` — 异步校验
- `fallback`, `raw` — 序列化失败的标记
- `function` 子节点

### 特殊编码处理

| 编码           | 格式                          | Go 处理                                   |
| -------------- | ----------------------------- | ----------------------------------------- |
| `_bigint`      | `{"_bigint":"123"}`           | `math/big.Int` 解析                       |
| `_regex`       | `{"_regex":"/^[a-z]+$/i"}`    | `regexp.Compile`，需解析 `/pattern/flags` |
| `_nan`         | `{"_nan":true}`               | `math.NaN()`                              |
| `_infinity`    | `{"_infinity":1\|-1}`         | `math.Inf(±1)`                            |
| `_unsupported` | `{"_unsupported":"function"}` | 返回校验错误                              |

### Constraint 校验逻辑

| target | name                    | params                    | Go 校验                       |
| ------ | ----------------------- | ------------------------- | ----------------------------- |
| string | min                     | value                     | `len(s) >= value`             |
| string | max                     | value                     | `len(s) <= value`             |
| string | length                  | value                     | `len(s) == value`             |
| string | email                   | —                         | 正则匹配                      |
| string | url                     | —                         | `net/url.Parse`               |
| string | uuid                    | —                         | 正则匹配                      |
| string | regex                   | regex                     | `re.MatchString`              |
| string | includes                | value                     | `strings.Contains`            |
| string | startsWith              | value                     | `strings.HasPrefix`           |
| string | endsWith                | value                     | `strings.HasSuffix`           |
| string | trim                    | —                         | 校验前 trim（非校验，预处理） |
| string | toLowerCase             | —                         | 同上                          |
| string | toUpperCase             | —                         | 同上                          |
| number | min                     | value/inclusive           | `>=` 或 `>`                   |
| number | max                     | value/inclusive           | `<=` 或 `<`                   |
| number | int                     | —                         | `v == float64(int64(v))`      |
| number | finite                  | —                         | `!math.IsInf`                 |
| number | positive                | —                         | `> 0`                         |
| number | negative                | —                         | `< 0`                         |
| number | nonnegative             | —                         | `>= 0`                        |
| number | nonpositive             | —                         | `<= 0`                        |
| number | multipleOf              | value                     | `v % value == 0`              |
| array  | min                     | value                     | `len >= value`                |
| array  | max                     | value                     | `len <= value`                |
| array  | length                  | value                     | `len == value`                |
| array  | nonempty                | —                         | `len > 0`                     |
| set    | min/max/length/nonempty | —                         | 同 array                      |
| date   | min/max                 | value(inclusive)          | 时间比较                      |
| bigint | min/max                 | minimum/maximum(\_bigint) | big.Int 比较                  |

### 受影响文件 / 目录结构

**新增 Go 模块**: `pkgs/go/`（独立 Go module，不干扰 TS monorepo）

```
pkgs/go/
├── go.mod                        # module github.com/CornWorld/zod-codepen/pkgs/go
├── go.sum
├── README.md
├── CLAUDE.md
├── ast.go                        # JSON AST Go 结构体定义（21 种节点）
├── ast_test.go                   # AST 结构体反序列化测试
├── decode.go                     # JSON → AST 结构体（含特殊编码解码）
├── decode_test.go
├── validate.go                   # AST → 校验器（核心：递归校验入口）
├── validate_test.go
├── validate_primitive.go         # 各 primitive 类型的校验逻辑
├── validate_primitive_test.go
├── validate_constraints.go       # constraint 校验逻辑（min/max/email/url/regex/...）
├── validate_constraints_test.go
├── validate_composite.go         # object/array/tuple/union/intersection/record/map/set
├── validate_composite_test.go
├── validate_modified.go          # modifier 处理（optional/nullable/default/...）
├── validate_modified_test.go
├── errors.go                     # 校验错误类型定义（对齐 ZodError 的层次结构）
├── errors_test.go
├── examples/
│   └── primo/
│       ├── schemas.json          # 从 TS 端导出的示例 JSON AST
│       └── main.go               # 使用示例
└── testdata/
    ├── primitives.json           # 测试用 JSON AST fixtures
    ├── objects.json
    ├── unions.json
    ├── modified.json
    └── primo-sample.json         # 从 vite-plugin fixture 导出
```

### 复杂度与风险评估

- **复杂度**: medium-high（Go 结构体定义 + 递归校验器 + constraint 全覆盖，但输入格式已由 TS 端完全确定，不需要猜格式）
- **风险区域**:
  - `any`/`unknown`/`never` 的语义：`any` 接受一切，`unknown` 接受一切但不可直接使用，`never` 拒绝一切
  - `discriminatedUnion` 的 discriminator 路由逻辑：需要先读 discriminator 字段再路由到对应 option
  - `intersection` 的合并校验：两个 object schema 都要通过，而非合并后再校验
  - `object.unknownMode` 的三种模式：strip 需要移除未知字段（Go 中需要构建新 map），strict 需要拒绝，passthrough 需要保留
  - `coerce` 行为：`z.coerce.string()` 在 Zod 中会先 `String(x)` 再校验，Go 需要做类型转换
  - modifier 链的顺序：`optional().default(x)` vs `default(x).optional()` 语义不同
  - number 精度：JS number 是 float64，Go 也是 float64，但 int 检查需要注意

## Phases

### Phase 1: Go 项目骨架 + AST 类型定义 + JSON 解析

- **目标**: 创建 Go module，定义全部 21 种 JSON AST 节点的 Go 结构体，实现 JSON 反序列化（含特殊编码解码）
- **文件**:
  - `pkgs/go/go.mod`（初始化 module）
  - `pkgs/go/ast.go`（IRNode 接口 + 21 种具体节点结构体）
  - `pkgs/go/decode.go`（自定义 JSON 解码，处理 `kind` 判别 + 特殊编码）
  - `pkgs/go/decode_test.go`（反序列化测试）
  - `pkgs/go/testdata/primitives.json`（手工构造的测试 fixture）
- **步骤**:
  - [ ] `cd pkgs/go && go mod init github.com/CornWorld/zod-codepen/pkgs/go`
  - [ ] 定义 `IRNode` 接口（`Kind() string`）和 21 种节点结构体，字段对齐 `docs/api/json-ast.md`
  - [ ] 定义 `AstDocument` 顶层结构体（`Version int`, `Schemas map[string]IRNode`）
  - [ ] 实现自定义 `json.Unmarshaler`：根据 `kind` 字段路由到对应结构体
  - [ ] 实现特殊编码解码器：`decodeValue()` 处理 `_bigint`/`_regex`/`_nan`/`_infinity`/`_unsupported`
  - [ ] 实现正则表达式解析：从 `"/^[a-z]+$/i"` 提取 pattern 和 flags
  - [ ] 编写测试：对每种节点类型构造 JSON 输入，验证反序列化结果正确
  - [ ] 从 TS 端生成真实 JSON AST fixture（用 vite-plugin 导出 primo-sample）
- **完成标志**:
  - `cd pkgs/go && go test ./...` 全绿
  - 所有 21 种节点 + 特殊编码都能正确反序列化
  - 能解析从 TS 端导出的真实 `.json` 文件

### Phase 2: 核心校验引擎（Primo 子集）

- **目标**: 实现 P0 优先级的校验逻辑，覆盖 Primo CMS 使用的全部 Zod 子集
- **文件**:
  - `pkgs/go/validate.go`（`Validate(node IRNode, input any) error` 入口 + 递归路由）
  - `pkgs/go/validate_primitive.go`（string/number/boolean/null/undefined/any/unknown/never/void）
  - `pkgs/go/validate_constraints.go`（string/number/array 的 constraint 校验）
  - `pkgs/go/validate_composite.go`（object/array/union/discriminatedUnion/literal/enum）
  - `pkgs/go/validate_modified.go`（optional/nullable/nullish/default 修饰符处理）
  - `pkgs/go/errors.go`（ValidationError 类型，含路径、期望/实际类型信息）
  - 对应的 `_test.go` 文件（每个文件配套测试）
  - `pkgs/go/testdata/` 新增 objects.json / unions.json / modified.json
- **步骤**:
  - [ ] 定义 `ValidationError` 结构体（Path []string, Expected string, Received string, Message string）
  - [ ] 定义 `ValidateSchema(doc *AstDocument, name string, input any) error` 顶层入口
  - [ ] 实现 `validate(node IRNode, path []string, input any) error` 递归调度器
  - [ ] primitive 校验：
    - string: 类型断言为 string
    - number: 类型断言为 float64（JSON number）
    - boolean: 类型断言为 bool
    - null: 检查为 nil
    - any/unknown: 始终通过
    - never: 始终失败
    - undefined/void: 检查为 nil 或不存在
  - [ ] constraint 校验（P0 子集）：
    - string: min/max/length/email/url/uuid/regex/nonempty
    - number: min/max/int/positive/negative/nonnegative/nonpositive/finite/multipleOf
    - array: min/max/length/nonempty
  - [ ] object 校验：
    - 遍历 fields，递归校验每个字段值
    - unknownMode: strip（移除未知键）/ strict（未知键报错）/ passthrough（保留）
    - 可选 catchall schema 校验未知键
  - [ ] array 校验：
    - 断言为 []any（JSON array）
    - 递归校验每个元素
    - 应用 constraints
  - [ ] literal 校验：
    - 深度比较 input == literal.value
    - 处理特殊编码的 literal（bigint/regex）
  - [ ] enum 校验：
    - 检查 input 是否在 values 列表中
  - [ ] union 校验：
    - 无 discriminator：尝试每个 option，第一个通过即返回
    - 有 discriminator：读 input[discriminator]，路由到匹配的 option
  - [ ] modified 校验：
    - optional: nil → 通过
    - nullable: nil → 通过
    - nullish: nil 或 undefined → 通过
    - default: nil → 使用默认值继续校验
    - 按顺序应用 modifier 链
  - [ ] 编写全覆盖测试（valid + invalid 场景各一组）
- **完成标志**:
  - `cd pkgs/go && go test ./...` 全绿
  - 能正确校验 Primo CMS 的全部 schema（Page, Block, StringOrNumber, TagList, DefaultTheme）
  - 错误信息包含完整的 JSON path

### Phase 3: 完整覆盖（P1 节点类型）+ 交叉验证

- **目标**: 实现 P1 优先级的全部节点类型，用 TS 端测试数据做交叉验证
- **文件**:
  - 更新 `pkgs/go/validate_composite.go`（新增 tuple/record/map/set/intersection）
  - 更新 `pkgs/go/validate_primitive.go`（新增 bigint/date/symbol/nan + coerce）
  - 更新 `pkgs/go/validate_constraints.go`（新增 set/date/bigint constraints）
  - 更新 `pkgs/go/validate_modified.go`（新增 catch/brand/readonly/prefault）
  - 对应测试文件
  - `pkgs/go/testdata/full-coverage.json`（从 TS 端 ir-json.test.ts 的测试用例导出）
- **步骤**:
  - [ ] tuple 校验：按位置校验每个 item，rest 类型校验剩余元素
  - [ ] record 校验：遍历 map 的每个 key-value，用 key schema 校验 key，value schema 校验 value
  - [ ] map 校验：类似 record，但 Go 中用 `map[any]any` 表达
  - [ ] set 校验：断言为 array（JSON 无 set），检查元素唯一性，递归校验元素
  - [ ] intersection 校验：left 和 right schema 都要通过
  - [ ] bigint primitive：解析 `_bigint` 编码，类型断言
  - [ ] date primitive：解析 ISO 8601 字符串或 timestamp number
  - [ ] coerce 处理：`z.coerce.string()` 时先做 `fmt.Sprint(input)` 转换
  - [ ] 交叉验证：从 TS 端导出 ir-json.test.ts 中的全部测试 IR 到 JSON，在 Go 端反序列化并验证结构
  - [ ] 不支持的节点（transform/refine/preprocess/pipe/zod-function/lazy/promise）返回明确的 `ErrUnsupportedSchema`
- **完成标志**:
  - `cd pkgs/go && go test ./...` 全绿
  - 从 TS 端导出的任意 JSON AST 都能在 Go 中正确解析
  - 21 种节点类型全部有测试覆盖（P0/P1 校验逻辑完整，P2 返回明确错误）

### Phase 4: 使用示例 + 文档 + CLAUDE.md

- **目标**: 提供 Primo CMS 集成示例，编写文档
- **文件**:
  - `pkgs/go/examples/primo/main.go`（完整使用示例）
  - `pkgs/go/examples/primo/schemas.json`（从 TS fixture 导出）
  - `pkgs/go/README.md`（快速开始 + API 文档）
  - `pkgs/go/CLAUDE.md`（AI 辅助开发文档）
  - `pkgs/go/testdata/primo-sample.json`（最终版 fixture）
- **步骤**:
  - [ ] 编写 `examples/primo/main.go`：
    - 加载 schemas.json
    - 构造合法/非法的页面数据
    - 执行校验
    - 打印结果
  - [ ] 从 vite-plugin 的 primo-sample.ts 导出 JSON AST 到 examples/primo/schemas.json
  - [ ] 编写 README.md：安装、快速开始、支持类型表、API 参考
  - [ ] 编写 CLAUDE.md：架构说明、文件索引、开发命令
  - [ ] 更新根级 `CLAUDE.md` 模块索引，添加 Go 模块条目
  - [ ] `go vet ./...` 和 `gofmt -l .` 无问题
- **完成标志**:
  - `cd pkgs/go && go build ./...` 通过
  - `cd pkgs/go && go test ./...` 全绿
  - `go vet` 无警告
  - 示例代码可运行：`cd pkgs/go/examples/primo && go run main.go`
  - 文档完整

## Risks & Mitigations

| Risk                                                       | Impact | Mitigation                                                                     |
| ---------------------------------------------------------- | ------ | ------------------------------------------------------------------------------ |
| JSON AST 格式未来演进（version 升级）                      | 中     | 解析时检查 `version` 字段，未知版本返回明确错误                                |
| Go 与 JS 类型系统差异（如 number 精度、undefined vs null） | 中     | 明确文档化 Go 端的类型映射规则；undefined 在 JSON 中不存在，null 映射为 Go nil |
| discriminatedUnion 的 discriminator 路由错误               | 中     | 充分测试，覆盖 discriminator 缺失/值不匹配/多 option 匹配场景                  |
| intersection 合并语义与 Zod 运行时不一致                   | 低     | 逐 schema 独立校验策略（而非合并 schema），与 Zod 行为一致                     |
| TS 端 JSON 格式变更导致 Go 端解析失败                      | 低     | version 字段防护 + TS 端 448 测试保护格式稳定性                                |
| Go module 与 TS monorepo 工具链冲突                        | 低     | Go module 完全独立（pkgs/go/ 有自己的 go.mod），pnpm 不感知                    |

## Rollback Strategy

- Go 模块完全独立于 TS monorepo（独立 `go.mod`，无 npm 依赖关系）
- 直接删除 `pkgs/go/` 目录不影响任何 TS 测试或构建
- 根级 `CLAUDE.md` 的新增条目可单独移除
- 不修改任何 TS 端代码

## 设计决策

### 为什么不做序列化/cast？

Go 版本的定位是**消费端**——替代 Zod 的 `parse()` 校验功能。序列化（Zod schema → JSON AST）由 TS 端的 zod-codepen 完成。Go 端只读取 JSON AST 文件并执行校验。这与 Issue #7 的设计一致：TS 端在构建期导出，Go 端在运行期校验。

### 为什么用自定义 UnmarshalJSON 而非 codegen？

21 种节点类型 + 特殊编码处理，手写 `UnmarshalJSON` 比引入 codegen 工具链更简单直接，且 Go 的 `encoding/json` 原生支持自定义解码器。

### 校验输入类型为什么是 `any`？

JSON 反序列化后 Go 中的类型是 `map[string]any` / `[]any` / `string` / `float64` / `bool` / `nil`。`any` 入参直接接受这些类型，无需引入额外抽象。

## Completion Summary

**Status**: Completed
**Phases**: 4 / 4

### Results

**Phase 1: Go 项目骨架 + AST 类型定义 + JSON 解析** ✅

- 创建独立 Go module `pkgs/go/`（`github.com/CornWorld/zod-codepen/pkgs/go`）
- 定义全部 21 种 AST 节点的 Go 结构体（`ast.go`，~390 行）
- 实现特殊编码解码器（`specialvalue.go`，~170 行）：bigint / regex / nan / infinity / unsupported
- 实现自定义 JSON 解码（`decode.go`，~420 行）：kind 路由 + 递归解析子节点
- 43 个解码测试，全部通过

**Phase 2: 核心校验引擎** ✅

- 实现 primitive 校验（13 种 primitive 全覆盖）：string/number/bigint/boolean/date/null/undefined/void/any/unknown/never/nan/symbol
- 实现 constraint 校验：string (min/max/length/email/url/uuid/regex/startsWith/endsWith/includes/nonempty/cuid/datetime/ip) + number (min/max/int/finite/positive/negative/nonnegative/nonpositive/multipleOf/safe) + array/set (min/max/length/nonempty)
- 实现 composite 校验：object (strip/strict/passthrough + catchall) / array / literal / enum / union / discriminatedUnion
- 实现 modified 校验：optional / nullable / nullish / default / catch / prefault / brand / readonly
- 51 个校验测试，全部通过

**Phase 3: 完整覆盖 P1 + 交叉验证** ✅

- 实现 tuple / record / map / set (含唯一性检查) / intersection / lazy / promise / pipe
- 实现 coerce 处理：z.coerce.string() / number() / boolean() / bigint()
- 从 TS 端 vite-plugin 导出真实 JSON AST 作为 Go 测试 fixture，交叉验证通过
- P2 节点（transform/refine/preprocess）返回明确 `unsupported` 错误

**Phase 4: 使用示例 + 文档** ✅

- 创建 `examples/primo/main.go` — 完整的 Primo CMS 使用示例
- 从 vite-plugin 的 primo-sample.ts 导出真实 schemas.json
- 示例运行通过，展示有效/无效校验 + discriminated union + literal + JSON 输入
- 编写 README.md（API 文档 + 支持类型表）
- 编写 CLAUDE.md（架构说明 + 文件索引）

### Deviations

- Phase 2 和 Phase 3 合并执行：P1 类型（tuple/record/map/set/intersection）与 P0 类型在同一轮实现中完成，因为校验器架构支持递归分发，添加新节点类型只需注册 case
- 未创建单独的 `validate_primitive_test.go` 等分文件测试，所有校验测试集中在 `validate_test.go`（786 行），更便于阅读
- date constraint（min/max）暂未实现时间比较，标记为 `unsupported_constraint`

### Verification

- [x] `go build ./...` 通过
- [x] `go vet ./...` 无警告
- [x] `gofmt -l .` 无输出（格式正确）
- [x] `go test ./...` 全绿（94 个测试）
- [x] `go run examples/primo/main.go` 正常运行
- [x] `pnpm build` TS 端不受影响

### Follow-up (if any)

- **Primo CMS 集成**：在 Primo 分支替换 `validation.go`，对比 Goja vs 原生 Go 性能
- **向上游提交 PR**：整理代码向 Primo CMS 提交 PR
- **date constraint 完善**：实现 ISO 8601 时间比较（当前标记为 unsupported）
- **更多 string constraint**：如 `cuid2`、`datetime` 更精确验证、`ip` v4/v6 区分
