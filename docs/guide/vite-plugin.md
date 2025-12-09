# Vite Plugin

`@zod-codepen/vite-plugin` 提供了与 Vite 的无缝集成，允许你在构建时自动将 Zod 模式转换为独立的 TypeScript 代码文件，从而实现更好的代码分离和优化。

## 为什么需要 Vite Plugin？

在大型项目中，Zod 模式可能会变得非常复杂，包含大量的验证逻辑和类型定义。这会带来几个问题：

1. **打包体积** - Zod 库本身需要被打包到最终代码中
2. **运行时开销** - 模式的构建和验证都在运行时进行
3. **代码分离** - 难以将模式定义与业务逻辑分离
4. **共享困难** - 在不同项目间共享模式定义变得复杂

Vite plugin 通过在构建时将 Zod 模式序列化为纯 TypeScript 代码来解决这些问题。

## 安装

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

## 基本配置

### 1. 配置 Vite

在 `vite.config.ts` 中添加插件：

```typescript
import { defineConfig } from 'vite';
import zodCodepen from '@zod-codepen/vite-plugin';

export default defineConfig({
  plugins: [
    zodCodepen({
      // 插件选项
    })
  ]
});
```

### 2. 标记需要转换的模式

使用特殊的导入后缀来标记需要转换的文件：

```typescript
// 原始模式文件: schemas/user.ts
import { z } from 'zod';

export const UserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  name: z.string().min(1).max(100),
  age: z.number().int().positive().optional(),
});

export const CreateUserSchema = UserSchema.omit({ id: true });
```

```typescript
// 使用转换后的模式
import { UserSchema, CreateUserSchema } from './schemas/user?codepen';

// UserSchema 现在是序列化后的代码字符串
console.log(UserSchema);
// 输出: "z.object({ id: z.string().uuid(), ... })"
```

## 配置选项

```typescript
interface ZodCodepenViteOptions {
  /**
   * 包含模式转换的文件模式
   * @default ['**/*.schema.ts', '**/*.schema.js']
   */
  include?: string | string[];

  /**
   * 排除的文件模式
   * @default ['node_modules/**']
   */
  exclude?: string | string[];

  /**
   * 输出格式
   * @default 'esm'
   */
  format?: 'esm' | 'cjs' | 'iife';

  /**
   * 是否生成 source maps
   * @default true
   */
  sourcemap?: boolean;

  /**
   * 是否在开发模式下启用
   * @default false
   */
  enableInDev?: boolean;

  /**
   * 自定义转换函数
   */
  transform?: (code: string, id: string) => string | null;
}
```

## 使用场景

### 1. Schema 文档生成

自动生成 API 文档中的模式定义：

```typescript
// vite.config.ts
import zodCodepen from '@zod-codepen/vite-plugin';

export default {
  plugins: [
    zodCodepen({
      include: 'src/schemas/*.ts',
    })
  ]
};
```

```typescript
// src/docs/api.md.ts
import schemas from '../schemas/*.ts?codepen';

export function generateAPIDocs() {
  return Object.entries(schemas).map(([name, code]) => `
## ${name}

\`\`\`typescript
${code}
\`\`\`
  `).join('\n');
}
```

### 2. 模式验证分离

将验证逻辑与模式定义分离：

```typescript
// schemas/user.schema.ts
import { z } from 'zod';

export const UserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  profile: z.object({
    name: z.string(),
    bio: z.string().optional(),
    avatar: z.string().url().optional(),
  }),
});
```

```typescript
// validators/user.ts
import { UserSchema } from '../schemas/user.schema?codepen';
import { z } from 'zod';

// 动态重建模式用于验证
const schema = eval(UserSchema);

export function validateUser(data: unknown) {
  return schema.parse(data);
}
```

### 3. 跨项目共享模式

生成可以在多个项目中使用的模式定义：

```typescript
// build-schemas.ts
import { generateModule } from '@zod-codepen/zod-v3';
import * as schemas from './schemas';
import fs from 'fs';

// 构建时生成独立的模式文件
const code = generateModule(schemas);
fs.writeFileSync('dist/schemas.ts', code);
```

### 4. 模式版本管理

跟踪模式的变更历史：

```typescript
// vite.config.ts
import zodCodepen from '@zod-codepen/vite-plugin';
import crypto from 'crypto';

export default {
  plugins: [
    zodCodepen({
      transform(code, id) {
        // 为每个模式生成哈希值
        const hash = crypto
          .createHash('md5')
          .update(code)
          .digest('hex')
          .substring(0, 8);

        return `/* Schema version: ${hash} */\n${code}`;
      }
    })
  ]
};
```

## 高级用法

### 自定义转换器

创建自定义转换逻辑：

```typescript
// vite.config.ts
import zodCodepen from '@zod-codepen/vite-plugin';

export default {
  plugins: [
    zodCodepen({
      transform(code, id) {
        // 只转换特定的导出
        if (id.includes('internal')) {
          return null; // 跳过内部模式
        }

        // 添加自定义注释
        return `/**
 * Auto-generated from ${id}
 * @generated ${new Date().toISOString()}
 */
${code}`;
      }
    })
  ]
};
```

### 与其他插件集成

与其他 Vite 插件协同工作：

```typescript
import { defineConfig } from 'vite';
import zodCodepen from '@zod-codepen/vite-plugin';
import dts from 'vite-plugin-dts';

