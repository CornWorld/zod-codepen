# @zod-codepen/zod-v4

> Serialize Zod v4 schemas to pure Zod code strings

Supports all Zod v4 variants: `zod`, `zod/mini`, `zod/v4`, `zod/v4/mini`, `zod/v4/core`.

## Installation

```bash
npm install @zod-codepen/zod-v4
```

## Quick Start

```typescript
import { serialize, generateModule } from '@zod-codepen/zod-v4';
import { z } from 'zod';

// Serialize a single schema
serialize(z.string().email());
// → 'z.string().email()'

// Serialize an object schema
const UserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  age: z.number().int().min(0).optional(),
});

serialize(UserSchema);
// → z.object({
//     id: z.string().uuid(),
//     email: z.string().email(),
//     age: z.number().int().nonnegative().optional()
//   })

// Generate a complete module
generateModule({
  User: UserSchema,
  Status: z.enum(['active', 'inactive']),
});
// → import { z } from 'zod';
//
//   export const User = z.object({...});
//   export const Status = z.enum([...]);
```

## API

### `serialize(schema, options?)`

Serialize a single Zod schema to a code string.

```typescript
serialize(z.string().email());
// → 'z.string().email()'
```

### `generateModule(schemas, options?)`

Generate a complete TypeScript module with named exports.

```typescript
generateModule({
  User: z.object({ name: z.string() }),
});
```

### `registerHandler(type, handler)`

Register a custom handler for a schema type.

```typescript
registerHandler('string', (schema, ctx) => {
  return '/* custom */ z.string()';
});
```

## Options

```typescript
interface SerializeOptions {
  indent?: string;      // Default: '  '
  indentLevel?: number; // Default: 0
  format?: boolean;     // Default: true
}
```

## v4 Variant Support

This package supports all Zod v4 entry points:

| Variant | Import | Description |
|---------|--------|-------------|
| Default | `zod` | Full API |
| Mini | `zod/mini` | Lightweight, tree-shakeable |
| v4 Classic | `zod/v4` | Full v4 API |
| v4 Mini | `zod/v4/mini` | v4 lightweight |
| v4 Core | `zod/v4/core` | Core functionality |

## Supported Types

- **Primitives**: string, number, boolean, bigint, date, undefined, null, void, any, unknown, never, nan, symbol
- **Literals & Enums**: literal, enum, nativeEnum
- **Wrappers**: optional, nullable, default, catch, readonly
- **Collections**: array, object, record, map, set, tuple
- **Unions**: union, discriminatedUnion, intersection
- **Advanced**: lazy, promise, function, effects, pipe

## v4 Limitations

Some features work differently in v4:

- String transforms (trim, toLowerCase, toUpperCase) may not serialize correctly
- `refine()` detection is limited
- `brand()` detection is limited
- `function().args()` API changed

## Requirements

- Node.js ≥ 20
- Zod ^4.0.0

## License

MPL-2.0
