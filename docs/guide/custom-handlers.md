# 自定义处理器

zod-codepen 允许您注册自定义处理器来扩展或覆盖内置的序列化行为。

## registerHandler()

```typescript
function registerHandler(type: string, handler: SchemaHandler): void
```

### 参数

- `type` - 要处理的模式类型名称（如 `'string'`, `'custom'`）
- `handler` - 处理函数

### SchemaHandler 类型

```typescript
type SchemaHandler = (
  schema: unknown,
  ctx: SerializerContext,
) => string | undefined;

interface SerializerContext {
  adapter: ZodAdapter;
  options: Required<SerializeOptions>;
  indent: (level?: number) => string;
  serialize: (schema: unknown, indentLevel?: number) => string;
}
```

## 基本用法

### 覆盖内置处理器

```typescript
import { registerHandler, serialize } from '@zod-codepen/zod-v3';
import { z } from 'zod';

// 自定义字符串处理
registerHandler('string', (schema, ctx) => {
  // 添加注释
  return '/* custom string */ z.string()';
});

serialize(z.string());
// → '/* custom string */ z.string()'
```

### 添加新类型处理器

```typescript
// 处理自定义类型
registerHandler('myCustomType', (schema, ctx) => {
  return 'z.custom(/* ... */)';
});
```

## SerializerContext

处理器接收一个上下文对象，提供以下功能：

### ctx.adapter

访问当前适配器：

```typescript
registerHandler('object', (schema, ctx) => {
  // 获取模式定义
  const def = ctx.adapter.getDef(schema);

  // 获取类型名称
  const type = ctx.adapter.getType(schema);

  // 检查是否为 Zod 模式
  const isZod = ctx.adapter.isZodSchema(someValue);

  // ...
});
```

### ctx.options

访问格式化选项：

```typescript
registerHandler('array', (schema, ctx) => {
  const { indent, format, indentLevel } = ctx.options;

  if (!format) {
    return 'z.array(...)';  // 单行
  }

  // 格式化输出
  return `z.array(\n${indent.repeat(indentLevel + 1)}...\n${indent.repeat(indentLevel)})`;
});
```

### ctx.indent()

生成缩进字符串：

```typescript
registerHandler('object', (schema, ctx) => {
  const indent1 = ctx.indent(1);  // 当前级别 + 1
  const indent2 = ctx.indent(2);  // 当前级别 + 2

  return `z.object({\n${indent1}key: value\n})`;
});
```

### ctx.serialize()

递归序列化嵌套模式：

```typescript
registerHandler('array', (schema, ctx) => {
  const def = ctx.adapter.getDef(schema);
  const elementSchema = def.type || def.element;

  // 递归序列化元素类型
  const elementCode = ctx.serialize(elementSchema);

  return `z.array(${elementCode})`;
});
```

## 实际示例

### 带注释的对象

```typescript
registerHandler('object', (schema, ctx) => {
  const def = ctx.adapter.getDef(schema) as Record<string, unknown>;
  const shape = typeof def.shape === 'function' ? def.shape() : def.shape;

  if (!shape || Object.keys(shape).length === 0) {
    return 'z.object({})';
  }

  const indent = ctx.indent(1);
  const entries = Object.entries(shape)
    .map(([key, value]) => {
      const valueCode = ctx.serialize(value, ctx.options.indentLevel + 1);
      // 添加字段注释
      return `${indent}/** Field: ${key} */\n${indent}${key}: ${valueCode}`;
    })
    .join(',\n');

  return `z.object({\n${entries}\n${ctx.indent()}})`;
});
```

### 自定义验证器序列化

```typescript
import { z } from 'zod';

// 假设有一个自定义验证器
const PhoneNumber = z.string().refine(
  (val) => /^\+?[1-9]\d{1,14}$/.test(val),
  { message: 'Invalid phone number' }
);

// 注册处理器来识别它
registerHandler('string', (schema, ctx) => {
  const def = ctx.adapter.getDef(schema) as Record<string, unknown>;

  // 检查是否有特定的验证逻辑
  const checks = def.checks as Array<Record<string, unknown>> || [];
  const hasPhoneValidation = checks.some(c => {
    // 检测电话号码验证
    return c.message === 'Invalid phone number';
  });

  if (hasPhoneValidation) {
    return 'PhoneNumber';  // 返回自定义标识符
  }

  // 回退到默认处理
  return undefined;
});
```

### 简化的枚举输出

```typescript
registerHandler('enum', (schema, ctx) => {
  const def = ctx.adapter.getDef(schema) as Record<string, unknown>;
  const values = def.values as string[];

  // 如果值少于等于3个，使用联合类型风格
  if (values.length <= 3) {
    return values.map(v => `'${v}'`).join(' | ');
  }

  // 否则使用标准枚举
  return `z.enum([${values.map(v => `"${v}"`).join(', ')}])`;
});
```

## 返回 undefined

当处理器返回 `undefined` 时，序列化器将使用内置处理器：

```typescript
registerHandler('string', (schema, ctx) => {
  const def = ctx.adapter.getDef(schema);

  // 只处理特殊情况
  if (isSpecialCase(def)) {
    return 'z.special()';
  }

  // 其他情况使用默认处理
  return undefined;
});
```

## 处理器优先级

自定义处理器优先于内置处理器：

```typescript
// 1. 首先检查自定义处理器
// 2. 如果返回 undefined，使用内置处理器
// 3. 如果没有匹配的处理器，返回 'z.unknown()'
```

## 调试技巧

```typescript
registerHandler('object', (schema, ctx) => {
  const def = ctx.adapter.getDef(schema);

  // 调试：打印模式结构
  console.log('Object schema def:', JSON.stringify(def, null, 2));

  // 返回 undefined 使用默认处理
  return undefined;
});
```

## 注意事项

1. **类型安全** - 处理器接收 `unknown` 类型，需要自行进行类型断言
2. **递归处理** - 使用 `ctx.serialize()` 处理嵌套模式
3. **格式一致性** - 遵循 `ctx.options` 中的格式设置
4. **回退机制** - 返回 `undefined` 让默认处理器接管
