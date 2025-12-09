<div align="center">
  <img src="https://raw.githubusercontent.com/CornWorld/zod-codepen/main/docs/public/logo.svg" alt="zod-codepen logo" width="128" height="128" />

  <h1>@zod-codepen/core</h1>

  <p>
    <b>Core serialization engine for Zod Codepen</b>
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
    <a href="https://www.npmjs.com/package/@zod-codepen/core">
      <img src="https://img.shields.io/npm/v/@zod-codepen/core.svg?style=flat-square&logo=npm" alt="npm version" />
    </a>
    <a href="https://github.com/CornWorld/zod-codepen/blob/main/LICENSE">
      <img src="https://img.shields.io/badge/license-MPL%202.0-blue.svg?style=flat-square" alt="license" />
    </a>
  </p>
</div>

> [!TIP]
> **@zod-codepen/core** contains the version-agnostic core logic for serializing Zod schemas to code strings. For complete documentation and examples, visit our [documentation site](https://zod-codepen.corn.im).

## Installation

```bash
npm install @zod-codepen/core
```

> **Note**: Most users should install `@zod-codepen/zod-v3` or `@zod-codepen/zod-v4` instead, which include this package as a dependency.

## Usage

```typescript
import { createSerializer, ZodAdapter } from '@zod-codepen/core';

// Create a serializer with a custom adapter
const serializer = createSerializer(myAdapter);

serializer.serialize(schema);
serializer.generateModule(schemas);
serializer.registerHandler('custom', customHandler);
```

## API

### `createSerializer(adapter: ZodAdapter)`

Creates a new serializer instance with the given adapter.

Returns an object with:
- `serialize(schema, options?)` - Serialize a single schema
- `generateModule(schemas, options?)` - Generate a complete module
- `registerHandler(type, handler)` - Register a custom handler
- `adapter` - The current adapter

### `builtinHandlers`

Map of built-in schema type handlers.

### `defaultOptions`

Default serialization options:
```typescript
{
  indent: '  ',
  indentLevel: 0,
  format: true,
}
```

## Types

```typescript
interface ZodAdapter {
  version: 'v3' | 'v4';
  getType(schema: unknown): string | undefined;
  getDef(schema: unknown): Record<string, unknown> | undefined;
  isZodSchema(value: unknown): boolean;
}

interface SerializeOptions {
  indent?: string;
  indentLevel?: number;
  format?: boolean;
}

type SchemaHandler = (schema: unknown, ctx: SerializerContext) => string | undefined;
```

## License

MPL-2.0
