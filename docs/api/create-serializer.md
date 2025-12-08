# createSerializer()

创建带有特定适配器的序列化器实例。这是核心包的底层 API。

## 类型签名

```typescript
function createSerializer(adapter: ZodAdapter): {
  serialize: (schema: unknown, options?: SerializeOptions) => string;
  registerHandler: (type: string, handler: SchemaHandler) => void;
  generateModule: (schemas: Record<string, unknown>, options?: SerializeOptions) => string;
  adapter: ZodAdapter;
}
```

## 参数

### adapter

- **类型**: `ZodAdapter`
- **必需**: 是
- **描述**: Zod 版本适配器

```typescript
interface ZodAdapter {
  version: 'v3' | 'v4';
  getType(schema: unknown): string | undefined;
  getDef(schema: unknown): Record<string, unknown> | undefined;
  isZodSchema(value: unknown): boolean;
}
```

## 返回值

返回一个包含以下方法的对象：

### serialize

序列化单个模式：

```typescript
serialize(schema: unknown, options?: SerializeOptions): string
```

### registerHandler

注册自定义处理器：

```typescript
registerHandler(type: string, handler: SchemaHandler): void
```

### generateModule

生成完整模块：

```typescript
generateModule(schemas: Record<string, unknown>, options?: SerializeOptions): string
```

### adapter

当前使用的适配器实例。

## 示例

### 基本用法

```typescript
import { createSerializer } from '@zod-codepen/core';
import { zodV3Adapter } from '@zod-codepen/zod-v3';

const serializer = createSerializer(zodV3Adapter);

serializer.serialize(z.string());
// → 'z.string()'
```

### 自定义适配器

```typescript
import { createSerializer, ZodAdapter } from '@zod-codepen/core';

// 创建自定义适配器
const customAdapter: ZodAdapter = {
  version: 'v3',

  getType(schema: unknown): string | undefined {
    // 自定义类型检测逻辑
    if (typeof schema === 'object' && schema !== null) {
      const def = (schema as any)._def;
      if (def?.typeName) {
        return def.typeName.replace('Zod', '').toLowerCase();
      }
    }
    return undefined;
  },

  getDef(schema: unknown): Record<string, unknown> | undefined {
    if (typeof schema === 'object' && schema !== null) {
      return (schema as any)._def;
    }
    return undefined;
  },

  isZodSchema(value: unknown): boolean {
    return typeof value === 'object' &&
           value !== null &&
           '_def' in value;
  },
};

const serializer = createSerializer(customAdapter);
```

### 多实例

```typescript
import { createSerializer } from '@zod-codepen/core';
import { zodV3Adapter } from '@zod-codepen/zod-v3';
import { zodV4Adapter } from '@zod-codepen/zod-v4';

// 创建两个独立的序列化器
const v3Serializer = createSerializer(zodV3Adapter);
const v4Serializer = createSerializer(zodV4Adapter);

// 为 v3 注册自定义处理器
v3Serializer.registerHandler('string', (schema, ctx) => {
  return '/* v3 */ z.string()';
});

// v4 不受影响
v4Serializer.serialize(z.string());
// → 'z.string()'
```

### 在库中使用

```typescript
import { createSerializer, ZodAdapter, SchemaHandler } from '@zod-codepen/core';

export function createMySerializer(adapter: ZodAdapter) {
  const serializer = createSerializer(adapter);

  // 添加自定义处理器
  serializer.registerHandler('custom', myCustomHandler);

  return {
    ...serializer,
    // 添加额外方法
    serializeToFile(schema: unknown, filename: string) {
      const code = serializer.serialize(schema);
      fs.writeFileSync(filename, code);
    },
  };
}
```

## 使用场景

### 何时使用 createSerializer

- 需要创建多个独立的序列化器实例
- 构建基于 zod-codepen 的库
- 需要完全控制适配器行为
- 需要隔离的处理器注册

### 何时使用预配置的包

大多数情况下，直接使用 `@zod-codepen/zod-v3` 或 `@zod-codepen/zod-v4` 更方便：

```typescript
// 推荐：大多数用例
import { serialize } from '@zod-codepen/zod-v3';

// 高级：需要多实例或自定义适配器
import { createSerializer } from '@zod-codepen/core';
```

## 相关

- [ZodAdapter](/api/types/zod-adapter) - 适配器类型定义
- [serialize()](/api/serialize) - 预配置的序列化函数
- [registerHandler()](/api/register-handler) - 预配置的处理器注册
