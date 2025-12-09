# Zod v3 适配器

`@zod-codepen/zod-v3` 是专为 Zod v3.x 设计的序列化适配器。

## 安装

::: code-group

```bash [npm]
npm install @zod-codepen/zod-v3
```

```bash [pnpm]
pnpm add @zod-codepen/zod-v3
```

```bash [yarn]
yarn add @zod-codepen/zod-v3
```

:::

## 导入

```typescript
import { serialize, generateModule, registerHandler, zodV3Adapter } from '@zod-codepen/zod-v3';
```

## 兼容版本

- **Zod**: ^3.0.0 - ^3.24.x
- **Node.js**: ≥ 20
- **TypeScript**: ≥ 5.0

## 完整支持的类型

### 基础类型

| 类型 | 示例 | 输出 |
|------|------|------|
| string | `z.string()` | `'z.string()'` |
| number | `z.number()` | `'z.number()'` |
| boolean | `z.boolean()` | `'z.boolean()'` |
| bigint | `z.bigint()` | `'z.bigint()'` |
| date | `z.date()` | `'z.date()'` |
| undefined | `z.undefined()` | `'z.undefined()'` |
| null | `z.null()` | `'z.null()'` |
| void | `z.void()` | `'z.void()'` |
| any | `z.any()` | `'z.any()'` |
| unknown | `z.unknown()` | `'z.unknown()'` |
| never | `z.never()` | `'z.never()'` |
| nan | `z.nan()` | `'z.nan()'` |
| symbol | `z.symbol()` | `'z.symbol()'` |

### 字符串约束

```typescript
// 长度约束
z.string().min(1)        // 'z.string().min(1)'
z.string().max(100)      // 'z.string().max(100)'
z.string().length(10)    // 'z.string().length(10)'

// 格式验证
z.string().email()       // 'z.string().email()'
z.string().url()         // 'z.string().url()'
z.string().uuid()        // 'z.string().uuid()'
z.string().cuid()        // 'z.string().cuid()'
z.string().cuid2()       // 'z.string().cuid2()'
z.string().ulid()        // 'z.string().ulid()'
z.string().datetime()    // 'z.string().datetime()'
z.string().ip()          // 'z.string().ip()'
z.string().emoji()       // 'z.string().emoji()'

// 正则表达式
z.string().regex(/^[a-z]+$/)  // 'z.string().regex(/^[a-z]+$/)'

// 转换
z.string().trim()             // 'z.string().trim()'
z.string().toLowerCase()      // 'z.string().toLowerCase()'
z.string().toUpperCase()      // 'z.string().toUpperCase()'

// 前缀/后缀
z.string().startsWith('hello')  // 'z.string().startsWith("hello")'
z.string().endsWith('world')    // 'z.string().endsWith("world")'
z.string().includes('test')     // 'z.string().includes("test")'
```

### 数字约束

```typescript
// 范围约束
z.number().min(0)        // 'z.number().nonnegative()'
z.number().min(1)        // 'z.number().min(1)'
z.number().max(100)      // 'z.number().max(100)'
z.number().gt(0)         // 'z.number().positive()'
z.number().gte(0)        // 'z.number().nonnegative()'
z.number().lt(0)         // 'z.number().negative()'
z.number().lte(0)        // 'z.number().nonpositive()'

// 类型约束
z.number().int()         // 'z.number().int()'
z.number().finite()      // 'z.number().finite()'
z.number().safe()        // 'z.number().safe()'

// 倍数
z.number().multipleOf(5) // 'z.number().multipleOf(5)'
```

### 复合类型

```typescript
// 对象
z.object({ name: z.string() })
// 'z.object({\n  name: z.string()\n})'

// 数组
z.array(z.string())          // 'z.array(z.string())'
z.array(z.number()).min(1)   // 'z.array(z.number()).min(1)'

// 元组
z.tuple([z.string(), z.number()])
// 'z.tuple([z.string(), z.number()])'

// 联合
z.union([z.string(), z.number()])
// 'z.union([z.string(), z.number()])'

// 判别联合
z.discriminatedUnion('type', [
  z.object({ type: z.literal('a'), value: z.string() }),
  z.object({ type: z.literal('b'), value: z.number() }),
])
// 'z.discriminatedUnion("type", [...])'

// 交叉
z.intersection(z.object({ a: z.string() }), z.object({ b: z.number() }))
// 'z.intersection(...)'

// Record
z.record(z.string(), z.number())
// 'z.record(z.string(), z.number())'

// Map 和 Set
z.map(z.string(), z.number())  // 'z.map(z.string(), z.number())'
z.set(z.string())              // 'z.set(z.string())'
```

### 修饰符

```typescript
z.string().optional()        // 'z.string().optional()'
z.string().nullable()        // 'z.string().nullable()'
z.string().nullish()         // 'z.string().nullable().optional()'
z.string().default('hello')  // 'z.string().default("hello")'
z.string().catch('fallback') // 'z.string().catch("fallback")'
z.object({}).readonly()      // 'z.object({}).readonly()'
z.string().brand<'UserId'>() // 'z.string().brand()'
```

### 效果器

```typescript
// refine
z.string().refine(s => s.length > 0)
// 'z.string().refine(/* function */)'

// transform
z.string().transform(s => s.length)
// 'z.string().transform(/* function */)'

// preprocess
z.preprocess(val => String(val), z.string())
// 'z.preprocess(/* function */, z.string())'

// superRefine
z.string().superRefine((s, ctx) => { ... })
// 'z.string().superRefine(/* function */)'
```

### 其他类型

```typescript
// 字面量
z.literal('hello')           // 'z.literal("hello")'
z.literal(42)                // 'z.literal(42)'
z.literal(true)              // 'z.literal(true)'

// 枚举
z.enum(['a', 'b', 'c'])      // 'z.enum(["a", "b", "c"])'

// 原生枚举
enum Status { Active, Inactive }
z.nativeEnum(Status)         // 'z.nativeEnum(/* native enum */)'

// Promise
z.promise(z.string())        // 'z.promise(z.string())'

// 函数
z.function()                 // 'z.function()'
z.function().args(z.string()).returns(z.number())
// 'z.function().args(z.string()).returns(z.number())'

// Lazy
z.lazy(() => z.string())     // 'z.lazy(() => /* ... */)'

// 强制转换
z.coerce.string()            // 'z.coerce.string()'
z.coerce.number()            // 'z.coerce.number()'
```

## v3 特有的内部结构

v3 适配器通过以下方式访问模式信息：

```typescript
// 类型检测
schema._def.typeName  // 'ZodString', 'ZodNumber', etc.

// 定义访问
schema._def           // 包含所有配置

// 约束
schema._def.checks    // [{ kind: 'min', value: 5 }, ...]
```

## 下一步

- [v3/v4 差异](/guide/v3-v4-differences) - 了解版本差异
- [自定义处理器](/guide/custom-handlers) - 扩展功能
