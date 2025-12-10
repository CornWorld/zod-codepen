# 代码优化

zod-codepen 提供了两种可选的代码优化功能，让生成的代码更简洁、更易读。这些优化都是**确定性**的，不会做任何猜测。

## 配置选项

```typescript
interface SerializeOptions {
  optimizations?: {
    // 使用语义化方法，如 .positive() 代替 .min(0)
    semanticMethods?: boolean;     // 默认: true

    // 使用科学记数法表示 2 的幂次
    scientificNotation?: boolean;  // 默认: true
  }
}
```

## 语义化方法 (Semantic Methods)

将数值约束自动转换为更语义化的方法调用。

### 支持的转换

| 原始约束 | 转换后 | 说明 |
|---------|--------|------|
| `.min(0)` | `.nonnegative()` | 非负数（≥ 0） |
| `.min(0, { inclusive: false })` | `.positive()` | 正数（> 0） |
| `.max(0)` | `.nonpositive()` | 非正数（≤ 0） |
| `.max(0, { inclusive: false })` | `.negative()` | 负数（< 0） |
| `.min(-9007199254740991).max(9007199254740991)` | `.safe()` | 安全整数范围 |

### 示例

::: code-group
```typescript [输入]
import { z } from 'zod';

const schema = z.object({
  age: z.number().min(0),
  temperature: z.number().max(0),
  balance: z.number().min(-9007199254740991).max(9007199254740991)
});
```

```typescript [输出（默认）]
z.object({
  age: z.number().nonnegative(),
  temperature: z.number().nonpositive(),
  balance: z.number().safe()
})
```

```typescript [输出（关闭优化）]
// serialize(schema, { optimizations: { semanticMethods: false } })
z.object({
  age: z.number().min(0),
  temperature: z.number().max(0),
  balance: z.number().min(-9007199254740991).max(9007199254740991)
})
```
:::

## 科学记数法 (Scientific Notation)

使用科学记数法（`**` 运算符）表示 2 的幂次相关的数值，提高可读性。

::: tip 兼容性
`**` 运算符在 ES2016+ (ES7) 中引入，所有现代浏览器和 Node.js 7+ 都支持。
:::

### 支持的格式化

#### Number 类型

| 数值 | 格式化后 | 说明 |
|------|----------|------|
| `9007199254740991` | `Number.MAX_SAFE_INTEGER` | JS 最大安全整数 |
| `-9007199254740991` | `Number.MIN_SAFE_INTEGER` | JS 最小安全整数 |
| `2147483647` | `2**31 - 1` | INT32 最大值 |
| `-2147483648` | `-2**31` | INT32 最小值 |
| `32767` | `2**15 - 1` | INT16 最大值 |
| `-32768` | `-2**15` | INT16 最小值 |
| `127` | `2**7 - 1` | INT8 最大值 |
| `-128` | `-2**7` | INT8 最小值 |
| `65535` | `2**16 - 1` | UINT16 最大值 |
| `255` | `2**8 - 1` | UINT8 最大值 |
| `65536` | `2**16` | 2 的 16 次方 |
| `4294967295` | `2**32 - 1` | UINT32 最大值 |

#### BigInt 类型

| 数值 | 格式化后 | 说明 |
|------|----------|------|
| `9223372036854775807n` | `2n**63n - 1n` | INT64 最大值 |
| `-9223372036854775808n` | `-2n**63n` | INT64 最小值 |
| `18446744073709551615n` | `2n**64n - 1n` | UINT64 最大值 |

### 示例

::: code-group
```typescript [输入]
import { z } from 'zod';

const schema = z.object({
  userId: z.number().int().max(2147483647),
  timestamp: z.bigint().max(9223372036854775807n),
  byte: z.number().int().max(255)
});
```

```typescript [输出（默认）]
z.object({
  userId: z.number().int().max(2**31 - 1),
  timestamp: z.bigint().max(2n**63n - 1n),
  byte: z.number().int().max(2**8 - 1)
})
```

