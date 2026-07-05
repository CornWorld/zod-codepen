# createSerializer()

创建带有特定适配器的序列化器实例。这是 core 包的底层 API。

## 类型签名

```typescript
function createSerializer(adapter: ZodAdapter): {
  serialize(schema: unknown, options?: SerializeOptions): string;
  generateModule(
    schemas: Record<string, unknown>,
    options?: SerializeOptions,
  ): string;
  registerHandler(type: string, handler: SchemaHandler): void;
};
```

## 参数

### adapter

- **类型**: `ZodAdapter`
- **必需**: 是
- **描述**: Zod 版本适配器

## 返回值

返回一个序列化器对象：

- `serialize(schema, options?)` — 序列化单个 schema，内部通过 IR 管道（cast → IRNode → codegen）生成代码
- `generateModule(schemas, options?)` — 生成完整 TypeScript 模块
- `registerHandler(type, handler)` — 注册自定义处理器（运行时路径）

## 说明

`createSerializer()` 是底层 API。大多数用户应使用 `@zod-codepen/zod-v3` 或 `@zod-codepen/zod-v4` 预配置的 `serialize()` 函数。

序列化流程为：

```
schema → adapter.getType() → cast → IRNode → codegen → code string
```

## 示例

```typescript
import { createSerializer } from "@zod-codepen/core";
import { z } from "zod";

const adapter = {
  version: "v3" as const,
  getType(schema: unknown) {
    return (schema as any)?._def?.typeName;
  },
  getDef(schema: unknown) {
    return (schema as any)?._def;
  },
  isZodSchema(val: unknown) {
    return !!(val as any)?._def;
  },
};

const { serialize } = createSerializer(adapter);
const code = serialize(z.string().email());
// → 'z.string().email()'
```

## 相关

- [serialize()](/api/serialize) — 预配置的序列化函数
- [ZodAdapter](/api/types/zod-adapter) — 适配器类型定义
- [castFromAst()](/api/cast-from-ast) — 静态 AST 提取 API
- [registerHandler()](/api/register-handler) — 自定义处理器注册
