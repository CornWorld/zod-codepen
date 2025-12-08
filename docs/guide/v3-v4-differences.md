# v3/v4 差异

本文档详细说明 Zod v3 和 v4 之间的内部结构差异，以及 zod-codepen 如何处理这些差异。

## 核心差异

### 类型检测

| 特性 | v3 | v4 |
|------|----|----|
| 类型路径 | `schema._def.typeName` | `schema._zod.def.type` |
| 类型格式 | `'ZodString'` | `'string'` |
| 备用路径 | 无 | `schema.type`, `schema.def.type` |

```typescript
// v3
schema._def.typeName  // 'ZodString'

// v4
schema._zod.def.type  // 'string'
```

### 约束结构

v3 和 v4 使用完全不同的约束（checks）结构：

```typescript
// v3 约束
{
  checks: [
    { kind: 'min', value: 5 },
    { kind: 'email' },
    { kind: 'regex', regex: /pattern/ }
  ]
}

// v4 约束
{
  checks: [
    { _zod: { def: { check: 'min_length', value: 5 } } },
    { _zod: { def: { check: 'string_format', format: 'email' } } },
    { _zod: { def: { check: 'pattern', pattern: /pattern/ } } }
  ]
}
```

### 约束名称映射

| 功能 | v3 名称 | v4 名称 |
|------|---------|---------|
| 字符串最小长度 | `min` | `min_length` |
| 字符串最大长度 | `max` | `max_length` |
| 邮箱验证 | `email` | `string_format` + `format: 'email'` |
| URL 验证 | `url` | `string_format` + `format: 'url'` |
| UUID 验证 | `uuid` | `string_format` + `format: 'uuid'` |
| 数字最小值 | `min` | `greater_than` / `greater_than_or_equal` |
| 数字最大值 | `max` | `less_than` / `less_than_or_equal` |
| 整数 | `int` | `number_format` + `format: 'safeint'` |

## zod-codepen 的处理方式

### normalizeChecks() 函数

zod-codepen 使用 `normalizeChecks()` 函数统一处理两种格式：

```typescript
function normalizeChecks(def: Record<string, unknown>): NormalizedCheck[] {
  const checks = def.checks;

  return checks.map(check => {
    // v3 格式：直接使用
    if (typeof check.kind === 'string') {
      return { kind: check.kind, value: check.value };
    }

    // v4 格式：提取并转换
    if (check._zod?.def) {
      const checkDef = check._zod.def;
      const checkType = checkDef.check;

      // 特殊处理 string_format
      if (checkType === 'string_format') {
        return { kind: checkDef.format };  // 'email', 'url', etc.
      }

      // 映射 v4 名称到 v3 名称
      const kindMap = {
        'greater_than': 'gt',
        'greater_than_or_equal': 'min',
        'less_than': 'lt',
        'less_than_or_equal': 'max',
        // ...更多映射
      };

      return { kind: kindMap[checkType] || checkType, value: checkDef.value };
    }
  });
}
```

### 统一的输出

无论使用 v3 还是 v4，输出格式保持一致：

```typescript
// v3 输入
import { serialize } from '@zod-codepen/zod-v3';
serialize(z.string().email().min(5));
// → 'z.string().email().min(5)'

// v4 输入
import { serialize } from '@zod-codepen/zod-v4';
serialize(z.string().email().min(5));
// → 'z.string().email().min(5)'
```

## 对象结构差异

### Shape 访问

```typescript
// v3 - shape 是函数
const shape = schema._def.shape();

// v4 - shape 是直接属性
const shape = schema.def.shape;
```

zod-codepen 自动处理两种情况。

### 未知键处理

```typescript
// v3 - unknownKeys 属性
schema._def.unknownKeys  // 'strict' | 'passthrough' | 'strip'

// v4 - catchall 类型检测
schema.def.catchall._zod.def.type  // 'never' | 'unknown' | ...
```

## 数组结构差异

```typescript
// v3 - type 属性
schema._def.type  // 元素模式

// v4 - element 属性
schema.def.element  // 元素模式
```

## 联合类型差异

### 判别联合

```typescript
// v3 - discriminator 属性
schema._def.discriminator  // 'type'
schema._def.options        // [schema1, schema2, ...]

// v4 - 相同结构
schema.def.discriminator   // 'type'
schema.def.options         // [schema1, schema2, ...]
```

## Promise 类型差异

```typescript
// v3 - type 属性
schema._def.type  // 内部模式

// v4 - innerType 属性
schema.def.innerType  // 内部模式
```

## 迁移时的注意事项

### 完全支持的功能

以下功能在两个版本中完全支持，输出一致：

- ✅ 所有基础类型
- ✅ 对象和嵌套结构
- ✅ 数组及其约束
- ✅ 联合类型和判别联合
- ✅ 可选、可空修饰符
- ✅ 默认值和 catch
- ✅ 枚举和字面量
- ✅ Record、Map、Set
- ✅ Tuple 和 rest

### 部分支持的功能

以下功能在 v4 中可能有限制：

- ⚠️ 字符串转换（trim, toLowerCase, toUpperCase）
- ⚠️ refine 检测
- ⚠️ brand 检测
- ⚠️ function.args()

### 无变化的 API

用户 API 完全相同，只需更换包：

```typescript
// 两个版本的 API 完全相同
import { serialize, generateModule, registerHandler } from '@zod-codepen/zod-v3';
import { serialize, generateModule, registerHandler } from '@zod-codepen/zod-v4';
```

## 性能考虑

v4 适配器需要检查多个路径来检测类型，但这对性能影响微乎其微。大多数序列化操作在毫秒级别完成。

## 最佳实践

1. **选择正确的包** - 根据项目的 Zod 版本选择对应的 zod-codepen 包
2. **测试迁移** - 如果从 v3 迁移到 v4，运行测试确保输出一致
3. **了解限制** - 了解 v4 的限制功能，必要时使用自定义处理器
