<div align="center">
  <img src="https://raw.githubusercontent.com/CornWorld/zod-codepen/main/docs/public/logo.svg" alt="zod-codepen logo" width="128" height="128" />

  <h1>@zod-codepen/vite-plugin</h1>

  <p>
    <b>Vite plugin for automatic Zod schema serialization and decoupling</b>
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
    <a href="https://www.npmjs.com/package/@zod-codepen/vite-plugin">
      <img src="https://img.shields.io/npm/v/@zod-codepen/vite-plugin.svg?style=flat-square&logo=npm" alt="npm version" />
    </a>
    <a href="https://github.com/CornWorld/zod-codepen/blob/main/LICENSE">
      <img src="https://img.shields.io/badge/license-MPL%202.0-blue.svg?style=flat-square" alt="license" />
    </a>
  </p>
</div>

> [!TIP]
> **@zod-codepen/vite-plugin** provides seamless Vite integration for Zod schema serialization. Automatically transform and optimize your schemas at build time. Visit our [documentation site](https://zod-codepen.corn.im) for complete setup guide and examples.

## Installation

```bash
npm install -D @zod-codepen/vite-plugin
```

## Quick Start

```typescript
// vite.config.ts
import { defineConfig } from 'vite';
import zodCodepen from '@zod-codepen/vite-plugin';

export default defineConfig({
  plugins: [
    zodCodepen({
      // Options
    })
  ]
});
```

## Features

- 🚀 **Build-time optimization** - Transform schemas during build
- 🔧 **Hot Module Replacement** - Instant updates during development
- 📦 **Tree-shaking friendly** - Optimized bundle size
- 🎯 **TypeScript support** - Full type safety
- ⚡ **Zero runtime overhead** - All transformations at build time

## Configuration

```typescript
interface ZodCodepenOptions {
  // Include patterns for transformation
  include?: string | string[];

  // Exclude patterns
  exclude?: string | string[];

  // Output format
  format?: 'esm' | 'cjs';

  // Enable source maps
  sourcemap?: boolean;
}
```

## Example Usage

```typescript
// schemas.ts
import { z } from 'zod';

export const UserSchema = z.object({
  name: z.string(),
  email: z.string().email(),
  age: z.number().int().positive()
});

// With the plugin, this schema can be automatically serialized
// and optimized during build time
```

## Documentation

For detailed configuration options and advanced usage:

- [Getting Started](https://zod-codepen.corn.im/guide/getting-started)
- [Basic Usage](https://zod-codepen.corn.im/guide/basic-usage)
- [API Reference](https://zod-codepen.corn.im/api/serialize)
- [Interactive Playground](https://zod-codepen.corn.im/playground)

## Requirements

- Node.js ≥ 20
- Vite ≥ 5.0.0
- Zod ^3.0.0 or ^4.0.0

## License

MPL-2.0 © CornWorld