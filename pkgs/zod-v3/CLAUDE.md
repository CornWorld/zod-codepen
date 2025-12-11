# Zod v3 适配器模块

[根目录](../../CLAUDE.md) > [pkgs](../) > **zod-v3**

---

## 模块职责

`@zod-codepen/zod-v3` 是 Zod v3 版本的适配器包，负责：
- 封装 Zod v3 内部结构访问（`schema._def.typeName`）
- 提供预配置的序列化器（`serialize`、`generateModule`）
- 导出 v3 适配器实现（`zodV3Adapter`）

**核心职责**：
- 解析 Zod v3 Schema 类型（通过 `_def.typeName`）
- 提取 Schema 定义对象（`_def`）
- 判断对象是否为有效的 Zod Schema

---

## 入口与启动

### 主入口
- **文件**：`src/index.ts`
- **导出**：
  - `serialize(schema, options?)` - 序列化单个 Schema
  - `generateModule(schemas, options?)` - 生成模块文件
  - `registerHandler` - 注册自定义处理器
  - `zodV3Adapter` - 适配器实现

### 使用示例
```typescript
import { serialize, generateModule } from '@zod-codepen/zod-v3';
import { z } from 'zod';

// 序列化单个 Schema
serialize(z.string().email());
// → 'z.string().email()'

// 生成模块
generateModule({
  User: z.object({ id: z.number(), name: z.string() }),
  Status: z.enum(['active', 'inactive']),
});
// → import { z } from 'zod';
//   export const User = z.object({ ... });
//   export const Status = z.enum([...]);
```

---

## 对外接口

### API 函数

#### `serialize(schema: unknown, options?: SerializeOptions): string`
序列化单个 Zod v3 schema 为代码字符串。

**参数**：
- `schema`：Zod schema 对象
- `options`：序列化选项（见 `@zod-codepen/core`）

**返回**：序列化后的代码字符串

#### `generateModule(schemas: Record<string, unknown>, options?: SerializeOptions): string`
生成包含多个 schema 导出的完整模块。

**参数**：
- `schemas`：Schema 映射对象（键为导出名，值为 schema）
- `options`：序列化选项

**返回**：完整的 TypeScript/JavaScript 模块代码

#### `registerHandler(type: string, handler: SchemaHandler): void`
注册自定义 Schema 类型处理器。

### 适配器实现

#### `zodV3Adapter: ZodAdapter`
Zod v3 适配器实现，包含：
- `version: 'v3'`
- `getType(schema)` - 通过 `_def.typeName` 获取类型（如 "ZodString" → "string"）
- `getDef(schema)` - 返回 `schema._def`
- `isZodSchema(value)` - 检查是否为 Zod v3 schema

**实现文件**：`src/adapter.ts`（50 行）

---

## 关键依赖与配置

### 依赖项
- **Dependencies**：`@zod-codepen/core@workspace:*`
- **Peer Dependencies**：`zod@^3.0.0`
- **Dev Dependencies**：
  - `typescript@^5.7.2`
  - `vitest@^2.1.8`
  - `zod@^3.24.1`

### 构建配置
- **构建命令**：`tsc`（直接使用 TypeScript 编译器）
- **输出目录**：`dist/`
- **模块格式**：ESM（`type: "module"`）

### 包信息
- **包名**：`@zod-codepen/zod-v3`
- **版本**：`1.0.1`
- **许可证**：MPL-2.0

---

## 数据模型

### Zod v3 内部结构
```typescript
// Zod v3 Schema 内部结构
interface ZodSchemaV3 {
  _def: {
    typeName: string;      // 如 "ZodString", "ZodNumber"
    checks?: Array<{       // 约束检查
      kind: string;        // 如 "min", "max", "email"
      value?: unknown;
      inclusive?: boolean;
      regex?: RegExp;
    }>;
    // 其他 Schema 特定字段...
  };
  parse: (value: unknown) => unknown;
  // 其他方法...
}
```

### 类型名称映射
适配器会自动转换 typeName：
- `ZodString` → `string`
- `ZodNumber` → `number`
- `ZodObject` → `object`
- `ZodArray` → `array`
- ...（其他类型同理）

---

## 测试与质量

### 测试套件
本模块包含 **10 个测试文件**，覆盖：

1. **primitives.test.ts** - 基础类型（string, number, boolean, date, bigint, symbol 等）
2. **string-constraints.test.ts** - 字符串约束（min, max, email, url, uuid, regex 等）
3. **number-constraints.test.ts** - 数字约束（min, max, int, positive, negative, finite 等）
4. **collections.test.ts** - 集合类型（array, object, record, map, set, tuple）
5. **composites.test.ts** - 组合类型（union, discriminatedUnion, intersection）
6. **modifiers.test.ts** - 修饰符（optional, nullable, default, catch, readonly, branded）
7. **effects.test.ts** - 效果（transform, refine, superRefine, preprocess）
8. **advanced.test.ts** - 高级类型（lazy, promise, function, pipe）
9. **generation.test.ts** - 模块生成功能
10. **number-formatting.test.ts** - 数字格式化优化

### 测试命令
```bash
# 运行所有测试
pnpm test

# Watch 模式
pnpm test:watch
```

### 测试覆盖
- **Schema 类型**：40+ 类型全覆盖
- **约束/修饰符**：每个类型的主要约束均有测试
- **边界情况**：null/undefined、空对象/数组、循环引用（lazy）

---

## 常见问题 (FAQ)

### Q1: 为什么需要单独的 v3 适配器包？
A: 因为 Zod v3 和 v4 的内部结构不同，v3 使用 `_def.typeName`，而 v4 使用 `_zod.def.type`。适配器隔离了这些差异。

### Q2: 如何升级到 v4？
A: 只需替换包名即可：
```bash
# 卸载 v3
pnpm remove @zod-codepen/zod-v3

# 安装 v4
pnpm add @zod-codepen/zod-v4
```

```typescript
// 修改导入
- import { serialize } from '@zod-codepen/zod-v3';
+ import { serialize } from '@zod-codepen/zod-v4';
```

API 完全兼容，无需修改调用代码。

### Q3: 支持哪些 Zod v3 版本？
A: 支持 Zod v3.0.0 及以上所有 v3 版本（测试使用 v3.24.1）。

### Q4: 为什么有些 Schema 序列化失败？
A: 可能原因：
- Schema 不是 Zod v3 对象（检查是否正确导入 zod）
- 使用了不支持的自定义类型（使用 `registerHandler` 注册）
- Schema 结构损坏（检查 `._def` 是否存在）

---

## 相关文件清单

### 源代码
- `src/index.ts`（34 行）：主入口，导出预配置序列化器
- `src/adapter.ts`（50 行）：Zod v3 适配器实现

### 测试文件
- `test/primitives.test.ts`
- `test/string-constraints.test.ts`
- `test/number-constraints.test.ts`
- `test/collections.test.ts`
- `test/composites.test.ts`
- `test/modifiers.test.ts`
- `test/effects.test.ts`
- `test/advanced.test.ts`
- `test/generation.test.ts`
- `test/number-formatting.test.ts`

### 配置文件
- `package.json`：包元数据与脚本
- `tsconfig.json`：TypeScript 编译配置
- `vitest.config.ts`：Vitest 测试配置

### 构建产物
- `dist/adapter.js` / `adapter.d.ts`
- `dist/index.js` / `index.d.ts`

---

## 变更记录 (Changelog)

### 2025-12-11
- 初始化模块文档
- 完成 v3 适配器架构扫描
- 补充测试覆盖率分析（10 个测试套件）
