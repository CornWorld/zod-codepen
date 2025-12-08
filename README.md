# zod-codepen

> Serialize Zod schemas to pure Zod code strings at runtime

[![npm version](https://img.shields.io/npm/v/@zod-codepen/zod-v3.svg)](https://www.npmjs.com/package/@zod-codepen/zod-v3)
[![npm version](https://img.shields.io/npm/v/@zod-codepen/zod-v4.svg)](https://www.npmjs.com/package/@zod-codepen/zod-v4)
[![License: Mozilla Public License 2.0](https://img.shields.io/badge/License-MPL2.0-yellow.svg)](https://choosealicense.com/licenses/mpl-2.0/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg)](https://www.typescriptlang.org/)

**zod-codepen** is a powerful library that converts live Zod schema objects into equivalent TypeScript code strings. Perfect for debugging, code generation, schema visualization, and building developer tools.

## Highlights

- **Dual Version Support** - Works with both Zod v3 and Zod v4 (including all v4 variants)
- **40+ Schema Types** - Comprehensive coverage of primitives, composites, modifiers, and effects
- **Smart Constraint Handling** - Semantic method generation (e.g., `.positive()` instead of `.min(0)`)
- **Formatted Output** - Pretty-printed code with customizable indentation
- **Module Generation** - Generate complete TypeScript modules with exports
- **Extensible** - Register custom handlers for special schema types
- **Zero Runtime Overhead** - Tree-shakeable ESM modules

## Installation

Choose the package matching your Zod version:

```bash
# For Zod v3
npm install @zod-codepen/zod-v3

# For Zod v4
npm install @zod-codepen/zod-v4
```

## Quick Start

```typescript
import { serialize } from '@zod-codepen/zod-v3'; // or @zod-codepen/zod-v4
import { z } from 'zod';

// Basic serialization
serialize(z.string());
// → 'z.string()'

// With constraints
serialize(z.string().email().min(5).max(100));
// → 'z.string().email().min(5).max(100)'

// Complex objects
const UserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  age: z.number().int().min(0).optional(),
  role: z.enum(['admin', 'user', 'guest']),
});

serialize(UserSchema);
// → z.object({
//     id: z.string().uuid(),
//     email: z.string().email(),
//     age: z.number().int().nonnegative().optional(),
//     role: z.enum(["admin", "user", "guest"])
//   })
```

## API Reference

### `serialize(schema, options?)`

Serialize a single Zod schema to a code string.

```typescript
serialize(schema: unknown, options?: SerializeOptions): string
```

**Options:**
- `indent` - Indentation string (default: `'  '`)
- `format` - Enable pretty-printing (default: `true`)
- `indentLevel` - Starting indentation level (default: `0`)

### `generateModule(schemas, options?)`

Generate a complete TypeScript module with named schema exports.

```typescript
import { generateModule } from '@zod-codepen/zod-v3';

const schemas = {
  User: z.object({ id: z.number(), name: z.string() }),
  Status: z.enum(['active', 'inactive']),
};

generateModule(schemas);
// → import { z } from 'zod';
//
//   export const User = z.object({
//     id: z.number(),
//     name: z.string()
//   });
//
//   export const Status = z.enum(["active", "inactive"]);
```

### `registerHandler(type, handler)`

Register a custom handler for a schema type.

```typescript
import { registerHandler } from '@zod-codepen/zod-v3';

registerHandler('custom', (schema, ctx) => {
  return 'z.custom(/* ... */)';
});
```

## Supported Schema Types

| Category | Types |
|----------|-------|
| **Primitives** | string, number, boolean, bigint, date, undefined, null, void, any, unknown, never, nan, symbol |
| **Literals & Enums** | literal, enum, nativeEnum |
| **Wrappers** | optional, nullable, nullish, default, catch, readonly, branded |
| **Collections** | array, object, record, map, set, tuple |
| **Union Types** | union, discriminatedUnion, intersection |
| **Advanced** | lazy, promise, function, effects, pipe/pipeline |

### Constraint Support

```typescript
// String constraints
z.string().min(1).max(100).email().url().uuid().regex(/pattern/)

// Number constraints
z.number().min(0).max(100).int().positive().negative().finite()

// Array constraints
z.array(z.string()).min(1).max(10).nonempty()

// Object modifiers
z.object({}).strict().passthrough().partial().required()
```

## Zod v3 vs v4 Compatibility

The library handles internal structure differences between Zod versions automatically:

| Feature | v3 | v4 |
|---------|----|----|
| Type detection | `_def.typeName` | `_zod.def.type` |
| Constraint format | `checks: [{kind}]` | `checks: [{_zod: {def}}]` |
| All v4 variants | - | zod, zod/mini, zod/v4, zod/v4/core |

Both adapters produce identical output format, making migration seamless.

## Package Structure

```
zod-codepen/
├── pkgs/
│   ├── core/         # Core serialization engine (version-agnostic)
│   ├── zod-v3/       # Zod v3 adapter
│   └── zod-v4/       # Zod v4 adapter
└── docs/             # VitePress documentation
```

## Use Cases

- **Schema Visualization** - Display Zod schemas in developer tools
- **Code Generation** - Generate schema files from runtime definitions
- **Debugging** - Inspect complex schema structures
- **Documentation** - Auto-generate API documentation
- **Migration Tools** - Compare schemas across versions
- **Testing** - Snapshot testing for schema definitions

## Documentation

Visit the [documentation site](https://zod-codepen.dev) for detailed guides and API reference.

- [Getting Started](https://zod-codepen.dev/guide/getting-started)
- [API Reference](https://zod-codepen.dev/api/)
- [v3/v4 Migration Guide](https://zod-codepen.dev/guide/migration)
- [Custom Handlers](https://zod-codepen.dev/guide/custom-handlers)

## Development

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run tests
pnpm test

# Run v3/v4 tests separately
pnpm test:v3
pnpm test:v4

# Start documentation dev server
pnpm docs:dev
```

## Contributing

Contributions are welcome! Please read our [Contributing Guide](./CONTRIBUTING.md) for details.

1. Fork the repository
2. Create your feature branch (`git checkout -b feat/amazing-feature`)
3. Commit your changes (`git commit -m 'feat: add amazing feature'`)
4. Push to the branch (`git push origin feat/amazing-feature`)
5. Open a Pull Request

## License

[MPL2.0 | Mozilla Public License 2.0](./LICENSE) - Created by [CornWorld](https://github.com/CornWorld)

**Announce**: This project is **not** affiliated with CodePen.io. The `codepen` in the name is just a coincidence, representing the function of this project is to serialize zod schema to code string as easy as a pen.
