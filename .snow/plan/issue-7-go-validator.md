# Issue #7: 为 Primo CMS 提供 JSON AST 导出能力（TS 端先行）

## Context

**GitHub Issue**: https://github.com/CornWorld/zod-codepen/issues/7

Primo CMS 后端目前通过 `//go:embed` 嵌入一个 Vite 编译的 CJS Zod 校验库，每次 PocketBase 写入事件都启动一个 Goja JS 虚拟机执行 `Zod.parse()` 校验，单次耗时 1–5ms。Issue 要求借助 zod-codepen 的静态提取能力，将 Zod schema 在构建期序列化为 JSON AST 描述文件，供后端原生校验器使用。

**本阶段范围**: 仅实现 TS 端的 JSON AST 序列化与导出能力（Issue 步骤一：验证 Schema 导出兼容性）。Go 原生校验器（步骤二/三/四）作为后续独立工作。

**前提确认：公共 IR 提取工作已完成且稳定** ✅

- IR 架构重构已完全合并（commit `ec9002c`~`6e2df42`）
- 401 个测试全绿（core 129 / z3 155 / z4 53+4 skipped / vite-plugin 64）
- 21 种 IR 节点类型定义在 `pkgs/core/src/ir/nodes.ts`
- 双 cast 路径均工作：`castFromZod()`（运行时）+ `castFromAst()`（静态 AST）
- vite-plugin 已有 `generateSchemasFromSource()` 静态提取，但**只输出 TS 代码字符串**，不支持 JSON AST 输出 —— 这是本阶段要补齐的关键缺口

**Primo CMS 实际使用的 Zod 子集**（约 13 种）：
基础结构：`z.object()`, `z.string()`, `z.number()`, `z.literal()`, `z.discriminatedUnion()`, `z.any()`
修饰符：`.optional()`, `.nullable()`, `.nonempty()`
联合：`z.string().or(z.file())`
**不含** `.transform()`, `.superRefine()`, `.preprocess()`, 复杂动态正则

## Analysis

### 现状分析

- **现有 IR 是纯数据接口**（`readonly kind` 判别式联合），天然可 JSON 序列化，但 IRNode 中的 `RegExp` 类型（`ConstraintParams.regex`）和 `bigint` 类型在 JSON 中需要特殊处理
- **现有 codegen** 只做 IR → TS 代码字符串，没有 IR → JSON 的输出路径
- **现有 vite-plugin `generateSchemasFromSource()`** 只输出 `.ts` 文件，需要新增 JSON AST 输出模式
- 现有 5 个 IR 相关源文件：`nodes.ts` (21 种类型定义) / `printer/codegen.ts` (577 行 IR→TS) / `cast/runtime.ts` / `cast/ast.ts` / `extract/` 跨文件解析

### 受影响文件

- **修改** `pkgs/core/src/ir/json.ts`（新增）— IR → JSON AST 序列化器
- **修改** `pkgs/core/src/index.ts` — 导出新增的 JSON 序列化函数
- **修改** `pkgs/vite-plugin/src/index.ts` — `generateSchemasFromSource` 增加 JSON 输出模式
- **修改** `pkgs/vite-plugin/test/static-extraction.test.ts` — 增加 JSON 输出路径测试
- **新增** `docs/api/json-ast.md` — JSON AST 格式规范文档

### 复杂度与风险评估

- **复杂度**：medium（在现有 IR 数据接口上增加一条序列化路径，不涉及 cast 层或 codegen 层）
- **风险区域**：
  - IR 节点中 `bigint` / `RegExp` 的 JSON 可序列化性
  - JSON AST schema 格式设计需前瞻稳定（将来 Go 端反射解析依赖此格式）
  - `discriminatedUnion` 的 discriminator + options 嵌套结构在 JSON 中要保留完整信息
  - `LiteralNode.value` 可能是任意 JS 值（undefined/function/symbol 等），需明确编码规则

## Phases

### Phase 1: 设计 JSON AST 格式规范 + core 序列化器

