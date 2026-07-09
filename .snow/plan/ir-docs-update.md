# IR 改造后文档更新

## Context

IR 改造（中间表示 + 双 cast 路径 + codegen）已完成并且 401 测试全绿。但项目文档（CLAUDE.md 系列）仍然描述的是改造前的旧架构 — 引用已过时的 `builtinHandlers` 模式、错误的文件行数和测试覆盖信息。需要同步更新。

## Analysis

**已是最新**：

- `docs/guide/static-extraction.md` ✅
- `docs/api/cast-from-ast.md` ✅
- VitePress sidebar 配置 ✅

**需要更新**：

| 文件                          | 问题                                                                                                                                        |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `CLAUDE.md`                   | 架构图仍是 builtinHandlers 模式，没有 IR；core 测试写"无"实际 129 个；vite-plugin 测试写"无"实际 64 个；serializer.ts 行数写 ~1100 实际 142 |
| `pkgs/core/CLAUDE.md`         | 同上 + 缺少 castFromAst/codegen/ModuleResolver 等新 API；文件清单过时                                                                       |
| `pkgs/vite-plugin/CLAUDE.md`  | 缺少 zodDecouplingStatic/generateSchemasFromSource；测试信息错误                                                                            |
| `pkgs/core/src/ir/nodes.ts:7` | JSDoc 注释过时：说 castFromAst 是 "future work" 但已实现                                                                                    |

## Phases

### Phase 1: 修复源码注释

- **文件**: `pkgs/core/src/ir/nodes.ts`
- **改动**: 第 7 行 JSDoc 改 `castFromAst(): static AST source -> IR (future work)` → `castFromAst(): static AST source -> IR`
- **Done when**: 构建通过

### Phase 2: 更新根级 CLAUDE.md

- **文件**: `CLAUDE.md`
- **改动**: 更新架构部分、数据流图、测试统计、文件行数、添加 IR 架构说明
- **Done when**: 内容反映当前实际架构

### Phase 3: 更新 pkgs/core/CLAUDE.md

- **文件**: `pkgs/core/CLAUDE.md`
- **改动**: 更新模块职责（IR 管道）、API 导出、测试统计、文件清单
- **Done when**: 内容反映当前实际架构

### Phase 4: 更新 pkgs/vite-plugin/CLAUDE.md

- **文件**: `pkgs/vite-plugin/CLAUDE.md`
- **改动**: 添加 zodDecouplingStatic 导出，修正测试信息，添加静态提取模式说明
- **Done when**: 内容完整体现插件功能

### Phase 5: 构建验证

- `pnpm build` 通过
- `pnpm test` 全绿