```typescript [输出（关闭优化）]
// serialize(schema, { optimizations: { scientificNotation: false } })
z.object({
  userId: z.number().int().max(2147483647),
  timestamp: z.bigint().max(9223372036854775807n),
  byte: z.number().int().max(255)
})
```
:::

## 组合使用

两种优化可以组合使用，产生最简洁的代码：

```typescript
import { serialize } from '@zod-codepen/zod-v3';
import { z } from 'zod';

const schema = z.number()
  .int()
  .min(-9007199254740991)
  .max(9007199254740991);

// 默认：两种优化都启用
console.log(serialize(schema));
// 输出: z.number().int().safe()

// 只使用语义化方法
console.log(serialize(schema, {
  optimizations: {
    semanticMethods: true,
    scientificNotation: false
  }
}));
// 输出: z.number().int().min(-9007199254740991).max(9007199254740991).safe()

// 只使用科学记数法
console.log(serialize(schema, {
  optimizations: {
    semanticMethods: false,
    scientificNotation: true
  }
}));
// 输出: z.number().int().min(Number.MIN_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER)

// 关闭所有优化
console.log(serialize(schema, {
  optimizations: {
    semanticMethods: false,
    scientificNotation: false
  }
}));
// 输出: z.number().int().min(-9007199254740991).max(9007199254740991)
```

## ORM 集成示例

这些优化特别适合处理来自 ORM（如 Drizzle）生成的 schema：

::: code-group
```typescript [Drizzle Schema]
import { pgTable, integer, bigint } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: integer('id'),           // INT32
  score: integer('score'),     // INT32
  bigId: bigint('big_id', { mode: 'bigint' })  // INT64
});
```

```typescript [生成的 Zod Schema]
import { serialize } from '@zod-codepen/zod-v3';

// Drizzle 生成的原始 Zod schema
const drizzleSchema = z.object({
  id: z.number().int().min(-2147483648).max(2147483647),
  score: z.number().int().min(-2147483648).max(2147483647),
  bigId: z.bigint().min(-9223372036854775808n).max(9223372036854775807n)
});

console.log(serialize(drizzleSchema));
```

```typescript [优化后的输出]
z.object({
  id: z.number().int().min(-2**31).max(2**31 - 1),
  score: z.number().int().min(-2**31).max(2**31 - 1),
  bigId: z.bigint().min(-2n**63n).max(2n**63n - 1n)
})
```
:::

## 设计原则

### ✅ 我们做什么

- **确定性转换**：只转换有明确数学意义的值
- **提高可读性**：`2**31 - 1` 比 `2147483647` 更容易理解
- **保持准确性**：所有转换都保持数学上的精确等价

### ❌ 我们不做什么

- **不猜测业务含义**：`min(0).max(100)` 不会假设是"百分比"
- **不做假设**：`65535` 不会假设是"端口号"
- **不提取常量**：即使多次使用相同的值也不会提取为变量

::: warning 为什么不猜测？
猜测业务含义容易出错：
- `min(0).max(100)` 可能是百分比、也可能是游戏分数
- `min(0).max(65535)` 可能是端口号、也可能是 UINT16、RGB 值
- 强制使用猜测的名称会降低代码的灵活性
:::

## 禁用优化

如果你需要完全原始的输出，可以禁用所有优化：

```typescript
serialize(schema, {
  optimizations: {
    semanticMethods: false,
    scientificNotation: false
  }
});

// 或者简写（false 等同于禁用所有）
serialize(schema, {
  optimizations: false
});
```

## API 导出

如果你需要在自己的代码中使用这些格式化函数：

```typescript
import { formatNumber, formatBigInt } from '@zod-codepen/core';

console.log(formatNumber(2147483647));
// 输出: 2**31 - 1

console.log(formatBigInt(9223372036854775807n));
// 输出: 2n**63n - 1n

console.log(formatNumber(123));
// 输出: 123 (不在支持列表中的数值保持原样)
```
