# Installation

## System Requirements

- **Node.js**: ≥ 20
- **TypeScript**: ≥ 5.0 (recommended)
- **Zod**: v3.x or v4.x

## Package Selection

zod-codepen provides multiple packages for different needs:

| Package | Purpose | npm |
|---------|---------|-----|
| `@zod-codepen/zod-v3` | Zod v3.x runtime serialization | [![npm](https://img.shields.io/npm/v/@zod-codepen/zod-v3.svg)](https://www.npmjs.com/package/@zod-codepen/zod-v3) |
| `@zod-codepen/zod-v4` | Zod v4.x runtime serialization | [![npm](https://img.shields.io/npm/v/@zod-codepen/zod-v4.svg)](https://www.npmjs.com/package/@zod-codepen/zod-v4) |
| `@zod-codepen/vite-plugin` | Vite build-time transform plugin | [![npm](https://img.shields.io/npm/v/@zod-codepen/vite-plugin.svg)](https://www.npmjs.com/package/@zod-codepen/vite-plugin) |
| `@zod-codepen/core` | Core serialization engine (internal) | [![npm](https://img.shields.io/npm/v/@zod-codepen/core.svg)](https://www.npmjs.com/package/@zod-codepen/core) |

## Installation

### Runtime Serialization

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

### Vite Plugin (Build-Time Transform)

If you use Vite, you can install the plugin to automatically transform schemas at build time:

::: code-group

```bash [npm]
npm install -D @zod-codepen/vite-plugin
```

```bash [pnpm]
pnpm add -D @zod-codepen/vite-plugin
```

```bash [yarn]
yarn add -D @zod-codepen/vite-plugin
```

:::

Configure `vite.config.ts`:

```typescript
import { defineConfig } from 'vite';
import zodCodepen from '@zod-codepen/vite-plugin';

export default defineConfig({
  plugins: [zodCodepen()]
});
```

## Peer Dependencies

Each package requires the corresponding version of Zod as a peer dependency.
If you don't have Zod installed yet, install it together:

::: code-group

```bash [npm]
# Zod v3
npm install zod@3 @zod-codepen/zod-v3

# Zod v4
npm install zod@4 @zod-codepen/zod-v4
```

```bash [pnpm]
# Zod v3
pnpm add zod@3 @zod-codepen/zod-v3

# Zod v4
pnpm add zod@4 @zod-codepen/zod-v4
```

```bash [yarn]
# Zod v3
yarn add zod@3 @zod-codepen/zod-v3

# Zod v4
yarn add zod@4 @zod-codepen/zod-v4
```

:::

## TypeScript Configuration

zod-codepen is written in TypeScript and provides complete type definitions. Recommended `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true
  }
}
```

## ESM Modules

zod-codepen provides ESM module format only. Make sure your project supports ESM:

```json
// package.json
{
  "type": "module"
}
```

Or use the `.mjs` extension:

```javascript
// script.mjs
import { serialize } from '@zod-codepen/zod-v3';
```

## Verify Installation

Create a test file to verify the installation was successful:

```typescript
// test.ts
import { serialize } from '@zod-codepen/zod-v3'; // or zod-v4
import { z } from 'zod';

const schema = z.object({
  name: z.string(),
  age: z.number(),
});

console.log(serialize(schema));
// Should output:
// z.object({
//   name: z.string(),
//   age: z.number()
// })
```

Run the test:

```bash
npx tsx test.ts
```

## Troubleshooting

### Module Resolution Error

If you encounter a `Cannot find module` error, make sure:

1. Using `"moduleResolution": "bundler"` or `"node16"`
2. Project is configured for ESM modules

### Type Errors

If TypeScript reports type errors, make sure:

1. TypeScript version ≥ 5.0
2. The correct version of Zod is installed
3. `@types/node` is installed (if needed)

### Zod Version Mismatch

If you encounter `peer dependency` warnings:

::: code-group

```bash [npm]
# Check Zod version
npm ls zod

# Install the correct version
npm install zod@3  # or zod@4
```

```bash [pnpm]
# Check Zod version
pnpm ls zod

# Install the correct version
pnpm add zod@3  # or zod@4
```

```bash [yarn]
# Check Zod version
yarn list zod

# Install the correct version
yarn add zod@3  # or zod@4
```

:::
