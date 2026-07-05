# 自定义和扩展

> zod-codepen 的扩展点说明。

## IR 架构下的扩展方式

zod-codepen 基于 **IR（中间表示）管道**工作：

```
Zod Schema → cast → IRNode → codegen → Code String
```

扩展可以从多个层级介入：

### 层级 1：Codegen 后处理（最简单）

如果只需要调整最终输出的代码字符串，在 codegen 之后修改即可：

```typescript
import { codegen } from "@zod-codepen/core";

const ir = castFromAst(source, "MySchema");
let code = codegen(ir);
// 后处理：例如添加自定义导入
code = `import { custom } from './utils';\n\n${code}`;
```

### 层级 2：IR 节点扩展

如果需要新的 schema 形态，可以直接构造 IR 节点并传给 codegen：

```typescript
import { codegen } from "@zod-codepen/core";
import type { IRNode } from "@zod-codepen/core";

const customNode: IRNode = {
  kind: "raw",
  code: "z.custom((val) => val instanceof MyClass)",
  reason: "custom-class-instance-check",
};

const output = codegen(customNode);
```

`RawNode` 是通用 escape hatch，可以渲染任意 Zod 代码字符串。

### 层级 3：适配器扩展（v3/v4）

如果需要支持新版本的 Zod 或自定义 Zod 变体，可以实现 `ZodAdapter` 接口：

```typescript
import type { ZodAdapter } from "@zod-codepen/core";

const myAdapter: ZodAdapter = {
  version: "v3",
  getType(schema: unknown) {
    // 返回 schema 类型字符串
    return (schema as any)?._def?.typeName;
  },
  getDef(schema: unknown) {
    return (schema as any)?._def;
  },
  isZodSchema(value: unknown) {
    return !!(value as any)?._def;
  },
};
```

### 层级 4：注册自定义处理器（兼容旧 API）

`registerHandler()` 仍可使用，用于运行时序列化器的自定义类型：

```typescript
import { serialize, registerHandler } from "@zod-codepen/zod-v3";

registerHandler("MyCustomType", (schema, ctx) => {
  // schema: 原始 Zod schema 对象
  // ctx: SerializerContext（含 adapter, options, indent, serialize）
  return `z.custom(/* ... */)`;
});
```

::: warning 注意
`registerHandler` 仅影响运行时序列化路径（`castFromZod`）。静态提取（`castFromAst`）不会触发自定义处理器。如需静态提取自定义类型，请在 codegen 后做字符串替换。
:::

## 相关 API

- [createSerializer()](/api/create-serializer) — 底层序列化器创建
- [castFromAst()](/api/cast-from-ast) — 静态 AST 提取
- [codegen()](/guide/static-extraction) — IR → 代码字符串
- [ZodAdapter](/api/types/zod-adapter) — 适配器接口
