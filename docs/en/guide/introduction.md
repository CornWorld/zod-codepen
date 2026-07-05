# Introduction

## What is zod-codepen?

**zod-codepen** is a powerful library that converts Zod schema objects into equivalent TypeScript code strings at runtime. It's ideal for debugging, code generation, schema visualization, and building developer tools.

## Why Use It?

In your development workflow, you may encounter these scenarios:

- **Debugging complex schemas** - Need to see the complete definition of a complex Zod schema
- **Code generation** - Generate schema files from runtime definitions
- **Documentation** - Automatically generate schema sections in API docs
- **Schema comparison** - Compare differences between schema versions
- **Developer tools** - Display schema structure in IDE plugins or debuggers

## Core Features

### 🔄 Dual Version Support

Compatible with both Zod v3 and v4, no version worries:

```typescript
// Zod v3
import { serialize } from "@zod-codepen/zod-v3";

// Zod v4 (including all variants)
import { serialize } from "@zod-codepen/zod-v4";
```

### 📦 Comprehensive Type Coverage

Supports 40+ Zod schema types:

- **Primitive types**: string, number, boolean, bigint, date, etc.
- **Literals and enums**: literal, enum, nativeEnum
- **Wrappers**: optional, nullable, default, catch, readonly
- **Collections**: array, object, record, map, set, tuple
- **Union types**: union, discriminatedUnion, intersection
- **Advanced**: lazy, promise, function, effects, pipe

### 🎨 Smart Constraint Handling

Automatically converts constraints to the most semantic method calls:

```typescript
// Input
z.number().min(0).max(100);

// Output - using semantic methods
("z.number().nonnegative().max(100)");
```

### 📝 Flexible Formatting

Supports pretty-printing and custom indentation:

```typescript
// Formatted output
serialize(schema);
// → z.object({
//     id: z.string(),
//     name: z.string()
//   })

// Single-line output
serialize(schema, { format: false });
// → 'z.object({ id: z.string(), name: z.string() })'
```

## Architecture

zod-codepen uses an **IR (Intermediate Representation) architecture** with two processing stages:

```
Zod Schema → cast (caster) → IRNode → codegen → Code String
```

**Two cast paths**:

- `castFromZod()` — runtime, requires actual Zod objects (v3/v4)
- `castFromAst()` — static AST parsing, extracts from TypeScript source without executing user code

```
┌──────────────────────────────────────────────────────────┐
│                    @zod-codepen/core                      │
│                                                          │
│   castFromZod()    ─┐                 ┌─  codegen()      │
│   (runtime)          ├──►  IRNode  ──►│   (IR → code)    │
│   castFromAst()    ─┘                 └─                 │
│   (static AST)                                           │
└──────────────────────────────────────────────────────────┘
         ▲                                   ▲
         │                                   │
┌────────┴────────┐              ┌───────────┴───────────┐
│ @zod-codepen/   │              │  @zod-codepen/        │
│  zod-v3 / v4    │              │  vite-plugin          │
│                 │              │                       │
│  v3/v4 Adapter  │              │  zodDecoupling        │
│  getType()      │              │  zodDecouplingStatic  │
│  getDef()       │              │                       │
└─────────────────┘              └───────────────────────┘
```

## Next Steps

- [Quick Start](/en/guide/getting-started) - 5-minute tutorial
- [Installation](/en/guide/installation) - Detailed install guide
- [Online Playground](/en/playground) - Try it live
