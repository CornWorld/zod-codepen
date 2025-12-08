# 模块生成

`generateModule()` 函数可以生成完整的 TypeScript 模块，包含 import 语句和命名导出。

## 基本用法

```typescript
import { generateModule } from '@zod-codepen/zod-v3';
import { z } from 'zod';

const schemas = {
  User: z.object({
    id: z.number(),
    name: z.string(),
    email: z.string().email(),
  }),
  Post: z.object({
    id: z.number(),
    title: z.string(),
    content: z.string(),
    authorId: z.number(),
  }),
  Status: z.enum(['draft', 'published', 'archived']),
};

const code = generateModule(schemas);
console.log(code);
```

输出：

```typescript
import { z } from 'zod';

export const User = z.object({
  id: z.number(),
  name: z.string(),
  email: z.string().email()
});

export const Post = z.object({
  id: z.number(),
  title: z.string(),
  content: z.string(),
  authorId: z.number()
});

export const Status = z.enum(["draft", "published", "archived"]);
```

## 输出格式

生成的模块包含以下部分：

1. **Import 语句** - 自动添加 Zod 导入
2. **命名导出** - 每个模式作为 `export const` 导出
3. **格式化代码** - 遵循标准的 TypeScript 格式

## 与 serialize() 的区别

| 特性 | serialize() | generateModule() |
|------|-------------|-----------------|
| 输入 | 单个模式 | 模式对象 |
| 输出 | 代码片段 | 完整模块 |
| Import | 无 | 自动添加 |
| Export | 无 | 命名导出 |

```typescript
// serialize() - 单个模式
serialize(z.string().email());
// → 'z.string().email()'

// generateModule() - 完整模块
generateModule({ Email: z.string().email() });
// → import { z } from 'zod';
//
//   export const Email = z.string().email();
```

## 格式化选项

`generateModule()` 支持与 `serialize()` 相同的格式化选项：

```typescript
// 4 空格缩进
generateModule(schemas, { indent: '    ' });

// 单行模式（不推荐用于模块生成）
generateModule(schemas, { format: false });
```

## 实际应用场景

### 1. 代码生成工具

从数据库模式或 API 响应生成 Zod 验证模式：

```typescript
import { generateModule } from '@zod-codepen/zod-v3';
import fs from 'fs';

// 假设从某处获取了模式定义
const schemas = buildSchemasFromDatabase();

// 生成代码文件
const code = generateModule(schemas);
fs.writeFileSync('src/schemas/generated.ts', code);
```

### 2. 模式文档生成

```typescript
import { generateModule } from '@zod-codepen/zod-v3';

function generateSchemaDoc(schemas: Record<string, unknown>) {
  const code = generateModule(schemas);

  return `
## API Schemas

\`\`\`typescript
${code}
\`\`\`
`;
}
```

### 3. 模式快照测试

```typescript
import { generateModule } from '@zod-codepen/zod-v3';
import { describe, it, expect } from 'vitest';

describe('Schema Snapshots', () => {
  it('matches schema snapshot', () => {
    const code = generateModule({
      User: UserSchema,
      Post: PostSchema,
    });

    expect(code).toMatchSnapshot();
  });
});
```

### 4. CLI 工具

```typescript
#!/usr/bin/env node
import { generateModule } from '@zod-codepen/zod-v3';
import { schemas } from './schemas';

const code = generateModule(schemas);
console.log(code);
```

## 模式命名约定

对象的键名将成为导出的常量名：

```typescript
// 使用 PascalCase 命名
const schemas = {
  UserSchema: z.object({ ... }),      // export const UserSchema
  CreateUserInput: z.object({ ... }), // export const CreateUserInput
  UserRole: z.enum([...]),            // export const UserRole
};

// 避免使用保留字或无效标识符
const schemas = {
  // ❌ 不推荐
  'user-schema': z.object({ ... }),   // 无效的标识符
  class: z.object({ ... }),           // 保留字

  // ✅ 推荐
  UserSchema: z.object({ ... }),
  UserClass: z.object({ ... }),
};
```

## 高级用法

### 与 serialize() 组合使用

```typescript
import { serialize, generateModule } from '@zod-codepen/zod-v3';

// 单独序列化特定模式用于文档
const schemaCode = serialize(UserSchema);

// 生成完整模块用于代码生成
const moduleCode = generateModule({
  User: UserSchema,
  Post: PostSchema,
});
```

### 动态模式收集

```typescript
// 从目录收集模式
import * as schemas from './schemas';

const filteredSchemas = Object.fromEntries(
  Object.entries(schemas)
    .filter(([name]) => name.endsWith('Schema'))
);

const code = generateModule(filteredSchemas);
```

## 注意事项

1. **模式顺序** - 对象的键顺序决定了导出顺序
2. **依赖关系** - 生成的代码不处理模式间的依赖（如引用）
3. **命名冲突** - 确保所有模式名称唯一
4. **类型推导** - 生成的代码可以直接用于 TypeScript 项目
