# 静态提取（Static Extraction）

> 从 TypeScript 源码直接提取 Zod schema，无需运行用户代码。

## 解决什么问题

很多全栈项目把 schema 写成这样：

```typescript
// src/runtime/schema.ts
import { createSelectSchema } from "drizzle-zod";
import { users } from "./db/schema";

export const User = createSelectSchema(users);
export const Post = createSelectSchema(posts);
```

传统流程 `await import('./runtime/schema')` 会把 drizzle-orm、pg 驱动、列定义全部拖进来。在生产环境（Cloudflare Workers、Edge runtime）这些依赖根本跑不起来。

**静态提取**把 schema 文件当作**纯文本**解析，用 TypeScript compiler API 把 AST 转成 IR，再 codegen 出纯 Zod 代码 —— 整个过程不执行用户代码。

## 快速开始

```typescript
import { castAllFromAst } from "@zod-codepen/core";

const source = `
import { z } from 'zod';
export const User = z.object({
  id: z.number(),
  name: z.string().min(1).max(50),
  email: z.string().email(),
});
`;

const results = castAllFromAst(source);
// [{ name: 'User', ir: ObjectNode{...} }]
```

直接 codegen：

```typescript
import { castFromAst, codegen } from "@zod-codepen/core";

const ir = castFromAst(source, "User");
const code = codegen(ir, { indent: "  ", indentLevel: 0, format: true });
// z.object({
//   id: z.number(),
//   name: z.string().min(1).max(50),
//   email: z.string().email(),
// })
```

## API 参考

### `castFromAst(source, exportName, opts?)`

提取单个 export，返回 `IRNode`。

- 若 export 不存在 → 返回 `FallbackNode`
- 若 schema 不识别 → 返回 `RawNode`（默认 `onUnknown: 'raw'`）

```typescript
castFromAst(source, "User", { onUnknown: "throw" });
```

### `castAllFromAst(source, opts?)`

提取所有 export，返回 `Array<{ name: string; ir: IRNode }>`。会跳过 `export type`、`export interface`、`export function`，但保留所有 `export const`/`export let`。

### `extractSchemaExports(source)`

只列出可静态分析的 export，不构造 IR。轻量、快速 —— 适合先列出再决定要不要解析。

```typescript
const exports = extractSchemaExports(source);
// [{ name: 'User', isSchemaLike: true, isTypeOnly: false, range: [12, 90] }, ...]
```

## 跨文件解析

`ModuleResolver` 支持相对路径 import：

```typescript
import {
  ModuleResolver,
  makeAstResolver,
  castFromAst,
} from "@zod-codepen/core";

const resolver = new ModuleResolver(process.cwd());
const astResolver = makeAstResolver(resolver);

// schema.ts 里 `import { BaseUser } from './shared'` 会被自动展开
const ir = castFromAst(mainSource, "User", { resolver: astResolver });
```

支持的特性：

- `import { X } from './shared'` — 命名导入
- `import { X as Y } from './shared'` — 别名
- `import X from './shared'` — 默认导入
- `...BaseSchema.shape` — 跨文件 spread 合并
- `import * as N from './shared'` — 命名空间（仅识别，不展开）

**循环依赖**：通过栈检测，循环时返回 `{ kind: 'circular' }` 给调用方，cast 层渲染为 `LazyNode` 占位符。

**模块路径解析顺序**：`./x.ts` → `./x.tsx` → `./x/index.ts` → `./x/index.tsx` → `./x.d.ts`。

**外部模块**（bare specifier 如 `'zod'`、`'drizzle-zod'`）不解析，schema 表达式落到 `RawNode`。

## 包装函数内联

```typescript
const makeEmail = () => z.string().email();
export const Email = makeEmail();
```

会被内联成 `z.string().email()`。支持的形态：

- 箭头函数表达式体：`() => z.X()`
- 箭头函数块体：`() => { return z.X(); }`
- 函数声明：`function f() { return z.X(); }`

仅限单层内联，不展开参数。

## Vite 插件

```typescript
// vite.config.ts
import { zodDecouplingStatic } from "@zod-codepen/vite-plugin";

export default defineConfig({
  plugins: [
    zodDecouplingStatic({
      schemaEntry: "./src/runtime/schema.ts",
      outputPath: "./src/generated/api-schemas.ts",
      aliasFrom: "./runtime/schema",
    }),
  ],
});
```

`zodDecouplingStatic` 在 `buildStart`：

1. `fs.readFileSync(schemaEntry)` 读源码
2. 调 `generateSchemasFromSource` 生成
3. **不调用 `await import`**

适合 schema 文件依赖 drizzle-orm、pg 等重运行时模块的场景。

## 不支持的场景

下列情况会落到 `RawNode`（带可读 `reason` 注释）：

| 场景                                     | reason                            |
| ---------------------------------------- | --------------------------------- |
| 第三方包装（`createSelectSchema()`）     | `non-zod-root:createSelectSchema` |
| 未识别的 z.X 方法                        | `unknown-zod-method:X`            |
| Zod 实例方法链（`Schema.extend({...})`） | `non-zod-root:Schema`             |
| 外部模块导入的标识符                     | `identifier-ref:X`                |
| 复杂默认值（函数体）                     | （由 cast 透传到 default 节点）   |

第一轮不支持：

- `z.interface()`（v4 新增）—— 留作后续
- 命名空间导入展开（`import * as N` 后用 `N.X`）
- 多层 wrapper 内联

## 性能

- TypeScript compiler 顶层 import ≈ 50ms 启动开销
- SourceFile 在 `ModuleResolver` 中按绝对路径缓存
- 解析后的 IR 按 `path::exportName` 缓存

## 完整示例

```typescript
import { readFileSync } from "node:fs";
import {
  ModuleResolver,
  makeAstResolver,
  castAllFromAst,
  codegen,
} from "@zod-codepen/core";

const entry = readFileSync("./schema.ts", "utf-8");
const resolver = new ModuleResolver(process.cwd());
const astResolver = makeAstResolver(resolver);

const results = castAllFromAst(entry, { resolver: astResolver });
for (const { name, ir } of results) {
  if (ir.kind === "raw" || ir.kind === "fallback") continue;
  console.log(`export const ${name} = ${codegen(ir).trim()};`);
}
```
