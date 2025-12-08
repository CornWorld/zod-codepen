# 快速开始

本指南将帮助您在 5 分钟内开始使用 zod-codepen。

## 安装

根据您使用的 Zod 版本选择对应的包：

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

## 基础用法

### 序列化单个模式

```typescript
import { serialize } from '@zod-codepen/zod-v3';
import { z } from 'zod';

// 基础类型
serialize(z.string());        // → 'z.string()'
serialize(z.number());        // → 'z.number()'
serialize(z.boolean());       // → 'z.boolean()'

// 带约束
serialize(z.string().min(1).max(100));
// → 'z.string().min(1).max(100)'

serialize(z.number().int().positive());
// → 'z.number().int().positive()'
```

### 序列化对象

```typescript
const UserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  age: z.number().int().min(0).optional(),
});

console.log(serialize(UserSchema));
```

输出：

```typescript
z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  age: z.number().int().nonnegative().optional()
})
```

### 生成完整模块

```typescript
import { generateModule } from '@zod-codepen/zod-v3';

const schemas = {
  User: z.object({
    id: z.number(),
    name: z.string(),
  }),
  Status: z.enum(['active', 'inactive']),
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

export const Status = z.enum(["active", "inactive"]);
```

## 格式化选项

### 自定义缩进

```typescript
serialize(schema, { indent: '    ' });  // 4 空格缩进
serialize(schema, { indent: '\t' });    // Tab 缩进
```

### 单行输出

```typescript
serialize(z.object({ a: z.string(), b: z.number() }), { format: false });
// → 'z.object({ a: z.string(), b: z.number() })'
```

### 起始缩进级别

```typescript
serialize(schema, { indentLevel: 2 });
// 输出以 2 级缩进开始
```

## 完整示例

```typescript
import { serialize, generateModule } from '@zod-codepen/zod-v3';
import { z } from 'zod';

// 定义复杂模式
const AddressSchema = z.object({
  street: z.string(),
  city: z.string(),
  zipCode: z.string().regex(/^\d{5}$/),
});

const UserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  name: z.string().min(1).max(100),
  age: z.number().int().min(0).max(150).optional(),
  role: z.enum(['admin', 'user', 'guest']),
  address: AddressSchema.optional(),
  tags: z.array(z.string()).default([]),
  createdAt: z.date(),
});

// 序列化单个模式
console.log('User Schema:');
console.log(serialize(UserSchema));

// 生成完整模块
console.log('\nGenerated Module:');
console.log(generateModule({
  Address: AddressSchema,
  User: UserSchema,
}));
```

## 下一步

- [安装](/guide/installation) - 详细安装说明和要求
- [基本用法](/guide/basic-usage) - 更多使用示例
- [格式化选项](/guide/formatting) - 完整的格式化配置
- [v3/v4 差异](/guide/v3-v4-differences) - 版本差异说明
