# 格式化选项

zod-codepen 提供灵活的格式化选项，让您可以控制输出代码的格式。

## SerializeOptions

```typescript
interface SerializeOptions {
  indent?: string;      // 缩进字符串，默认 '  ' (2 空格)
  indentLevel?: number; // 起始缩进级别，默认 0
  format?: boolean;     // 是否格式化输出，默认 true
}
```

## 缩进控制

### 自定义缩进字符

```typescript
import { serialize } from '@zod-codepen/zod-v3';
import { z } from 'zod';

const schema = z.object({
  name: z.string(),
  age: z.number(),
});

// 默认 2 空格缩进
serialize(schema);
// z.object({
//   name: z.string(),
//   age: z.number()
// })

// 4 空格缩进
serialize(schema, { indent: '    ' });
// z.object({
//     name: z.string(),
//     age: z.number()
// })

// Tab 缩进
serialize(schema, { indent: '\t' });
// z.object({
// 	name: z.string(),
// 	age: z.number()
// })
```

### 起始缩进级别

当您需要将输出嵌入到已有代码中时，可以设置起始缩进级别：

```typescript
// 嵌入到已有代码中
const existingCode = `
const config = {
  schema: ${serialize(schema, { indentLevel: 1 })},
};
`;
```

## 单行输出

设置 `format: false` 可以生成紧凑的单行输出：

```typescript
const schema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().email(),
});

// 格式化输出（默认）
serialize(schema);
// z.object({
//   id: z.string(),
//   name: z.string(),
//   email: z.string().email()
// })

// 单行输出
serialize(schema, { format: false });
// 'z.object({ id: z.string(), name: z.string(), email: z.string().email() })'
```

### 何时使用单行输出

- **日志输出** - 在日志中显示模式时
- **错误消息** - 在错误信息中包含模式
- **单元测试** - 简化测试断言
- **小型模式** - 简单模式不需要多行显示

```typescript
// 单元测试示例
expect(serialize(z.string().email(), { format: false }))
  .toBe('z.string().email()');

// 日志示例
console.log(`Schema: ${serialize(schema, { format: false })}`);
```

## 嵌套结构的格式化

对于嵌套结构，zod-codepen 会自动处理缩进：

```typescript
const schema = z.object({
  user: z.object({
    profile: z.object({
      name: z.string(),
      avatar: z.string().url().optional(),
    }),
    settings: z.object({
      theme: z.enum(['light', 'dark']),
      notifications: z.boolean(),
    }),
  }),
  posts: z.array(z.object({
    title: z.string(),
    content: z.string(),
  })),
});

serialize(schema);
```

输出：

```typescript
z.object({
  user: z.object({
    profile: z.object({
      name: z.string(),
      avatar: z.string().url().optional()
    }),
    settings: z.object({
      theme: z.enum(["light", "dark"]),
      notifications: z.boolean()
    })
  }),
  posts: z.array(z.object({
    title: z.string(),
    content: z.string()
  }))
})
```

## generateModule 的格式化

`generateModule()` 也支持相同的格式化选项：

```typescript
import { generateModule } from '@zod-codepen/zod-v3';

const schemas = {
  User: z.object({ name: z.string() }),
  Post: z.object({ title: z.string() }),
};

// 4 空格缩进
generateModule(schemas, { indent: '    ' });
```

输出：

```typescript
import { z } from 'zod';

export const User = z.object({
    name: z.string()
});

export const Post = z.object({
    title: z.string()
});
```

## 最佳实践

### 1. 代码生成时保持一致性

```typescript
// 使用项目统一的缩进风格
const projectIndent = '  '; // 或从 .editorconfig 读取

const code = generateModule(schemas, { indent: projectIndent });
```

### 2. 调试时使用格式化输出

```typescript
// 格式化便于阅读
console.log('Current schema:');
console.log(serialize(schema));
```

### 3. 日志中使用单行输出

```typescript
// 单行便于在日志中查看
logger.debug(`Validating with schema: ${serialize(schema, { format: false })}`);
```

### 4. 测试中使用适当的格式

```typescript
// 简单模式用单行
expect(serialize(z.string())).toBe('z.string()');

// 复杂模式用多行快照
expect(serialize(complexSchema)).toMatchSnapshot();
```
