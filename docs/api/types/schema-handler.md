# SchemaHandler

模式处理器类型定义。

## 类型定义

```typescript
type SchemaHandler = (
  schema: unknown,
  ctx: SerializerContext,
) => string | undefined;
```

## 参数

### schema

- **类型**: `unknown`
- **描述**: 要序列化的 Zod 模式对象

### ctx

- **类型**: `SerializerContext`
- **描述**: 序列化上下文对象

```typescript
interface SerializerContext {
  adapter: ZodAdapter;
  options: Required<SerializeOptions>;
  indent: (level?: number) => string;
  serialize: (schema: unknown, indentLevel?: number) => string;
}
```

## 返回值

- **`string`** - 序列化结果字符串
- **`undefined`** - 回退到内置处理器

## SerializerContext

### ctx.adapter

当前使用的适配器实例：

```typescript
handler: (schema, ctx) => {
  const type = ctx.adapter.getType(schema);
  const def = ctx.adapter.getDef(schema);
  const isValid = ctx.adapter.isZodSchema(schema);

  // ...
}
```

### ctx.options

格式化选项（已填充默认值）：

```typescript
handler: (schema, ctx) => {
  const { indent, indentLevel, format } = ctx.options;

  if (!format) {
    return 'z.string()';  // 单行
  }

  // ...
}
```

### ctx.indent(level?)

生成缩进字符串：

```typescript
handler: (schema, ctx) => {
  ctx.indent();   // 当前级别缩进
  ctx.indent(1);  // 当前 + 1 级缩进
  ctx.indent(2);  // 当前 + 2 级缩进
}
```

### ctx.serialize(schema, indentLevel?)

递归序列化嵌套模式：

```typescript
handler: (schema, ctx) => {
  const def = ctx.adapter.getDef(schema);
  const element = def.element;

  // 递归序列化
  const elementCode = ctx.serialize(element);
  const nestedCode = ctx.serialize(element, ctx.options.indentLevel + 1);

  return `z.array(${elementCode})`;
}
```

## 示例

### 简单处理器

```typescript
const stringHandler: SchemaHandler = (schema, ctx) => {
  return 'z.string()';
};
```

### 带条件的处理器

```typescript
const stringHandler: SchemaHandler = (schema, ctx) => {
  const def = ctx.adapter.getDef(schema) as Record<string, unknown>;
  const checks = (def.checks || []) as Array<{ kind: string }>;

  // 检查是否有 email 验证
  const hasEmail = checks.some(c => c.kind === 'email');

  if (hasEmail) {
    return 'EmailSchema';  // 使用自定义名称
  }

  // 回退到默认处理
  return undefined;
};
```

### 递归处理器

```typescript
const objectHandler: SchemaHandler = (schema, ctx) => {
  const def = ctx.adapter.getDef(schema) as Record<string, unknown>;
  const shape = typeof def.shape === 'function' ? def.shape() : def.shape;

  if (!shape || Object.keys(shape).length === 0) {
    return 'z.object({})';
  }

  const { format } = ctx.options;

  if (!format) {
    // 单行输出
    const entries = Object.entries(shape)
      .map(([key, value]) => `${key}: ${ctx.serialize(value)}`)
      .join(', ');
    return `z.object({ ${entries} })`;
  }

  // 多行输出
  const entries = Object.entries(shape)
    .map(([key, value]) => {
      const valueCode = ctx.serialize(value, ctx.options.indentLevel + 1);
      return `${ctx.indent(1)}${key}: ${valueCode}`;
    })
    .join(',\n');

  return `z.object({\n${entries}\n${ctx.indent()}})`;
};
```

### 处理约束

```typescript
const numberHandler: SchemaHandler = (schema, ctx) => {
  const def = ctx.adapter.getDef(schema) as Record<string, unknown>;
  const checks = (def.checks || []) as Array<{ kind: string; value?: number }>;

  let result = 'z.number()';

  for (const check of checks) {
    switch (check.kind) {
      case 'int':
        result += '.int()';
        break;
      case 'min':
        if (check.value === 0) {
          result += '.nonnegative()';
        } else {
          result += `.min(${check.value})`;
        }
        break;
      case 'max':
        result += `.max(${check.value})`;
        break;
    }
  }

  return result;
};
```

## 最佳实践

### 类型安全

处理器接收 `unknown` 类型，使用类型断言时要小心：

```typescript
const handler: SchemaHandler = (schema, ctx) => {
  const def = ctx.adapter.getDef(schema);

  if (!def) return undefined;

  // 安全的类型断言
  const checks = Array.isArray(def.checks) ? def.checks : [];

  // ...
};
```

### 回退机制

当处理器无法处理某些情况时，返回 `undefined`：

```typescript
const handler: SchemaHandler = (schema, ctx) => {
  const def = ctx.adapter.getDef(schema);

  // 只处理特定情况
  if (!isSpecialCase(def)) {
    return undefined;  // 使用默认处理
  }

  return 'z.special()';
};
```

### 保持格式一致性

尊重 `ctx.options` 中的格式设置：

```typescript
const handler: SchemaHandler = (schema, ctx) => {
  if (!ctx.options.format) {
    return 'z.object({ ... })';
  }

  return `z.object({\n${ctx.indent(1)}...\n${ctx.indent()}})`;
};
```

## 相关

- [registerHandler()](/api/register-handler) - 注册处理器函数
- [自定义处理器指南](/guide/custom-handlers) - 详细指南
