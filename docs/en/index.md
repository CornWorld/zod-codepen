---
layout: home

hero:
  name: "zod-codepen"
  text: "Zod Schema Serializer"
  tagline: Convert runtime Zod schema objects into pure Zod code strings
  actions:
    - theme: brand
      text: Quick Start
      link: /en/guide/getting-started
    - theme: alt
      text: Try Online
      link: /en/playground
    - theme: alt
      text: API Reference
      link: /en/api/serialize
    - theme: alt
      text: GitHub
      link: https://github.com/CornWorld/zod-codepen

features:
  - icon: 🔄
    title: Dual Version Support
    details: Compatible with both Zod v3 and v4, including all v4 variants (zod, zod/mini, zod/v4, zod/v4/core)
  - icon: 📦
    title: 40+ Schema Types
    details: Comprehensive coverage of primitive types, compound types, modifiers and effects, supporting all common Zod features
  - icon: 🎨
    title: Smart Constraint Handling
    details: Semantic method generation, e.g. intelligently converting .min(0) to .nonnegative()
  - icon: 📝
    title: Formatted Output
    details: Pretty-printing with customizable indentation, generating readable code
  - icon: 🔧
    title: Module Generation
    details: One-click generation of complete TypeScript modules with import and export statements
  - icon: 🧩
    title: Extensible
    details: Register custom handlers via registerHandler to easily extend functionality
---

## Quick Example

```typescript
import { serialize } from '@zod-codepen/zod-v3'; // or @zod-codepen/zod-v4
import { z } from 'zod';

// Basic serialization
serialize(z.string().email());
// → 'z.string().email()'

// Complex objects
const UserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  role: z.enum(['admin', 'user']),
});

serialize(UserSchema);
// → z.object({
//     id: z.string().uuid(),
//     email: z.string().email(),
//     role: z.enum(["admin", "user"])
//   })
```

## Installation

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
