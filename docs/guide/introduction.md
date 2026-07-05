# 简介

## 什么是 zod-codepen？

**zod-codepen** 是一个强大的库，可以在运行时将 Zod 模式对象转换为等效的 TypeScript 代码字符串。它非常适合调试、代码生成、模式可视化和构建开发工具。

## 为什么需要它？

在开发过程中，您可能会遇到以下场景：

- **调试复杂模式** - 需要查看一个复杂 Zod 模式的完整定义
- **代码生成** - 从运行时定义生成模式文件
- **文档生成** - 自动生成 API 文档中的模式部分
- **模式比较** - 比较不同版本的模式差异
- **开发工具** - 在 IDE 插件或调试器中显示模式结构

## 核心特性

### 🔄 双版本支持

同时兼容 Zod v3 和 v4，无需担心版本问题：

```typescript
// Zod v3
import { serialize } from "@zod-codepen/zod-v3";

// Zod v4 (包括所有变体)
import { serialize } from "@zod-codepen/zod-v4";
```

### 📦 全面的类型覆盖

支持 40+ 种 Zod 模式类型：

- **基础类型**: string, number, boolean, bigint, date 等
- **字面量和枚举**: literal, enum, nativeEnum
- **包装器**: optional, nullable, default, catch, readonly
- **集合**: array, object, record, map, set, tuple
- **联合类型**: union, discriminatedUnion, intersection
- **高级**: lazy, promise, function, effects, pipe

### 🎨 智能约束处理

自动将约束转换为最语义化的方法调用：

```typescript
// 输入
z.number().min(0).max(100);

// 输出 - 使用语义化方法
("z.number().nonnegative().max(100)");
```

### 📝 灵活的格式化

支持美化输出和自定义缩进：

```typescript
// 格式化输出
serialize(schema);
// → z.object({
//     id: z.string(),
//     name: z.string()
//   })

// 单行输出
serialize(schema, { format: false });
// → 'z.object({ id: z.string(), name: z.string() })'
```

## 架构设计

zod-codepen 采用 **IR（中间表示）架构**，序列化过程分为两个阶段：

```
Zod Schema → cast (caster) → IRNode → codegen → Code String
```

**两条 cast 路径**：

- `castFromZod()` — 运行时，需要实际 Zod 对象（支持 v3/v4）
- `castFromAst()` — 静态 AST 解析，从 TypeScript 源码提取不执行用户代码

```
┌──────────────────────────────────────────────────────────┐
│                    @zod-codepen/core                      │
│                                                          │
│   castFromZod()    ─┐                 ┌─  codegen()      │
│   (runtime)          ├──►  IRNode  ──►│   (IR → 代码)    │
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

## 下一步

- [快速开始](/guide/getting-started) - 5 分钟上手教程
- [安装](/guide/installation) - 详细安装指南
- [API 参考](/api/serialize) - 完整 API 文档
