# vite-plugin API

`@zod-codepen/vite-plugin` 的完整 API 参考。

## 默认导出

```typescript
import zodCodepen from '@zod-codepen/vite-plugin';
```

### `zodCodepen(options?)`

创建 Vite 插件实例。

**参数：**

- `options` (可选) - 插件配置选项

**返回值：**

- Vite 插件对象

**示例：**

```typescript
import { defineConfig } from 'vite';
import zodCodepen from '@zod-codepen/vite-plugin';

export default defineConfig({
  plugins: [
    zodCodepen({
      include: '**/*.schema.ts'
    })
  ]
});
```

## 配置选项

### ZodCodepenViteOptions

```typescript
interface ZodCodepenViteOptions {
  include?: string | string[];
  exclude?: string | string[];
  format?: 'esm' | 'cjs' | 'iife';
  sourcemap?: boolean;
  enableInDev?: boolean;
  transform?: TransformFunction;
  cache?: CacheOptions;
  parallel?: boolean | ParallelOptions;
  debug?: boolean;
}
```

### include

- **类型：** `string | string[]`
- **默认值：** `['**/*.schema.ts', '**/*.schema.js']`

指定要处理的文件模式。支持 glob 语法。

```typescript
zodCodepen({
  include: [
    'src/schemas/**/*.ts',
    'src/models/**/*.schema.ts'
  ]
})
```

### exclude

- **类型：** `string | string[]`
- **默认值：** `['node_modules/**']`

排除的文件模式。

```typescript
zodCodepen({
  exclude: [
    'node_modules/**',
    '**/*.test.ts',
    '**/*.spec.ts'
  ]
})
```

### format

- **类型：** `'esm' | 'cjs' | 'iife'`
- **默认值：** `'esm'`

输出格式。

```typescript
zodCodepen({
  format: 'cjs' // CommonJS 格式
})
```

### sourcemap

- **类型：** `boolean`
- **默认值：** `true`

是否生成 source maps。

```typescript
zodCodepen({
  sourcemap: false // 禁用 source maps
})
```

### enableInDev

- **类型：** `boolean`
- **默认值：** `false`

是否在开发模式下启用插件。

```typescript
zodCodepen({
  enableInDev: true // 开发时也进行转换
})
```

### transform

- **类型：** `(code: string, id: string) => string | null | Promise<string | null>`
- **默认值：** `undefined`

自定义转换函数。

```typescript
zodCodepen({
  transform(code, id) {
    // 添加自定义头部
    return `/* Transformed from ${id} */\n${code}`;
  }
})
```

### cache

- **类型：** `boolean | CacheOptions`
- **默认值：** `true`

缓存配置。

```typescript
interface CacheOptions {
  enabled: boolean;
  directory?: string;
  ttl?: number; // 缓存过期时间（毫秒）
}
```

```typescript
zodCodepen({
  cache: {
    enabled: true,
    directory: '.cache/zod-codepen',
    ttl: 1000 * 60 * 60 * 24 // 24小时
  }
})
```

### parallel

- **类型：** `boolean | ParallelOptions`
- **默认值：** `false`

并行处理配置。

```typescript
interface ParallelOptions {
  enabled: boolean;
  maxWorkers?: number;
}
```

```typescript
zodCodepen({
  parallel: {
    enabled: true,
    maxWorkers: 4
  }
})
```

### debug

- **类型：** `boolean`
- **默认值：** `false`

启用调试输出。

```typescript
zodCodepen({
  debug: true // 输出详细日志
})
```

## 查询参数

可以在导入路径中使用查询参数控制转换行为。

### `?codepen`

标记文件进行转换。

```typescript
import { UserSchema } from './schemas/user?codepen';
```

### `?codepen&raw`

获取原始转换输出（未格式化）。

```typescript
import { UserSchema } from './schemas/user?codepen&raw';
```

### `?codepen&format=<format>`

指定输出格式。

```typescript
import { UserSchema } from './schemas/user?codepen&format=cjs';
```

### `?codepen&inline`

内联所有依赖。

```typescript
import { UserSchema } from './schemas/user?codepen&inline';
```

## TypeScript 类型

### 导入类型

插件提供了 TypeScript 类型定义：

```typescript
import type {
  ZodCodepenViteOptions,
  TransformFunction,
  CacheOptions,
  ParallelOptions
} from '@zod-codepen/vite-plugin';
```

