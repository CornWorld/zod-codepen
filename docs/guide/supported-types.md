# 支持的类型

zod-codepen 支持 40+ 种 Zod 模式类型。本文档列出所有支持的类型及其序列化结果。

## 基础类型

| 类型 | Zod 代码 | 序列化结果 |
|------|----------|------------|
| String | `z.string()` | `'z.string()'` |
| Number | `z.number()` | `'z.number()'` |
| Boolean | `z.boolean()` | `'z.boolean()'` |
| BigInt | `z.bigint()` | `'z.bigint()'` |
| Date | `z.date()` | `'z.date()'` |
| Undefined | `z.undefined()` | `'z.undefined()'` |
| Null | `z.null()` | `'z.null()'` |
| Void | `z.void()` | `'z.void()'` |
| Any | `z.any()` | `'z.any()'` |
| Unknown | `z.unknown()` | `'z.unknown()'` |
| Never | `z.never()` | `'z.never()'` |
| NaN | `z.nan()` | `'z.nan()'` |
| Symbol | `z.symbol()` | `'z.symbol()'` |

## 字面量和枚举

| 类型 | Zod 代码 | 序列化结果 |
|------|----------|------------|
| String Literal | `z.literal('hello')` | `'z.literal("hello")'` |
| Number Literal | `z.literal(42)` | `'z.literal(42)'` |
| Boolean Literal | `z.literal(true)` | `'z.literal(true)'` |
| Enum | `z.enum(['a', 'b'])` | `'z.enum(["a", "b"])'` |
| Native Enum | `z.nativeEnum(Status)` | `'z.nativeEnum(/* native enum */)'` |

## 字符串约束

| 约束 | Zod 代码 | 序列化结果 |
|------|----------|------------|
| Min Length | `z.string().min(5)` | `'z.string().min(5)'` |
| Max Length | `z.string().max(100)` | `'z.string().max(100)'` |
| Exact Length | `z.string().length(10)` | `'z.string().length(10)'` |
| Email | `z.string().email()` | `'z.string().email()'` |
| URL | `z.string().url()` | `'z.string().url()'` |
| UUID | `z.string().uuid()` | `'z.string().uuid()'` |
| CUID | `z.string().cuid()` | `'z.string().cuid()'` |
| CUID2 | `z.string().cuid2()` | `'z.string().cuid2()'` |
| ULID | `z.string().ulid()` | `'z.string().ulid()'` |
| DateTime | `z.string().datetime()` | `'z.string().datetime()'` |
| IP | `z.string().ip()` | `'z.string().ip()'` |
| Emoji | `z.string().emoji()` | `'z.string().emoji()'` |
| Regex | `z.string().regex(/^a/)` | `'z.string().regex(/^a/)'` |
| Starts With | `z.string().startsWith('hi')` | `'z.string().startsWith("hi")'` |
| Ends With | `z.string().endsWith('!')` | `'z.string().endsWith("!")'` |
| Includes | `z.string().includes('test')` | `'z.string().includes("test")'` |
| Trim | `z.string().trim()` | `'z.string().trim()'` |
| To Lower | `z.string().toLowerCase()` | `'z.string().toLowerCase()'` |
| To Upper | `z.string().toUpperCase()` | `'z.string().toUpperCase()'` |

## 数字约束

| 约束 | Zod 代码 | 序列化结果 |
|------|----------|------------|
| Min (> 0) | `z.number().min(0)` | `'z.number().nonnegative()'` |
| Min (> n) | `z.number().min(5)` | `'z.number().min(5)'` |
| Max | `z.number().max(100)` | `'z.number().max(100)'` |
| Positive | `z.number().positive()` | `'z.number().positive()'` |
| Negative | `z.number().negative()` | `'z.number().negative()'` |
| Nonnegative | `z.number().nonnegative()` | `'z.number().nonnegative()'` |
| Nonpositive | `z.number().nonpositive()` | `'z.number().nonpositive()'` |
| Integer | `z.number().int()` | `'z.number().int()'` |
| Finite | `z.number().finite()` | `'z.number().finite()'` |
| Safe | `z.number().safe()` | `'z.number().safe()'` |
| Multiple Of | `z.number().multipleOf(5)` | `'z.number().multipleOf(5)'` |

## BigInt 约束

| 约束 | Zod 代码 | 序列化结果 |
|------|----------|------------|
| Min | `z.bigint().min(0n)` | `'z.bigint().min(0n)'` |
| Max | `z.bigint().max(100n)` | `'z.bigint().max(100n)'` |
| Positive | `z.bigint().positive()` | `'z.bigint().positive()'` |
| Negative | `z.bigint().negative()` | `'z.bigint().negative()'` |

## Date 约束

| 约束 | Zod 代码 | 序列化结果 |
|------|----------|------------|
| Min | `z.date().min(new Date())` | `'z.date().min(/* Date */)'` |
| Max | `z.date().max(new Date())` | `'z.date().max(/* Date */)'` |

## 集合类型

