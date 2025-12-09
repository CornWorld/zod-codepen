# 安装

## 系统要求

- **Node.js**: ≥ 20
- **TypeScript**: ≥ 5.0 (推荐)
- **Zod**: v3.x 或 v4.x

## 包选择

zod-codepen 提供多个包来满足不同需求：

| 包名 | 用途 | npm |
|------|------|-----|
| `@zod-codepen/zod-v3` | Zod v3.x 运行时序列化 | [![npm](https://img.shields.io/npm/v/@zod-codepen/zod-v3.svg)](https://www.npmjs.com/package/@zod-codepen/zod-v3) |
| `@zod-codepen/zod-v4` | Zod v4.x 运行时序列化 | [![npm](https://img.shields.io/npm/v/@zod-codepen/zod-v4.svg)](https://www.npmjs.com/package/@zod-codepen/zod-v4) |
| `@zod-codepen/vite-plugin` | Vite 构建时转换插件 | [![npm](https://img.shields.io/npm/v/@zod-codepen/vite-plugin.svg)](https://www.npmjs.com/package/@zod-codepen/vite-plugin) |
| `@zod-codepen/core` | 核心序列化引擎（内部使用） | [![npm](https://img.shields.io/npm/v/@zod-codepen/core.svg)](https://www.npmjs.com/package/@zod-codepen/core) |

## 安装

### 运行时序列化

::: code-group

```bash [npm]
# Zod v3
npm install @zod-codepen/zod-v3

# Zod v4
npm install @zod-codepen/zod-v4
```

```bash [pnpm]
# Zod v3
pnpm add @zod-codepen/zod-v3

# Zod v4
pnpm add @zod-codepen/zod-v4
```

```bash [yarn]
# Zod v3
yarn add @zod-codepen/zod-v3

# Zod v4
yarn add @zod-codepen/zod-v4
```

:::

### Vite 插件（构建时转换）

如果你使用 Vite，可以安装插件在构建时自动转换模式：

::: code-group

```bash [npm]
npm install -D @zod-codepen/vite-plugin
```

```bash [pnpm]
pnpm add -D @zod-codepen/vite-plugin
```

```bash [yarn]
yarn add -D @zod-codepen/vite-plugin
```

:::

配置 `vite.config.ts`：

```typescript
import { defineConfig } from 'vite';
import zodCodepen from '@zod-codepen/vite-plugin';

export default defineConfig({
  plugins: [zodCodepen()]
});
```

## Peer Dependencies

每个包都需要对应版本的 Zod 作为 peer dependency。
如果您的项目中还没有安装 Zod，需要一并安装：

::: code-group

```bash [npm]
# Zod v3
npm install zod@3 @zod-codepen/zod-v3

# Zod v4
npm install zod@4 @zod-codepen/zod-v4
```

```bash [pnpm]
# Zod v3
pnpm add zod@3 @zod-codepen/zod-v3

# Zod v4
pnpm add zod@4 @zod-codepen/zod-v4
```

```bash [yarn]
# Zod v3
yarn add zod@3 @zod-codepen/zod-v3

# Zod v4
yarn add zod@4 @zod-codepen/zod-v4
```

:::

## TypeScript 配置

zod-codepen 是用 TypeScript 编写的，提供完整的类型定义。推荐的 `tsconfig.json` 配置：

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true
  }
}
```

## ESM 模块

zod-codepen 仅提供 ESM 模块格式。确保您的项目支持 ESM：

```json
// package.json
{
  "type": "module"
}
```

或使用 `.mjs` 扩展名：

```javascript
// script.mjs
import { serialize } from '@zod-codepen/zod-v3';
```

## 验证安装

创建一个测试文件来验证安装是否成功：

```typescript
// test.ts
import { serialize } from '@zod-codepen/zod-v3'; // 或 zod-v4
import { z } from 'zod';

const schema = z.object({
  name: z.string(),
  age: z.number(),
});

console.log(serialize(schema));
// 应该输出:
// z.object({
//   name: z.string(),
//   age: z.number()
// })
```

运行测试：

```bash
npx tsx test.ts
```

## 故障排除

### 模块解析错误

如果遇到 `Cannot find module` 错误，请确保：

1. 使用 `"moduleResolution": "bundler"` 或 `"node16"`
2. 项目配置为 ESM 模块

### 类型错误

如果 TypeScript 报类型错误，请确保：

1. TypeScript 版本 ≥ 5.0
2. 安装了正确版本的 Zod
3. `@types/node` 已安装（如需要）

### Zod 版本不匹配

如果遇到 `peer dependency` 警告：

::: code-group

```bash [npm]
# 检查 Zod 版本
npm ls zod

# 安装正确版本
npm install zod@3  # 或 zod@4
```

```bash [pnpm]
# 检查 Zod 版本
pnpm ls zod

# 安装正确版本
pnpm add zod@3  # 或 zod@4
```

```bash [yarn]
# 检查 Zod 版本
yarn list zod

# 安装正确版本
yarn add zod@3  # 或 zod@4
```

:::
