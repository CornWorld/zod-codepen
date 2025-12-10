<div align="center">
  <img src="./logo.svg" alt="zod-codepen logo" width="128" height="128" />
  
  <h1>Zod Codepen</h1>
  
  <p>
    <b>立刻 100% 序列化 Zod schema 对象到代码字符串</b>
  </p>

  <p>
    <a href="https://zod-codepen.corn.im">
      <img src="https://img.shields.io/badge/Playground-Live_Demo-3178c6?style=for-the-badge&logo=typescript&logoColor=white" alt="Playground" />
    </a>
  </p>
  
  <p>
    <a href="https://www.npmjs.com/package/@zod-codepen/zod-v3">
      <img src="https://img.shields.io/npm/v/@zod-codepen/zod-v3.svg?style=flat-square&logo=npm&label=zod-v3" alt="zod-v3 version" />
    </a>
    <a href="https://www.npmjs.com/package/@zod-codepen/zod-v4">
      <img src="https://img.shields.io/npm/v/@zod-codepen/zod-v4.svg?style=flat-square&logo=npm&label=zod-v4" alt="zod-v4 version" />
    </a>
    <a href="https://www.npmjs.com/package/@zod-codepen/vite-plugin">
      <img src="https://img.shields.io/npm/v/@zod-codepen/vite-plugin.svg?style=flat-square&logo=npm&label=vite-plugin" alt="vite plugin" />
    </a>
  </p>

  <p>
    <a href="#">简体中文</a> | <a href="./README.md">English</a>
  </p>
</div>

> [!TIP]
> 一个功能完善、可将运行时 Zod schema 对象转换为等效的 TypeScript/JavaScript 代码字符串的工具库。非常适用于调试、代码生成、Schema 可视化和构建开发工具(链)。

## 亮点

- **双版本支持** - 同时支持 Zod v3 和 Zod v4（包括所有 v4 变体，如 zod-mini 和 zod-core）
- **40+ Schema 类型** - 全面覆盖基础类型、复合类型、修饰符和副作用
- **代码优化** - 语义化方法（`.positive()`）和科学记数法（`2**31 - 1`）
- **格式化输出** - 带有可自定义缩进的美化代码
- **模块生成** - 生成包含导出的完整 TypeScript/JavaScript 模块
- **可扩展** - 为特殊 Schema 类型注册自定义处理器
- **零运行时开销** - Tree-shakeable ESM 模块

## 安装

选择与你的 Zod 版本匹配的包：

```bash
# 适用于 Zod v3
npm install @zod-codepen/zod-v3

# 适用于 Zod v4
npm install @zod-codepen/zod-v4
```

## 快速开始

```typescript
import { serialize } from "@zod-codepen/zod-v3"; // 或 @zod-codepen/zod-v4
import { z } from "zod";

// 基础序列化
serialize(z.string());
// → 'z.string()'

// 带约束
serialize(z.string().email().min(5).max(100));
// → 'z.string().email().min(5).max(100)'

// 复杂对象
const UserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  age: z.number().int().min(0).optional(),
  role: z.enum(["admin", "user", "guest"]),
});

serialize(UserSchema);
// → z.object({
//     id: z.string().uuid(),
//     email: z.string().email(),
//     age: z.number().int().nonnegative().optional(),
//     role: z.enum(["admin", "user", "guest"])
//   })

// 代码优化（默认启用）
serialize(z.number().min(0));
// → 'z.number().nonnegative()'

serialize(z.number().max(2147483647));
// → 'z.number().max(2**31 - 1)'
```

## API 参考

### `serialize(schema, options?)`

将单个 Zod schema 序列化为代码字符串。

```typescript
serialize(schema: unknown, options?: SerializeOptions): string
```

**选项：**

- `indent` - 缩进字符串（默认：`'  '`）
- `format` - 启用美化打印（默认：`true`）
- `indentLevel` - 起始缩进级别（默认：`0`）

### `generateModule(schemas, options?)`

生成包含命名 schema 导出的完整 TypeScript 模块。

