# 安装

## 系统要求

- **Node.js**: ≥ 20
- **TypeScript**: ≥ 5.0 (推荐)
- **Zod**: v3.x 或 v4.x

## 包选择

zod-codepen 提供两个独立的包，分别对应 Zod 的两个主要版本：

| 包名 | Zod 版本 | npm |
|------|----------|-----|
| `@zod-codepen/zod-v3` | 3.x | [![npm](https://img.shields.io/npm/v/@zod-codepen/zod-v3.svg)](https://www.npmjs.com/package/@zod-codepen/zod-v3) |
| `@zod-codepen/zod-v4` | 4.x | [![npm](https://img.shields.io/npm/v/@zod-codepen/zod-v4.svg)](https://www.npmjs.com/package/@zod-codepen/zod-v4) |

## 安装

### 使用 npm

```bash
# Zod v3 用户
npm install @zod-codepen/zod-v3

# Zod v4 用户
npm install @zod-codepen/zod-v4
```

### 使用 pnpm

```bash
# Zod v3 用户
pnpm add @zod-codepen/zod-v3

# Zod v4 用户
pnpm add @zod-codepen/zod-v4
```

### 使用 yarn

```bash
# Zod v3 用户
yarn add @zod-codepen/zod-v3

# Zod v4 用户
yarn add @zod-codepen/zod-v4
```

## Peer Dependencies

每个包都需要对应版本的 Zod 作为 peer dependency：

```json
// @zod-codepen/zod-v3
{
  "peerDependencies": {
    "zod": "^3.0.0"
  }
}

// @zod-codepen/zod-v4
{
  "peerDependencies": {
    "zod": "^4.0.0"
  }
}
```

如果您的项目中还没有安装 Zod，需要一并安装：

```bash
# Zod v3
npm install zod@3 @zod-codepen/zod-v3

# Zod v4
npm install zod@4 @zod-codepen/zod-v4
```

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

```bash
# 检查 Zod 版本
npm ls zod

# 安装正确版本
npm install zod@3  # 或 zod@4
```
