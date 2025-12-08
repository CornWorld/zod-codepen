# generateModule()

生成完整的 TypeScript 模块，包含 import 语句和命名导出。

## 类型签名

```typescript
function generateModule(
  schemas: Record<string, unknown>,
  options?: SerializeOptions
): string
```

## 参数

### schemas

- **类型**: `Record<string, unknown>`
- **必需**: 是
- **描述**: 模式对象，键为导出名称，值为 Zod 模式

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
- **描述**: 完整的 TypeScript 模块代码

## 输出格式

生成的代码包含：

1. **Import 语句**: `import { z } from 'zod';`
2. **命名导出**: 每个模式作为 `export const` 导出
3. **模式代码**: 序列化后的 Zod 代码

## 示例

### 基本用法

```typescript
import { generateModule } from '@zod-codepen/zod-v3';
import { z } from 'zod';

const schemas = {
  User: z.object({
    id: z.number(),
    name: z.string(),
  }),
  Status: z.enum(['active', 'inactive']),
};

console.log(generateModule(schemas));
```

输出：

```typescript
import { z } from 'zod';

export const User = z.object({
  id: z.number(),
  name: z.string()
});

export const Status = z.enum(["active", "inactive"]);
```

### 多个模式

```typescript
const schemas = {
  Address: z.object({
    street: z.string(),
    city: z.string(),
    zipCode: z.string(),
  }),
  User: z.object({
    id: z.string().uuid(),
    email: z.string().email(),
    name: z.string().min(1).max(100),
  }),
  Post: z.object({
    id: z.number(),
    title: z.string(),
    content: z.string(),
    authorId: z.string().uuid(),
  }),
  UserRole: z.enum(['admin', 'user', 'guest']),
};

generateModule(schemas);
```

### 自定义缩进

```typescript
generateModule(schemas, { indent: '    ' });
// 使用 4 空格缩进
```

## 使用场景

### 代码生成

```typescript
import fs from 'fs';

const schemas = buildSchemas();
const code = generateModule(schemas);

fs.writeFileSync('src/schemas/generated.ts', code);
```

### 文档生成

```typescript
function generateSchemaDoc(schemas: Record<string, unknown>) {
  return `
## API Schemas

\`\`\`typescript
${generateModule(schemas)}
\`\`\`
`;
}
```

### 快照测试

```typescript
import { expect, it } from 'vitest';

it('matches schema snapshot', () => {
  const code = generateModule({
    User: UserSchema,
    Post: PostSchema,
  });

  expect(code).toMatchSnapshot();
});
```

## 注意事项

### 模式顺序

对象的键顺序决定了导出顺序。如需特定顺序，可以使用 `Map` 或手动排序：

```typescript
const orderedSchemas = Object.fromEntries(
  Object.entries(schemas).sort(([a], [b]) => a.localeCompare(b))
);

generateModule(orderedSchemas);
```

### 命名规范

使用有效的 JavaScript 标识符作为键名：

```typescript
// ✅ 正确
const schemas = {
  UserSchema: z.object({ ... }),
  CreateUserInput: z.object({ ... }),
};

// ❌ 错误
const schemas = {
  'user-schema': z.object({ ... }),  // 无效标识符
  class: z.object({ ... }),           // 保留字
};
```

## 相关

- [serialize()](/api/serialize) - 序列化单个模式
- [SerializeOptions](/api/types/serialize-options) - 选项类型定义
