# Zod v4 适配器模块

[根目录](../../CLAUDE.md) > [pkgs](../) > **zod-v4**

---

## 模块职责

`@zod-codepen/zod-v4` 是 Zod v4 版本的适配器包，负责：
- 封装 Zod v4 多变体内部结构访问（`schema._zod.def.type`）
- 支持所有 v4 变体：`zod`、`zod/mini`、`zod/v4`、`zod/v4/classic`、`zod/v4/core`
- 提供预配置的序列化器（`serialize`、`generateModule`）
- 导出 v4 适配器实现（`zodV4Adapter`）

**核心职责**：
- 解析 Zod v4 Schema 类型（优先 `_zod.def.type`，兼容 v3 格式）
- 提取 Schema 定义对象（`_zod.def` 或 `.def`）
- 判断对象是否为有效的 Zod Schema（支持多种内部结构）

**与 v3 的关键差异**：
- v3 使用 `_def.typeName`（如 "ZodString"）
- v4 使用 `_zod.def.type`（如 "string"）
- v4 的约束检查结构不同（`checks[i]._zod.def.check` vs `checks[i].kind`）

---

## 入口与启动

### 主入口
- **文件**：`src/index.ts`
- **导出**：
  - `serialize(schema, options?)` - 序列化单个 Schema
  - `generateModule(schemas, options?)` - 生成模块文件
  - `registerHandler` - 注册自定义处理器
  - `zodV4Adapter` - 适配器实现

### 使用示例
```typescript
import { serialize, generateModule } from '@zod-codepen/zod-v4';
import { z } from 'zod'; // 或 'zod/v4', 'zod/mini' 等

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
序列化单个 Zod v4 schema 为代码字符串。

**参数**：
- `schema`：Zod v4 schema 对象（任意变体）
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

#### `zodV4Adapter: ZodAdapter`
Zod v4 适配器实现，包含：
- `version: 'v4'`
- `getType(schema)` - 多层回退策略：
  1. `schema.type`（v4/classic 直接属性）
  2. `schema._zod.def.type`（v4 所有变体）
  3. `schema.def.type`（v4/classic 备用）
  4. `schema._def.typeName`（v3 兼容）
- `getDef(schema)` - 多层回退：`_zod.def` → `.def` → `._def`
- `isZodSchema(value)` - 检查是否为 Zod v4/v3 schema

**实现文件**：`src/adapter.ts`（122 行）

---

## 关键依赖与配置

### 依赖项
- **Dependencies**：`@zod-codepen/core@workspace:*`
- **Peer Dependencies**：`zod@^4.1.13`
- **Dev Dependencies**：
  - `typescript@^5.7.2`
  - `vitest@^2.1.8`
  - `zod@^4.1.13`

### 构建配置
- **构建命令**：`tsc`（直接使用 TypeScript 编译器）
- **输出目录**：`dist/`
- **模块格式**：ESM（`type: "module"`）

### 包信息
- **包名**：`@zod-codepen/zod-v4`
- **版本**：`1.0.1`
- **许可证**：MPL-2.0

---

## 数据模型

### Zod v4 内部结构（多变体）

#### v4 所有变体通用结构
```typescript
interface ZodSchemaV4 {
  _zod: {
    def: {
      type: string;        // 如 "string", "number", "object"
      checks?: Array<{
        _zod: {
          def: {
            check: string; // 如 "min_length", "string_format"
            minimum?: number;
            maximum?: number;
            format?: string;
            // ...
          }
        }
      }>;
      // 其他 Schema 特定字段...
    }
  };
  parse: (value: unknown) => unknown;
}
```

#### v4/classic 额外结构
```typescript
interface ZodSchemaV4Classic extends ZodSchemaV4 {
  type: string;            // 直接属性快捷方式
  def: {                   // 定义快捷方式
    type: string;
    // ...
  };
}
```

### v4 约束检查映射
适配器会自动规范化 v4 检查格式到 v3 风格：
- `min_length` → `min`
- `max_length` → `max`
- `string_format` + `format: "email"` → `email`
- `number_format` + `format: "int"` → `int`
- `greater_than` → `min`
- `less_than` → `max`

---

## 测试与质量

### 测试套件
本模块包含 **9 个测试文件**，覆盖：

1. **adapter.test.ts** - 适配器兼容性测试（v4 所有变体）
2. **primitives.test.ts** - 基础类型（string, number, boolean, date, bigint, symbol 等）
3. **constraints.test.ts** - 字符串与数字约束（合并测试）
4. **union-types.test.ts** - 联合类型（union, discriminatedUnion）
5. **composites.test.ts** - 组合类型（intersection, tuple）
6. **modifiers.test.ts** - 修饰符（optional, nullable, default, catch, readonly, branded）
7. **effects.test.ts** - 效果（transform, refine, superRefine, preprocess）
8. **advanced.test.ts** - 高级类型（lazy, promise, function, pipe/pipeline）
9. **generation.test.ts** - 模块生成功能

### 测试命令
```bash
# 运行所有测试
pnpm test

# Watch 模式
pnpm test:watch
```

### v4 变体兼容性测试
`adapter.test.ts` 专门测试所有 v4 变体的识别与解析：
- `zod`（默认包）
- `zod/v4`
- `zod/v4/classic`
- `zod/v4/core`
- `zod/v4/mini`
- `zod/mini`（快捷方式）

### 测试覆盖
- **Schema 类型**：40+ 类型全覆盖
- **约束/修饰符**：每个类型的主要约束均有测试
- **边界情况**：null/undefined、空对象/数组、循环引用（lazy）
- **v4 特性**：pipe/pipeline、新增约束格式

---

## 常见问题 (FAQ)

### Q1: 为什么 v4 适配器比 v3 复杂？
A: 因为 v4 支持多种变体（classic、mini、core），且内部结构有多层回退路径。适配器需要兼容所有变体和 v3 格式。

### Q2: zod/mini 和 zod/v4/classic 有什么区别？
A:
- `zod/mini`：轻量级，tree-shakeable，仅包含核心功能
- `zod/v4/classic`：完整 API，包含所有方法链和辅助函数
- 两者生成的 Schema 内部结构相同，本适配器都能处理

### Q3: 如何从 v3 迁移到 v4？
A: 只需替换包名：
```bash
pnpm remove @zod-codepen/zod-v3
pnpm add @zod-codepen/zod-v4
```

```typescript
- import { serialize } from '@zod-codepen/zod-v3';
+ import { serialize } from '@zod-codepen/zod-v4';
```

API 完全兼容，无需修改调用代码。

### Q4: v4 适配器能处理 v3 Schema 吗？
A: 可以！适配器内部有 v3 兼容回退逻辑（检查 `_def.typeName`），但建议使用对应版本的适配器以获得最佳性能。

### Q5: 为什么某些 v4 约束序列化后不一样？
A: v4 引入了新的约束格式（如 `string_format`），适配器会自动映射到 v3 等效形式（如 `.email()`），保证输出代码兼容性。

---

## 相关文件清单

### 源代码
- `src/index.ts`（34 行）：主入口，导出预配置序列化器
- `src/adapter.ts`（122 行）：Zod v4 适配器实现（含多变体支持）

### 测试文件
- `test/adapter.test.ts` - v4 变体兼容性测试
- `test/primitives.test.ts`
- `test/constraints.test.ts`
- `test/union-types.test.ts`
- `test/composites.test.ts`
- `test/modifiers.test.ts`
- `test/effects.test.ts`
- `test/advanced.test.ts`
- `test/generation.test.ts`

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
- 完成 v4 适配器架构扫描
- 补充多变体支持说明
- 新增 v3 兼容性说明