| 类型 | Zod 代码 | 序列化结果 |
|------|----------|------------|
| Array | `z.array(z.string())` | `'z.array(z.string())'` |
| Array Min | `z.array(z.string()).min(1)` | `'z.array(z.string()).min(1)'` |
| Array Max | `z.array(z.string()).max(10)` | `'z.array(z.string()).max(10)'` |
| Array Nonempty | `z.array(z.string()).nonempty()` | `'z.array(z.string()).nonempty()'` |
| Object | `z.object({ a: z.string() })` | 多行格式化输出 |
| Record | `z.record(z.string(), z.number())` | `'z.record(z.string(), z.number())'` |
| Map | `z.map(z.string(), z.number())` | `'z.map(z.string(), z.number())'` |
| Set | `z.set(z.string())` | `'z.set(z.string())'` |
| Set Min | `z.set(z.string()).min(1)` | `'z.set(z.string()).min(1)'` |
| Set Max | `z.set(z.string()).max(10)` | `'z.set(z.string()).max(10)'` |
| Tuple | `z.tuple([z.string(), z.number()])` | `'z.tuple([z.string(), z.number()])'` |
| Tuple Rest | `z.tuple([z.string()]).rest(z.number())` | `'z.tuple([z.string()]).rest(z.number())'` |

## 对象修饰符

| 修饰符 | Zod 代码 | 序列化结果 |
|--------|----------|------------|
| Partial | `z.object({...}).partial()` | `'z.object({...}).partial()'` |
| Required | `z.object({...}).required()` | `'z.object({...}).required()'` |
| Passthrough | `z.object({}).passthrough()` | `'z.object({}).passthrough()'` |
| Strict | `z.object({}).strict()` | `'z.object({}).strict()'` |
| Pick | `z.object({...}).pick({ a: true })` | `'z.object({...}).pick({ a: true })'` |
| Omit | `z.object({...}).omit({ a: true })` | `'z.object({...}).omit({ a: true })'` |
| Extend | `z.object({}).extend({ b: z.number() })` | `'z.object({...})'` |
| Merge | `schema1.merge(schema2)` | `'z.object({...})'` |

## 联合类型

| 类型 | Zod 代码 | 序列化结果 |
|------|----------|------------|
| Union | `z.union([z.string(), z.number()])` | `'z.union([z.string(), z.number()])'` |
| Discriminated Union | `z.discriminatedUnion('type', [...])` | `'z.discriminatedUnion("type", [...])'` |
| Intersection | `z.intersection(a, b)` | `'z.intersection(a, b)'` |

## 包装器

| 类型 | Zod 代码 | 序列化结果 |
|------|----------|------------|
| Optional | `z.string().optional()` | `'z.string().optional()'` |
| Nullable | `z.string().nullable()` | `'z.string().nullable()'` |
| Nullish | `z.string().nullish()` | `'z.string().nullable().optional()'` |
| Default | `z.string().default('hi')` | `'z.string().default("hi")'` |
| Catch | `z.string().catch('fallback')` | `'z.string().catch("fallback")'` |
| Readonly | `z.object({}).readonly()` | `'z.object({}).readonly()'` |
| Branded | `z.string().brand<'Id'>()` | `'z.string().brand()'` |

## 效果器

| 类型 | Zod 代码 | 序列化结果 |
|------|----------|------------|
| Refine | `z.string().refine(fn)` | `'z.string().refine(/* function */)'` |
| SuperRefine | `z.string().superRefine(fn)` | `'z.string().superRefine(/* function */)'` |
| Transform | `z.string().transform(fn)` | `'z.string().transform(/* function */)'` |
| Preprocess | `z.preprocess(fn, z.string())` | `'z.preprocess(/* function */, z.string())'` |
| Pipe | `z.string().pipe(z.number())` | `'z.string().pipe(z.number())'` |

## 其他类型

| 类型 | Zod 代码 | 序列化结果 |
|------|----------|------------|
| Promise | `z.promise(z.string())` | `'z.promise(z.string())'` |
| Function | `z.function()` | `'z.function()'` |
| Function with Args | `z.function().args(z.string())` | `'z.function().args(z.string())'` |
| Function with Returns | `z.function().returns(z.number())` | `'z.function().returns(z.number())'` |
| Lazy | `z.lazy(() => z.string())` | `'z.lazy(() => /* ... */)'` |
| instanceof | `z.instanceof(Date)` | `'z.instanceof(/* class */)'` |
| Custom | `z.custom()` | `'z.custom()'` |

## 强制转换

| 类型 | Zod 代码 | 序列化结果 |
|------|----------|------------|
| Coerce String | `z.coerce.string()` | `'z.coerce.string()'` |
| Coerce Number | `z.coerce.number()` | `'z.coerce.number()'` |
| Coerce Boolean | `z.coerce.boolean()` | `'z.coerce.boolean()'` |
| Coerce BigInt | `z.coerce.bigint()` | `'z.coerce.bigint()'` |
| Coerce Date | `z.coerce.date()` | `'z.coerce.date()'` |

## 限制说明

### 不可序列化的内容

以下内容无法完全序列化，会用占位符表示：

- **函数体** - `/* function */`
- **类引用** - `/* class */`
- **原生枚举** - `/* native enum */`
- **惰性模式内容** - `/* ... */`

### v4 限制

在 Zod v4 中，以下功能可能无法正确序列化：

- 字符串转换（trim, toLowerCase, toUpperCase）
- refine 检测
- brand 检测
- function.args()