- **目标**: 设计稳定的 JSON AST 格式规范并实现 core 包的 `irToJson()` 序列化器
- **文件**:
  - `docs/api/json-ast.md`（新增规范文档）
  - `pkgs/core/src/ir/json.ts`（新增序列化器）
  - `pkgs/core/src/index.ts`（导出新 API）
  - `pkgs/core/test/ir-json.test.ts`（新增单元测试）
- **步骤**:
  - [ ] 设计顶层文件结构：`{"version":1,"schemas":{"User":{...},"Login":{...}}}`
  - [ ] 设计 21 种 IR 节点类型到 JSON 的映射规则
  - [ ] 处理不可直接 JSON 序列化的字段：
    - `bigint` → `{"_bigint":"123"}` 标记编码
    - `RegExp` → `{"_regex":"/pattern/flags"}` 字符串编码
    - `undefined` → 字段缺失（不输出）
    - `LiteralNode.value` 中的 function/symbol → `{"_unsupported":"<reason>"}` 标记
  - [ ] 明确 `null` / `undefined` 在 modifier 中的表达（`optional`/`nullable`/`nullish` 用 modifier name 表示，不依赖 value 字段）
  - [ ] 实现 `irToJson(node: IRNode): unknown` 递归序列化器
  - [ ] 实现 `schemasToJson(results: {name: string; ir: IRNode}[]): { version: number; schemas: Record<string, unknown> }` 顶层封装
  - [ ] 导出 `irToJson`, `schemasToJson`, `AstJsonVersion` 类型
  - [ ] 单元测试：构造涵盖 13 种 Primo 使用场景的 IR，验证输出 JSON 结构
- **完成标志**:
  - `pnpm test:core` 全绿（现有 129 + 新增测试）
  - `pnpm build` 通过
  - JSON 输出结构可通过 `JSON.stringify` 往返不丢信息

### Phase 2: vite-plugin 增加 JSON 输出模式 + 文档

- **目标**: 在 vite-plugin 的 `generateSchemasFromSource` 中增加 `outputFormat` 选项支持 JSON 输出
- **文件**:
  - `pkgs/vite-plugin/src/index.ts`（`GenerateFromSourceOptions` 增加选项 + 实现分支）
  - `pkgs/vite-plugin/test/static-extraction.test.ts`（增加 JSON 输出测试用例）
  - `pkgs/vite-plugin/test/fixtures/static-extraction/src/primo-sample.ts`（新增 Primo 风格的 fixture）
- **步骤**:
  - [ ] 在 `GenerateFromSourceOptions` 中增加 `outputFormat?: "ts" | "json"`（默认 `"ts"` 保持向后兼容）
  - [ ] 在 `generateSchemasFromSource` 中增加分支：当 `outputFormat === "json"` 时用 `schemasToJson(results)` 生成 JSON 并写入 outputPath
  - [ ] 同时导出 core 的 `irToJson`, `schemasToJson` 供 Go 工具链或其他下游使用
  - [ ] 增加 fixture `primo-sample.ts`（模仿 Primo cms 页面 schema：含 object、string、number、literal、discriminatedUnion、optional、nullable、nonempty、union）
  - [ ] 增加 vitest 测试用例：
    - 验证 `outputFormat: "json"` 生成的是合法 JSON（`JSON.parse` 不报错）
    - 验证 JSON 包含正确 schema 名（User, Login 等）
    - 验证 `outputFormat` 默认仍输出 TS 代码字符串（向后兼容）
  - [ ] 完善 `docs/api/json-ast.md`，补充 vite-plugin 使用示例
- **完成标志**:
  - `pnpm --filter @zod-codepen/vite-plugin test` 全绿（现有 64 + 新增测试）
  - `pnpm build` 通过
  - `pnpm test` 全仓绿
  - 文档完整描述 JSON AST 格式与使用方法

## Risks & Mitigations

