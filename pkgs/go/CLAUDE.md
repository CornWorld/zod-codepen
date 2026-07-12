# Go Validator 模块 (pkgs/go)

## 职责

Go 原生 Zod schema 校验器。读取 TS 端导出的 JSON AST 文件，在 Go 中执行等价于 `Zod.parse()` 的校验。不涉及 TS 端改动，不实现序列化/cast/codegen，纯消费端。

## 架构

```
TS: Zod Schema → cast → IRNode → irToJson → JSON AST file (.json)
Go: JSON AST file → parse → IRNode tree → validate(input) → result
```

## 文件结构

| 文件                      | 职责                                                              | 行数 |
| ------------------------- | ----------------------------------------------------------------- | ---- |
| `ast.go`                  | 21 种 AST 节点的 Go 结构体定义                                    | ~390 |
| `specialvalue.go`         | 特殊编码解码（bigint/regex/nan/infinity/unsupported）             | ~170 |
| `decode.go`               | JSON → AST 结构体（自定义 UnmarshalJSON + kind 路由）             | ~420 |
| `validate.go`             | 校验入口 + kind 分发器                                            | ~95  |
| `validate_primitive.go`   | 各 primitive 类型的校验 + coerce 处理                             | ~350 |
| `validate_constraints.go` | constraint 校验逻辑 + 值提取辅助 + 内置验证器（email/url/uuid）   | ~140 |
| `validate_composite.go`   | object/array/tuple/union/intersection/record/map/set/literal/enum | ~300 |
| `validate_modified.go`    | modifier 处理（optional/nullable/default/...）+ lazy/promise/pipe | ~100 |
| `errors.go`               | ValidationError / ValidationResult 类型定义                       | ~90  |
| `examples/primo/`         | 完整使用示例 + 从 vite-plugin 导出的真实 schemas.json             | —    |
| `testdata/`               | JSON AST fixtures（primitives/objects/unions/modified）           | —    |

## 开发命令

```bash
cd pkgs/go
go test ./... -v          # 运行测试
go test ./... -count=1    # 不缓存
go vet ./...              # 静态检查
gofmt -w .                # 格式化
go run examples/primo/main.go  # 运行示例
```

## 关键设计决策

- **纯消费端**：不做序列化，只读 JSON AST 做校验
- **21 种节点全覆盖**：P0/P1 实现完整校验逻辑，P2（transform/refine/preprocess）返回明确 `unsupported` 错误
- **自定义 UnmarshalJSON**：手写而非引入 codegen，更简单直接
- **SpecialValue 类型**：延迟解码特殊编码，只在 `.Any()` 时解析
- **递归校验**：`validate(vc, node, path, input)` 按节点 kind 分发

## 与 TS 端的关系

- TS 端 `schemasToJson()` / `generateSchemasFromSource({outputFormat:"json"})` 导出 JSON
- Go 端 `ParseDocument()` + `ValidateSchema()` 消费 JSON
- JSON AST 格式规范见 `docs/api/json-ast.md`
- version 字段防护：Go 端拒绝未知版本
