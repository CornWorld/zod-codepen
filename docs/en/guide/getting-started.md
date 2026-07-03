# Quick Start

This guide will help you get started with zod-codepen in 5 minutes.

## Installation

Choose the package that matches your Zod version:

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

## Basic Usage

### Serializing a Single Schema

```typescript
import { serialize } from '@zod-codepen/zod-v3';
import { z } from 'zod';

// Basic types
serialize(z.string());        // → 'z.string()'
serialize(z.number());        // → 'z.number()'
serialize(z.boolean());       // → 'z.boolean()'

// With constraints
serialize(z.string().min(1).max(100));
// → 'z.string().min(1).max(100)'

serialize(z.number().int().positive());
// → 'z.number().int().positive()'
```

### Serializing Objects

```typescript
const UserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  age: z.number().int().min(0).optional(),
});

console.log(serialize(UserSchema));
```

Output:

```typescript
z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  age: z.number().int().nonnegative().optional()
})
```

### Generating a Complete Module

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

Output:

```typescript
import { z } from 'zod';

export const User = z.object({
  id: z.number(),
  name: z.string()
});

export const Status = z.enum(["active", "inactive"]);
```

## Formatting Options

### Custom Indentation

```typescript
serialize(schema, { indent: '    ' });  // 4-space indentation
serialize(schema, { indent: '\t' });    // Tab indentation
```

### Single-Line Output

```typescript
serialize(z.object({ a: z.string(), b: z.number() }), { format: false });
// → 'z.object({ a: z.string(), b: z.number() })'
```

### Starting Indentation Level

```typescript
serialize(schema, { indentLevel: 2 });
// Output starts at indentation level 2
```

## Full Example

```typescript
import { serialize, generateModule } from '@zod-codepen/zod-v3';
import { z } from 'zod';

// Define complex schema
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

// Serialize a single schema
console.log('User Schema:');
console.log(serialize(UserSchema));

// Generate a complete module
console.log('\nGenerated Module:');
console.log(generateModule({
  Address: AddressSchema,
  User: UserSchema,
}));
```

## Next Steps

- [Online Playground](/en/playground) - Try zod-codepen live
- [Installation](/en/guide/installation) - Detailed install instructions
- [Introduction](/en/guide/introduction) - Learn what zod-codepen can do