```typescript
import { generateModule } from "@zod-codepen/zod-v3";

const schemas = {
  User: z.object({ id: z.number(), name: z.string() }),
  Status: z.enum(["active", "inactive"]),
};

generateModule(schemas);
// → import { z } from 'zod';
//
//   export const User = z.object({
//     id: z.number(),
//     name: z.string()
//   });
//
//   export const Status = z.enum(["active", "inactive"]);
```

### `registerHandler(type, handler)`

为 schema 类型注册自定义处理器。

```typescript
import { registerHandler } from "@zod-codepen/zod-v3";

registerHandler("custom", (schema, ctx) => {
  return "z.custom(/* ... */)";
});
```

## 支持的 Schema 类型

| 分类 | 类型 |
| --- | --- |
| **基础类型** | string, number, boolean, bigint, date, undefined, null, void, any, unknown, never, nan, symbol |
| **字面量与枚举** | literal, enum, nativeEnum |
| **包装器** | optional, nullable, nullish, default, catch, readonly, branded |
| **集合** | array, object, record, map, set, tuple |
| **联合类型** | union, discriminatedUnion, intersection |
| **高级** | lazy, promise, function, effects, pipe/pipeline |

### 约束支持

```typescript
// 字符串约束
z.string()
  .min(1)
  .max(100)
  .email()
  .url()
  .uuid()
  .regex(/pattern/);

// 数字约束
z.number().min(0).max(100).int().positive().negative().finite();

// 数组约束
z.array(z.string()).min(1).max(10).nonempty();

// 对象修饰符
z.object({}).strict().passthrough().partial().required();
```

## Zod v3 vs v4 兼容性

本库自动处理 Zod 版本之间的内部结构差异：

| 特性 | v3 | v4 |
| --- | --- | --- |
| 类型检测 | `_def.typeName` | `_zod.def.type` |
| 约束格式 | `checks: [{kind}]` | `checks: [{_zod: {def}}]` |
| 所有 v4 变体 | - | zod, zod/mini, zod/v4, zod/v4/core |

两个适配器生成相同的输出格式，使迁移无缝衔接。

## 包结构

```
zod-codepen/
├── pkgs/
│   ├── core/         # 核心序列化引擎（版本无关）
│   ├── zod-v3/       # Zod v3 适配器
│   └── zod-v4/       # Zod v4 适配器
└── docs/             # VitePress 文档
```

## 使用场景

- **Schema 可视化** - 在开发者工具中显示 Zod schema
- **代码生成** - 从运行时定义生成 schema 文件
- **调试** - 检查复杂的 schema 结构
- **文档** - 自动生成 API 文档
- **迁移工具** - 比较不同版本的 schema
- **测试** - Schema 定义的快照测试

## 文档

访问 [文档站点](https://zod-codepen.corn.im) 获取详细指南和 API 参考。

- [快速开始](https://zod-codepen.corn.im/guide/getting-started)
- [API 参考](https://zod-codepen.corn.im/api/)
- [v3/v4 迁移指南](https://zod-codepen.corn.im/guide/migration)
- [自定义处理器](https://zod-codepen.corn.im/guide/custom-handlers)

## 开发

```bash
# 安装依赖
pnpm install

# 构建所有包
pnpm build

# 运行测试
pnpm test

# 分别运行 v3/v4 测试
pnpm test:v3
pnpm test:v4

# 启动文档开发服务器
pnpm docs:dev
```

## 贡献

欢迎贡献！详情请阅读我们的 [贡献指南](./CONTRIBUTING.md)。

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feat/amazing-feature`)
3. 提交更改 (`git commit -m 'feat: add amazing feature'`)
4. 推送分支 (`git push origin feat/amazing-feature`)
5. 提交 Pull Request

## 许可证

[MPL2.0 | Mozilla Public License 2.0](./LICENSE) - Created by [CornWorld](https://github.com/CornWorld)

**声明**: 本项目与 CodePen.io **无关**。名称中的 `codepen` 纯属巧合，代表本项目的目标是像用笔一样轻松地将 zod schema 序列化为代码字符串。