export default defineConfig({
  plugins: [
    // 先转换模式
    zodCodepen({
      include: 'src/**/*.schema.ts',
    }),
    // 然后生成类型声明
    dts({
      include: ['src/**/*.ts'],
    }),
  ],
});
```

### 条件转换

根据环境变量控制转换行为：

```typescript
import zodCodepen from '@zod-codepen/vite-plugin';

export default {
  plugins: [
    zodCodepen({
      // 仅在生产构建时启用
      enableInDev: false,

      // 根据环境变量决定包含哪些文件
      include: process.env.INCLUDE_INTERNAL
        ? ['src/**/*.schema.ts']
        : ['src/public/**/*.schema.ts'],
    })
  ]
};
```

## 性能优化

### 1. 缓存机制

插件自动缓存转换结果以提高构建性能：

```typescript
zodCodepen({
  // 缓存配置（默认启用）
  cache: {
    enabled: true,
    directory: 'node_modules/.vite/zod-codepen',
  }
})
```

### 2. 并行处理

对于大型项目，启用并行处理：

```typescript
zodCodepen({
  // 使用 Worker 线程进行并行转换
  parallel: true,
  // 最大并行数
  maxWorkers: 4,
})
```

### 3. 选择性转换

只转换真正需要的模式：

```typescript
// 使用查询参数控制转换
import { UserSchema } from './schemas/user?codepen';
import { PostSchema } from './schemas/post'; // 不转换

// 或使用动态导入
const schemas = await Promise.all([
  import('./schemas/user?codepen'),
  import('./schemas/post?codepen'),
]);
```

## 调试

### 启用调试输出

```typescript
zodCodepen({
  debug: true, // 输出详细的转换日志
})
```

### 查看转换结果

```typescript
// 在开发服务器中查看转换结果
import { UserSchema } from './schemas/user?codepen&raw';
console.log(UserSchema); // 原始转换输出
```

## 最佳实践

### 1. 文件组织

推荐的项目结构：

```
src/
├── schemas/          # 原始 Zod 模式
│   ├── user.schema.ts
│   ├── post.schema.ts
│   └── index.ts
├── generated/        # 生成的代码
│   └── schemas.ts
└── validators/       # 验证逻辑
    └── index.ts
```

### 2. 命名约定

- 使用 `.schema.ts` 后缀标识模式文件
- 导出名称使用 PascalCase + Schema 后缀
- 生成的文件使用 `.generated.ts` 后缀

### 3. 类型安全

确保生成的代码保持类型安全：

```typescript
// schemas/user.schema.ts
import { z } from 'zod';

export const UserSchema = z.object({
  id: z.string(),
  email: z.string().email(),
});

// 导出类型定义
export type User = z.infer<typeof UserSchema>;
```

```typescript
// 使用时保持类型
import type { User } from './schemas/user.schema';
import { UserSchema } from './schemas/user.schema?codepen';

function processUser(user: User) {
  // 类型安全的操作
}
```

## 故障排除

### 常见问题

**Q: 转换后的代码无法执行？**

A: 确保你的运行时环境中有 Zod 可用：

```typescript
// 确保 Zod 在全局作用域可用
window.z = z; // 浏览器环境
global.z = z; // Node.js 环境
```

**Q: HMR (热模块替换) 不工作？**

A: 在开发模式下启用插件：

```typescript
zodCodepen({
  enableInDev: true,
})
```

**Q: 构建时间过长？**

A: 优化包含/排除模式，只转换必要的文件：

```typescript
zodCodepen({
  include: ['src/schemas/**/*.schema.ts'],
  exclude: ['**/*.test.ts', '**/*.spec.ts'],
})
```

## 迁移指南

### 从手动序列化迁移

如果你之前手动使用 `serialize()` 函数：

```typescript
// 之前
import { serialize } from '@zod-codepen/zod-v3';
import { UserSchema } from './schemas';

const code = serialize(UserSchema);
```

```typescript
// 现在
import { UserSchema } from './schemas/user?codepen';
// code 已经自动生成
```

### 从其他构建工具迁移

如果你从 Webpack 或 Rollup 迁移：

```typescript
// webpack.config.js
module.exports = {
  module: {
    rules: [
      {
        test: /\.schema\.ts$/,
        use: 'zod-codepen-loader', // 假设的 loader
      }
    ]
  }
};
```

```typescript
// vite.config.ts
import zodCodepen from '@zod-codepen/vite-plugin';

export default {
  plugins: [
    zodCodepen({
      include: '**/*.schema.ts',
    })
  ]
};
```

## 下一步

- [API 参考](/api/vite-plugin) - 完整的 API 文档
- [示例项目](https://github.com/CornWorld/zod-codepen/tree/main/examples/vite) - 实际使用示例
- [性能基准](https://github.com/CornWorld/zod-codepen/blob/main/benchmarks) - 性能测试结果