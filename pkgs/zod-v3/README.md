<div align="center">
  <img src="https://raw.githubusercontent.com/CornWorld/zod-codepen/main/docs/public/logo.svg" alt="zod-codepen logo" width="128" height="128" />

  <h1>@zod-codepen/zod-v3</h1>

  <p>
    <b>Serialize Zod v3 schemas to TypeScript code strings at runtime</b>
  </p>

  <p>
    <a href="https://zod-codepen.corn.im">
      <img src="https://img.shields.io/badge/📖_Documentation-3178c6?style=for-the-badge" alt="Documentation" />
    </a>
    <a href="https://zod-codepen.corn.im/playground">
      <img src="https://img.shields.io/badge/🎮_Playground-3178c6?style=for-the-badge" alt="Playground" />
    </a>
  </p>

  <p>
    <a href="https://www.npmjs.com/package/@zod-codepen/zod-v3">
      <img src="https://img.shields.io/npm/v/@zod-codepen/zod-v3.svg?style=flat-square&logo=npm" alt="npm version" />
    </a>
    <a href="https://github.com/CornWorld/zod-codepen/blob/main/LICENSE">
      <img src="https://img.shields.io/badge/license-MPL%202.0-blue.svg?style=flat-square" alt="license" />
    </a>
  </p>
</div>

> [!TIP]
> **@zod-codepen/zod-v3** converts live Zod v3 schema objects into equivalent TypeScript/JavaScript code strings. Perfect for debugging, code generation, and developer tools. Visit our [documentation site](https://zod-codepen.corn.im) for complete guides and API reference.

## Installation

```bash
npm install @zod-codepen/zod-v3
```

## Quick Start

```typescript
import { serialize, generateModule } from '@zod-codepen/zod-v3';
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

## Supported Types

- **Primitives**: string, number, boolean, bigint, date, undefined, null, void, any, unknown, never, nan, symbol
- **Literals & Enums**: literal, enum, nativeEnum
- **Wrappers**: optional, nullable, default, catch, readonly, branded
- **Collections**: array, object, record, map, set, tuple
- **Unions**: union, discriminatedUnion, intersection
- **Advanced**: lazy, promise, function, effects, pipe

## Requirements

- Node.js ≥ 20
- Zod ^3.0.0

## License

MPL-2.0
