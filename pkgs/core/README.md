# @zod-codepen/core

> Core serialization engine for zod-codepen

This package contains the version-agnostic core logic for serializing Zod schemas to code strings.

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
