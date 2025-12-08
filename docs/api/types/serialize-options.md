# SerializeOptions

序列化选项类型定义。

## 类型定义

```typescript
interface SerializeOptions {
  /**
   * 缩进字符串
   * @default '  ' (2 空格)
   */
  indent?: string;

  /**
   * 起始缩进级别
   * @default 0
   */
  indentLevel?: number;

  /**
   * 是否格式化输出（多行）
   * @default true
   */
  format?: boolean;
}
```

## 属性

### indent

- **类型**: `string`
- **默认值**: `'  '` (2 空格)
- **描述**: 用于每级缩进的字符串

```typescript
// 2 空格（默认）
serialize(schema, { indent: '  ' });

// 4 空格
serialize(schema, { indent: '    ' });

// Tab
serialize(schema, { indent: '\t' });
```

### indentLevel

- **类型**: `number`
- **默认值**: `0`
- **描述**: 输出代码的起始缩进级别

```typescript
// 从第 0 级开始（默认）
serialize(schema);
// z.object({
//   name: z.string()
// })

// 从第 2 级开始
serialize(schema, { indentLevel: 2 });
//     z.object({
//       name: z.string()
//     })
```

### format

- **类型**: `boolean`
- **默认值**: `true`
- **描述**: 是否格式化输出为多行

```typescript
// 格式化输出（默认）
serialize(z.object({ a: z.string(), b: z.number() }));
// z.object({
//   a: z.string(),
//   b: z.number()
// })

// 单行输出
serialize(z.object({ a: z.string(), b: z.number() }), { format: false });
// 'z.object({ a: z.string(), b: z.number() })'
```

## 默认值

```typescript
const defaultOptions: Required<SerializeOptions> = {
  indent: '  ',
  indentLevel: 0,
  format: true,
};
```

## 使用示例

### 完整配置

```typescript
const options: SerializeOptions = {
  indent: '    ',    // 4 空格
  indentLevel: 1,    // 从第 1 级开始
  format: true,      // 格式化输出
};

serialize(schema, options);
```

### 嵌入代码

```typescript
const existingCode = `
const config = {
  schema: ${serialize(schema, { indentLevel: 1 })},
};
`;
```

### 日志输出

```typescript
console.log(`Schema: ${serialize(schema, { format: false })}`);
```

## 相关

- [serialize()](/api/serialize) - 序列化函数
- [generateModule()](/api/generate-module) - 模块生成函数
