# Zod v4 适配器

`@zod-codepen/zod-v4` 是专为 Zod v4.x 设计的序列化适配器，支持所有 v4 变体。

## 安装

```bash
npm install @zod-codepen/zod-v4
```

## 导入

```typescript
import { serialize, generateModule, registerHandler, zodV4Adapter } from '@zod-codepen/zod-v4';
```

## 兼容版本

- **Zod**: ^4.0.0 - ^4.x
- **Node.js**: ≥ 20
- **TypeScript**: ≥ 5.0

## v4 变体支持

Zod v4 提供多个入口点，zod-codepen 全部支持：

| 变体 | 导入路径 | 特点 |
|------|----------|------|
| 默认 | `zod` | 完整 API |
| Mini | `zod/mini` | 轻量级，Tree-shakeable |
| v4 Classic | `zod/v4` | 完整 v4 API |
| v4 Mini | `zod/v4/mini` | v4 轻量级 |
| v4 Core | `zod/v4/core` | 核心功能 |

```typescript
// 所有变体都使用相同的序列化器
import { z } from 'zod';           // 默认
import { z } from 'zod/mini';      // Mini
import { z } from 'zod/v4';        // v4 Classic
import { z } from 'zod/v4/mini';   // v4 Mini

// 都可以被序列化
import { serialize } from '@zod-codepen/zod-v4';
serialize(z.string());  // 'z.string()'
```

## v4 特有功能

### 改进的错误消息

v4 提供更好的错误消息支持：

```typescript
z.string().min(5, 'Must be at least 5 characters');
```

### 更好的 Tree-shaking

v4 的模块化设计使得未使用的功能不会被打包。

### 性能优化

v4 在解析和验证性能上有显著提升。

## 支持的类型

v4 适配器支持与 v3 相同的所有类型，但有以下差异：

### 约束处理差异

v4 使用不同的内部约束结构：

```typescript
// v3 约束格式
checks: [{ kind: 'min', value: 5 }]

// v4 约束格式
checks: [{ _zod: { def: { check: 'greater_than', value: 5 } } }]
```

zod-codepen 自动处理这些差异，输出保持一致。

### 跳过的功能

由于 v4 API 变化，以下功能有限制：

#### 字符串转换

```typescript
// v4 中这些转换使用 'overwrite' 检查类型
// 序列化器无法确定原始转换名称
z.string().trim()          // 可能无法正确序列化
z.string().toLowerCase()   // 可能无法正确序列化
z.string().toUpperCase()   // 可能无法正确序列化
```

#### refine 检测

```typescript
// v4 中 refine() 不创建 'effects' 类型
// 模式保持原始类型，细化存储在检查中
z.string().refine(s => s.length > 0)
// 可能序列化为 'z.string()' 而不是 'z.string().refine(...)'
```

#### brand 检测

```typescript
// v4 中 .brand() 不创建 'branded' 类型
// 只添加元数据
z.string().brand<'UserId'>()
// 序列化为 'z.string()' 而不是 'z.string().brand()'
```

#### 函数参数

```typescript
// v4 z.function() 没有 .args() 方法
z.function()  // 支持
// z.function().args() - v4 中 API 已更改
```

## v4 内部结构

v4 适配器通过以下方式访问模式信息：

```typescript
// 类型检测 (多种路径)
schema._zod.def.type    // 'string', 'number', etc.
schema.type             // 某些变体
schema.def.type         // 其他变体

// 定义访问
schema._zod.def         // 包含所有配置
schema.def              // 替代路径

// 约束
schema._zod.def.checks  // [{ _zod: { def: { check: 'min_length', ... } } }, ...]
```

## 与 v3 的兼容性

v4 适配器包含 v3 兼容性回退：

```typescript
// 如果 v4 特定路径失败，尝试 v3 路径
if (!type && schema._def?.typeName) {
  type = normalizeTypeName(schema._def.typeName);
}
```

这意味着在某些情况下，v4 适配器也可以处理 v3 模式。

## 迁移指南

如果您从 v3 迁移到 v4：

1. 更新 Zod 依赖
2. 更换 zod-codepen 包

```bash
# 卸载 v3
npm uninstall @zod-codepen/zod-v3

# 安装 v4
npm install @zod-codepen/zod-v4
```

3. 更新导入

```typescript
// 之前
import { serialize } from '@zod-codepen/zod-v3';

// 之后
import { serialize } from '@zod-codepen/zod-v4';
```

API 保持完全相同，无需其他代码更改。

## 下一步

- [v3/v4 差异](/guide/v3-v4-differences) - 详细版本比较
- [自定义处理器](/guide/custom-handlers) - 处理 v4 特有情况