### 模块声明

为了获得更好的类型支持，在 `vite-env.d.ts` 中添加：

```typescript
/// <reference types="vite/client" />

declare module '*?codepen' {
  const code: string;
  export = code;
}

declare module '*?codepen&raw' {
  const code: string;
  export = code;
}
```

## 生命周期钩子

插件在 Vite 构建生命周期中的执行顺序：

### configResolved

初始化插件配置。

### buildStart

开始构建时的准备工作。

### resolveId

解析带有 `?codepen` 查询的模块 ID。

### load

加载并转换模式文件。

### transform

应用自定义转换。

## 错误处理

### 转换错误

当模式无法转换时：

```typescript
zodCodepen({
  onError(error, file) {
    console.error(`Failed to transform ${file}:`, error);
    // 返回 false 停止构建
    // 返回 true 继续构建
    return true;
  }
})
```

### 验证错误

验证生成的代码：

```typescript
zodCodepen({
  validate(code, id) {
    try {
      // 尝试解析生成的代码
      new Function('z', code);
      return true;
    } catch (error) {
      console.error(`Invalid code generated for ${id}`);
      return false;
    }
  }
})
```

## 性能监控

### 监控转换时间

```typescript
zodCodepen({
  onTransform(id, duration) {
    console.log(`Transformed ${id} in ${duration}ms`);
  }
})
```

### 统计信息

```typescript
zodCodepen({
  stats: true, // 构建结束时输出统计信息
})
```

## 与其他工具集成

### 与 vitest 集成

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';
import zodCodepen from '@zod-codepen/vite-plugin';

export default defineConfig({
  plugins: [
    zodCodepen({
      include: '**/*.schema.ts',
      enableInDev: true, // 测试时启用
    })
  ],
  test: {
    // vitest 配置
  }
});
```

### 与 vite-plugin-dts 集成

```typescript
import dts from 'vite-plugin-dts';
import zodCodepen from '@zod-codepen/vite-plugin';

export default {
  plugins: [
    zodCodepen(),
    dts({
      // 为转换后的模式生成类型
      afterBuild() {
        // 自定义类型生成
      }
    })
  ]
};
```

## 实用函数

### createFilter

创建文件过滤器：

```typescript
import { createFilter } from '@zod-codepen/vite-plugin';

const filter = createFilter(
  ['**/*.schema.ts'],
  ['node_modules/**']
);

if (filter(filePath)) {
  // 处理文件
}
```

### parseQuery

解析查询参数：

```typescript
import { parseQuery } from '@zod-codepen/vite-plugin';

const query = parseQuery('?codepen&format=cjs');
// { codepen: true, format: 'cjs' }
```

### transformSchema

手动转换模式：

```typescript
import { transformSchema } from '@zod-codepen/vite-plugin';

const code = await transformSchema(schema, {
  format: 'esm',
  indent: '  '
});
```

## 环境变量

插件支持通过环境变量进行配置：

- `VITE_ZOD_CODEPEN_DEBUG` - 启用调试模式
- `VITE_ZOD_CODEPEN_CACHE` - 启用/禁用缓存
- `VITE_ZOD_CODEPEN_PARALLEL` - 启用并行处理

```bash
VITE_ZOD_CODEPEN_DEBUG=true vite build
```

## 示例

### 完整配置示例

```typescript
import { defineConfig } from 'vite';
import zodCodepen from '@zod-codepen/vite-plugin';

export default defineConfig({
  plugins: [
    zodCodepen({
      // 文件匹配
      include: ['src/**/*.schema.ts'],
      exclude: ['**/*.test.ts'],

      // 输出配置
      format: 'esm',
      sourcemap: true,

      // 性能优化
      cache: {
        enabled: true,
        directory: '.cache',
        ttl: 86400000,
      },
      parallel: {
        enabled: true,
        maxWorkers: 4,
      },

      // 开发配置
      enableInDev: false,
      debug: process.env.NODE_ENV === 'development',

      // 自定义处理
      transform(code, id) {
        return `/* Auto-generated */\n${code}`;
      },

      // 错误处理
      onError(error, file) {
        console.error(error);
        return true; // 继续构建
      },

      // 性能监控
      onTransform(id, duration) {
        if (duration > 100) {
          console.warn(`Slow transform: ${id} (${duration}ms)`);
        }
      },
    })
  ]
});
```