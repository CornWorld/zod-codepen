# serialize()

将单个 Zod 模式序列化为代码字符串。

## 类型签名

```typescript
function serialize(schema: unknown, options?: SerializeOptions): string
```

## 参数

### schema

- **类型**: `unknown`
- **必需**: 是
- **描述**: 要序列化的 Zod 模式对象

### options

- **类型**: `SerializeOptions`
- **必需**: 否
- **描述**: 格式化选项

```typescript
interface SerializeOptions {
  indent?: string;      // 缩进字符串，默认 '  '
  indentLevel?: number; // 起始缩进级别，默认 0
  format?: boolean;     // 是否格式化输出，默认 true
}
```

## 返回值

- **类型**: `string`
- **描述**: 表示 Zod 模式的代码字符串

## 示例

### 基础类型

```typescript
import { serialize } from '@zod-codepen/zod-v3';
import { z } from 'zod';

serialize(z.string());   // 'z.string()'
serialize(z.number());   // 'z.number()'
serialize(z.boolean());  // 'z.boolean()'
```

### 带约束

```typescript
serialize(z.string().email().min(5));
// 'z.string().email().min(5)'

serialize(z.number().int().min(0).max(100));
// 'z.number().int().nonnegative().max(100)'
```

### 对象

```typescript
const UserSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  email: z.string().email(),
});

serialize(UserSchema);
// z.object({
//   id: z.string().uuid(),
//   name: z.string(),
//   email: z.string().email()
// })
```

### 格式化选项

```typescript
// 4 空格缩进
serialize(schema, { indent: '    ' });

// 单行输出
serialize(schema, { format: false });
// 'z.object({ id: z.string(), name: z.string() })'

// 起始缩进级别
serialize(schema, { indentLevel: 2 });
```

### 复杂嵌套

```typescript
const schema = z.object({
  users: z.array(z.object({
    id: z.number(),
    profile: z.object({
      name: z.string(),
      avatar: z.string().url().optional(),
    }),
  })),
  pagination: z.object({
    page: z.number().int().min(1),
    limit: z.number().int().min(1).max(100),
  }),
});

serialize(schema);
// z.object({
//   users: z.array(z.object({
//     id: z.number(),
//     profile: z.object({
//       name: z.string(),
//       avatar: z.string().url().optional()
//     })
//   })),
//   pagination: z.object({
//     page: z.number().int().min(1),
//     limit: z.number().int().min(1).max(100)
//   })
// })
```

## 错误处理

如果传入的不是有效的 Zod 模式，函数会返回 `'z.unknown()'`：

```typescript
serialize({});           // 'z.unknown()'
serialize(null);         // 'z.unknown()'
serialize('string');     // 'z.unknown()'
```

## 相关

- [generateModule()](/api/generate-module) - 生成完整模块
- [registerHandler()](/api/register-handler) - 注册自定义处理器
- [SerializeOptions](/api/types/serialize-options) - 选项类型定义
