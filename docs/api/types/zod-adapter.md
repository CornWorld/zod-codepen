# ZodAdapter

Zod 版本适配器接口定义。

## 类型定义

```typescript
interface ZodAdapter {
  /**
   * 适配器版本标识
   */
  version: 'v3' | 'v4';

  /**
   * 获取模式类型名称
   * @param schema - Zod 模式对象
   * @returns 类型名称（如 'string', 'number'）或 undefined
   */
  getType(schema: unknown): string | undefined;

  /**
   * 获取模式定义对象
   * @param schema - Zod 模式对象
   * @returns 定义对象或 undefined
   */
  getDef(schema: unknown): Record<string, unknown> | undefined;

  /**
   * 检查值是否为有效的 Zod 模式
   * @param value - 待检查的值
   * @returns 是否为 Zod 模式
   */
  isZodSchema(value: unknown): boolean;
}
```

## 属性

### version

- **类型**: `'v3' | 'v4'`
- **描述**: 适配器对应的 Zod 版本

## 方法

### getType(schema)

获取 Zod 模式的类型名称。

**参数:**
- `schema: unknown` - Zod 模式对象

**返回值:**
- `string | undefined` - 规范化的类型名称

**示例:**
```typescript
adapter.getType(z.string());   // 'string'
adapter.getType(z.number());   // 'number'
adapter.getType(z.object({})); // 'object'
adapter.getType({});           // undefined
```

### getDef(schema)

获取 Zod 模式的内部定义对象。

**参数:**
- `schema: unknown` - Zod 模式对象

**返回值:**
- `Record<string, unknown> | undefined` - 定义对象

**示例:**
```typescript
const def = adapter.getDef(z.string().email());
// {
//   typeName: 'ZodString',  // v3
//   checks: [{ kind: 'email' }],
//   ...
// }
```

### isZodSchema(value)

检查给定值是否为有效的 Zod 模式。

**参数:**
- `value: unknown` - 待检查的值

**返回值:**
- `boolean` - 是否为 Zod 模式

**示例:**
```typescript
adapter.isZodSchema(z.string());  // true
adapter.isZodSchema({});          // false
adapter.isZodSchema(null);        // false
```

## 内置适配器

### zodV3Adapter

```typescript
import { zodV3Adapter } from '@zod-codepen/zod-v3';

zodV3Adapter.version;  // 'v3'
```

### zodV4Adapter

```typescript
import { zodV4Adapter } from '@zod-codepen/zod-v4';

zodV4Adapter.version;  // 'v4'
```

## 自定义适配器

可以创建自定义适配器来支持特殊情况：

```typescript
import { ZodAdapter } from '@zod-codepen/core';

const customAdapter: ZodAdapter = {
  version: 'v3',

  getType(schema: unknown): string | undefined {
    if (typeof schema !== 'object' || schema === null) {
      return undefined;
    }

    const s = schema as Record<string, unknown>;

    // 自定义类型检测
    if (s._def && typeof s._def === 'object') {
      const def = s._def as Record<string, unknown>;
      if (typeof def.typeName === 'string') {
        return def.typeName.replace('Zod', '').toLowerCase();
      }
    }

    return undefined;
  },

  getDef(schema: unknown): Record<string, unknown> | undefined {
    if (typeof schema !== 'object' || schema === null) {
      return undefined;
    }

    return (schema as Record<string, unknown>)._def as Record<string, unknown>;
  },

  isZodSchema(value: unknown): boolean {
    if (typeof value !== 'object' || value === null) {
      return false;
    }

    return '_def' in value && typeof (value as Record<string, unknown>)._def === 'object';
  },
};
```

## 相关

- [createSerializer()](/api/create-serializer) - 使用适配器创建序列化器
- [v3/v4 差异](/guide/v3-v4-differences) - 版本差异说明
