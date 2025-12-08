---
layout: home

hero:
  name: "zod-codepen"
  text: "Zod 模式序列化器"
  tagline: 将运行时 Zod 模式对象转换为纯 Zod 代码字符串
  actions:
    - theme: brand
      text: 快速开始
      link: /guide/getting-started
    - theme: alt
      text: API 参考
      link: /api/serialize
    - theme: alt
      text: GitHub
      link: https://github.com/CornWorld/zod-codepen

features:
  - icon: 🔄
    title: 双版本支持
    details: 同时兼容 Zod v3 和 v4，包括 v4 的所有变体（zod, zod/mini, zod/v4, zod/v4/core）
  - icon: 📦
    title: 40+ 模式类型
    details: 全面覆盖基础类型、复合类型、修饰符和效果器，支持所有常用 Zod 功能
  - icon: 🎨
    title: 智能约束处理
    details: 语义化方法生成，例如将 .min(0) 智能转换为 .nonnegative()
  - icon: 📝
    title: 格式化输出
    details: 支持美化打印，可自定义缩进，生成易读的代码
  - icon: 🔧
    title: 模块生成
    details: 一键生成完整的 TypeScript 模块，包含导入和导出语句
  - icon: 🧩
    title: 可扩展
    details: 通过 registerHandler 注册自定义处理器，轻松扩展功能
---

## 快速示例

```typescript
import { serialize } from '@zod-codepen/zod-v3'; // 或 @zod-codepen/zod-v4
import { z } from 'zod';

// 基础序列化
serialize(z.string().email());
// → 'z.string().email()'

// 复杂对象
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

## 安装

::: code-group

```bash [Zod v3]
npm install @zod-codepen/zod-v3
```

```bash [Zod v4]
npm install @zod-codepen/zod-v4
```

:::
