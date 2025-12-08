# registerHandler()

注册自定义模式类型处理器。

## 类型签名

```typescript
function registerHandler(type: string, handler: SchemaHandler): void
```

## 参数

### type

- **类型**: `string`
- **必需**: 是
- **描述**: 要处理的模式类型名称（如 `'string'`, `'object'`, `'custom'`）

### handler

- **类型**: `SchemaHandler`
- **必需**: 是
- **描述**: 处理函数

```typescript
type SchemaHandler = (
  schema: unknown,
  ctx: SerializerContext,
) => string | undefined;
```

## SerializerContext

处理器接收的上下文对象：

```typescript
interface SerializerContext {
  adapter: ZodAdapter;
  options: Required<SerializeOptions>;
  indent: (level?: number) => string;
  serialize: (schema: unknown, indentLevel?: number) => string;
}
```

### ctx.adapter

访问当前适配器的方法：

- `getType(schema)` - 获取模式类型
- `getDef(schema)` - 获取模式定义
- `isZodSchema(value)` - 检查是否为 Zod 模式

### ctx.options

格式化选项：

- `indent` - 缩进字符串
- `indentLevel` - 当前缩进级别
- `format` - 是否格式化

### ctx.indent(level?)

生成缩进字符串。`level` 相对于当前级别：

```typescript
ctx.indent();   // 当前级别的缩进
ctx.indent(1);  // 当前级别 + 1
ctx.indent(2);  // 当前级别 + 2
```

### ctx.serialize(schema, indentLevel?)

递归序列化嵌套模式：

```typescript
const elementCode = ctx.serialize(elementSchema);
const nestedCode = ctx.serialize(nestedSchema, ctx.options.indentLevel + 1);
```

## 返回值

- 返回 `string` - 使用此字符串作为序列化结果
- 返回 `undefined` - 回退到内置处理器

## 示例

### 覆盖内置处理器

```typescript
import { registerHandler, serialize } from '@zod-codepen/zod-v3';
import { z } from 'zod';

registerHandler('string', (schema, ctx) => {
  return '/* custom string */ z.string()';
});

serialize(z.string());
// → '/* custom string */ z.string()'
```

### 条件处理

```typescript
registerHandler('string', (schema, ctx) => {
  const def = ctx.adapter.getDef(schema) as Record<string, unknown>;
  const checks = def.checks as Array<{ kind: string }> || [];

  // 只处理有 email 验证的字符串
  if (checks.some(c => c.kind === 'email')) {
    return 'EmailSchema';
  }

  // 其他情况使用默认处理
  return undefined;
});
```

### 自定义格式

```typescript
registerHandler('object', (schema, ctx) => {
  const def = ctx.adapter.getDef(schema) as Record<string, unknown>;
  const shape = typeof def.shape === 'function' ? def.shape() : def.shape;

  if (!shape) return 'z.object({})';

  const entries = Object.entries(shape)
    .map(([key, value]) => {
      const code = ctx.serialize(value, ctx.options.indentLevel + 1);
      return `${ctx.indent(1)}// Field: ${key}\n${ctx.indent(1)}${key}: ${code}`;
    })
    .join(',\n');

  return `z.object({\n${entries}\n${ctx.indent()}})`;
});
```

### 递归处理

```typescript
registerHandler('array', (schema, ctx) => {
  const def = ctx.adapter.getDef(schema) as Record<string, unknown>;
  const element = def.type || def.element;

  if (!element) return 'z.array(z.unknown())';

  // 递归序列化元素类型
  const elementCode = ctx.serialize(element);

  return `z.array(${elementCode})`;
});
```

## 处理器优先级

1. 首先检查自定义处理器
2. 如果返回 `undefined`，使用内置处理器
3. 如果没有匹配的处理器，返回 `'z.unknown()'`

## 调试

```typescript
registerHandler('object', (schema, ctx) => {
  const def = ctx.adapter.getDef(schema);
  console.log('Schema definition:', def);
  return undefined; // 使用默认处理
});
```

## 相关

- [serialize()](/api/serialize) - 序列化函数
- [SchemaHandler](/api/types/schema-handler) - 处理器类型定义
- [自定义处理器指南](/guide/custom-handlers) - 详细指南