| Risk                                                      | Impact | Mitigation                                                              |
| --------------------------------------------------------- | ------ | ----------------------------------------------------------------------- |
| IR 节点中 `bigint`/`RegExp` 在 JSON 中信息丢失            | 中     | Phase 1 即定义特殊编码 (`_bigint`/`_regex` 字符串)，写入 + 解析两端协调 |
| `LiteralNode.value` 可能是不可序列化值（function/symbol） | 中     | 用 `_unsupported` 字段标记，序列化不报错，解析端可识别降级              |
| JSON 格式后续被 Go 端使用时发现不够表达                   | 低     | 21 种 IR 节点已完整映射，格式带 `version` 字段便于演进                  |
| TS 现有测试被新 API 破坏                                  | 低     | 新增序列化路径与现有 codegen 完全正交，不改 nodes.ts 中的接口定义       |
| 向后兼容：现有 `generateSchemasFromSource` 用户           | 低     | `outputFormat` 默认 `"ts"`，不传时行为完全不变                          |

## Rollback Strategy

- 新增的 `pkgs/core/src/ir/json.ts` 与现有 codegen 完全解耦，可单独删除不影响 401 测试
- `pkgs/vite-plugin/src/index.ts` 的 `outputFormat` 选项默认 `"ts"`，不传时行为不变
- 新增的测试文件和 fixture 可独立删除
- `docs/api/json-ast.md` 可独立删除

## Completion Summary

**Status**: Completed
**Phases**: 2 / 2

### Results

**Phase 1: JSON AST 格式规范 + core 序列化器** ✅

- 新增 `docs/api/json-ast.md` — 完整的 JSON AST 格式规范文档（21 种节点类型 + 特殊编码规则）
- 新增 `pkgs/core/src/ir/json.ts` (449 行) — `irToJson()`, `schemasToJson()`, `AST_JSON_VERSION`, `AstJsonDocument`
  - 处理 bigint → `{"_bigint":"..."}` 编码
  - 处理 RegExp → `{"_regex":"/pattern/flags"}` 编码
  - 处理 undefined → 字段缺失，function/symbol → `{"_unsupported":"..."}`
- 更新 `pkgs/core/src/index.ts` — 导出 `irToJson`, `schemasToJson`, `AST_JSON_VERSION`, `AstJsonDocument`
- 新增 `pkgs/core/test/ir-json.test.ts` — 44 个单元测试（全部 21 种节点 + 特殊编码 + 往返验证）

**Phase 2: vite-plugin JSON 输出模式 + 文档** ✅

- 更新 `pkgs/vite-plugin/src/index.ts`:
  - `GenerateFromSourceOptions` 增加 `outputFormat?: "ts" | "json"`（默认 `"ts"` 保持向后兼容）
  - `generateSchemasFromSource` 增加早期返回分支：当 `outputFormat === "json"` 时调用 `schemasToJson` 并写入 JSON 文件
  - 从 vite-plugin re-export `schemasToJson`, `irToJson`, `AstJsonDocument` 供下游使用
- 新增 `pkgs/vite-plugin/test/fixtures/static-extraction/src/primo-sample.ts` — 模仿 Primo CMS 的 schema fixture（含 object, discriminatedUnion, union, literal, array, enum）
- 更新 `pkgs/vite-plugin/test/static-extraction.test.ts` — 新增 3 个测试用例（JSON 合法性、向后兼容、Primo 风格 fixture）
- 更新 `docs/api/json-ast.md` — 补充 vite-plugin 使用示例

### Deviations

无偏离。实现严格按计划进行。

### Verification

- [x] `pnpm test` 全绿（现有 401 + 新增 47 = 448 测试）
- [x] `pnpm build` 通过（5 个 workspace 项目全编译成功）
- [x] `docs/api/json-ast.md` 完整描述格式规范 + 使用示例

### Follow-up (if any)

- **Go 原生校验器开发**（Issue 步骤二/三/四）: 基于本阶段产出的 JSON AST 格式，在 `pkgs/go/` 独立 Go 模块中实现轻量级校验器
- **Primo CMS 集成与 benchmark**（Issue 步骤三）: 在本地 Primo 分支替换 `validation.go`，对比 Goja vs 原生 Go 性能
- **向上游提交 PR**（Issue 步骤四）: 整理代码向 Primo CMS 提交 PR
