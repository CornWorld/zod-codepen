# VitePress 文档更新

## Phases

### Phase A: 架构图更新 (introduction.md × 2)

- `docs/guide/introduction.md`
- `docs/en/guide/introduction.md`
- 改动: 架构图从 "Built-in Handlers" 更新为 IR 管道

### Phase B: custom-handlers.md 重写

- `docs/guide/custom-handlers.md`
- 改动: 从 SchemaHandler 扩展模式迁移到 IR 层级扩展说明

### Phase C: create-serializer.md 重写

- `docs/api/create-serializer.md`
- 改动: 从 registerHandler 返回值迁移到 IR API 说明

### Phase D: vite-plugin.md 补充静态提取

- `docs/guide/vite-plugin.md`
- `docs/api/vite-plugin.md`
- 改动: 添加 zodDecouplingStatic 文档

### Phase E: index.md 特性更新

- `docs/index.md`
- 改动: 更新特性列表，添加静态提取

### Phase F: 构建验证

- `pnpm docs:build` 通过
