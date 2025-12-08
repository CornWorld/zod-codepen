# 基本用法

本节介绍 zod-codepen 的核心功能和常见用法。

## 导入

```typescript
// Zod v3
import { serialize, generateModule, registerHandler } from '@zod-codepen/zod-v3';

// Zod v4
import { serialize, generateModule, registerHandler } from '@zod-codepen/zod-v4';
```

## serialize()

`serialize()` 是最常用的函数，将单个 Zod 模式转换为代码字符串。

### 基础类型

```typescript
import { serialize } from '@zod-codepen/zod-v3';
import { z } from 'zod';

serialize(z.string());      // 'z.string()'
serialize(z.number());      // 'z.number()'
serialize(z.boolean());     // 'z.boolean()'
serialize(z.bigint());      // 'z.bigint()'
serialize(z.date());        // 'z.date()'
serialize(z.undefined());   // 'z.undefined()'
serialize(z.null());        // 'z.null()'
serialize(z.void());        // 'z.void()'
serialize(z.any());         // 'z.any()'
serialize(z.unknown());     // 'z.unknown()'
serialize(z.never());       // 'z.never()'
serialize(z.nan());         // 'z.nan()'
serialize(z.symbol());      // 'z.symbol()'
```

### 字符串约束

```typescript
// 长度约束
serialize(z.string().min(1));           // 'z.string().min(1)'
serialize(z.string().max(100));         // 'z.string().max(100)'
serialize(z.string().length(10));       // 'z.string().length(10)'

// 格式验证
serialize(z.string().email());          // 'z.string().email()'
serialize(z.string().url());            // 'z.string().url()'
serialize(z.string().uuid());           // 'z.string().uuid()'
serialize(z.string().cuid());           // 'z.string().cuid()'
serialize(z.string().datetime());       // 'z.string().datetime()'

// 正则表达式
serialize(z.string().regex(/^[a-z]+$/));
// 'z.string().regex(/^[a-z]+$/)'

// 字符串转换
serialize(z.string().trim());           // 'z.string().trim()'
serialize(z.string().toLowerCase());    // 'z.string().toLowerCase()'
serialize(z.string().toUpperCase());    // 'z.string().toUpperCase()'
```

### 数字约束

```typescript
// 范围约束
serialize(z.number().min(0));           // 'z.number().nonnegative()'
serialize(z.number().min(1));           // 'z.number().min(1)'
serialize(z.number().max(100));         // 'z.number().max(100)'
serialize(z.number().gt(0));            // 'z.number().positive()'
serialize(z.number().lt(0));            // 'z.number().negative()'

// 类型约束
serialize(z.number().int());            // 'z.number().int()'
serialize(z.number().finite());         // 'z.number().finite()'
serialize(z.number().safe());           // 'z.number().safe()'

// 倍数约束
serialize(z.number().multipleOf(5));    // 'z.number().multipleOf(5)'
```

::: tip 智能语义转换
zod-codepen 会自动将某些约束转换为更语义化的方法：
- `.min(0)` → `.nonnegative()`
- `.gt(0)` → `.positive()`
- `.lt(0)` → `.negative()`
:::

### 对象

```typescript
const UserSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  email: z.string().email(),
});

serialize(UserSchema);
// z.object({
//   id: z.string().uuid(),
//   name: z.string(),
//   email: z.string().email()
// })
```

### 数组

```typescript
serialize(z.array(z.string()));
// 'z.array(z.string())'

serialize(z.array(z.number()).min(1).max(10));
// 'z.array(z.number()).min(1).max(10)'

serialize(z.array(z.string()).nonempty());
// 'z.array(z.string()).nonempty()'
```

### 元组

```typescript
serialize(z.tuple([z.string(), z.number()]));
// 'z.tuple([z.string(), z.number()])'

serialize(z.tuple([z.string()]).rest(z.number()));
// 'z.tuple([z.string()]).rest(z.number())'
```

### 联合类型

```typescript
// 简单联合
serialize(z.union([z.string(), z.number()]));
// 'z.union([z.string(), z.number()])'

// 判别联合
const schema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('a'), value: z.string() }),
  z.object({ type: z.literal('b'), value: z.number() }),
]);

serialize(schema);
// z.discriminatedUnion("type", [
//   z.object({ type: z.literal("a"), value: z.string() }),
//   z.object({ type: z.literal("b"), value: z.number() })
// ])
```

### 修饰符

```typescript
serialize(z.string().optional());       // 'z.string().optional()'
serialize(z.string().nullable());       // 'z.string().nullable()'
serialize(z.string().nullish());        // 'z.string().nullable().optional()'
serialize(z.string().default('hello')); // 'z.string().default("hello")'
serialize(z.string().catch('fallback')); // 'z.string().catch("fallback")'
```

### 其他类型

```typescript
// 字面量
serialize(z.literal('hello'));          // 'z.literal("hello")'
serialize(z.literal(42));               // 'z.literal(42)'
serialize(z.literal(true));             // 'z.literal(true)'

// 枚举
serialize(z.enum(['a', 'b', 'c']));
// 'z.enum(["a", "b", "c"])'

// Record
serialize(z.record(z.string(), z.number()));
// 'z.record(z.string(), z.number())'

// Map 和 Set
serialize(z.map(z.string(), z.number()));
// 'z.map(z.string(), z.number())'

serialize(z.set(z.string()));
// 'z.set(z.string())'

// Promise
serialize(z.promise(z.string()));
// 'z.promise(z.string())'

// Lazy (递归类型)
serialize(z.lazy(() => z.string()));
// 'z.lazy(() => /* ... */)'
```

## generateModule()

`generateModule()` 生成完整的 TypeScript 模块，包含 import 语句和命名导出。

```typescript
import { generateModule } from '@zod-codepen/zod-v3';

const schemas = {
  User: z.object({
    id: z.number(),
    name: z.string(),
  }),
  Post: z.object({
    title: z.string(),
    content: z.string(),
    authorId: z.number(),
  }),
  Status: z.enum(['draft', 'published', 'archived']),
};

console.log(generateModule(schemas));
```

输出：

```typescript
import { z } from 'zod';

export const User = z.object({
  id: z.number(),
  name: z.string()
});

export const Post = z.object({
  title: z.string(),
  content: z.string(),
  authorId: z.number()
});

export const Status = z.enum(["draft", "published", "archived"]);
```

## 下一步

- [格式化选项](/guide/formatting) - 自定义输出格式
- [模块生成](/guide/module-generation) - 生成完整模块
- [自定义处理器](/guide/custom-handlers) - 扩展功能
