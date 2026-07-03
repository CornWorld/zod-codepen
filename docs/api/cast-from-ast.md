# castFromAst / castAllFromAst

> 把 TypeScript 源码静态解析成 IR 节点，不执行用户代码。

## 类型签名

```typescript
interface AstCastOptions {
  fileName?: string;
  onUnknown?: "raw" | "fallback" | "throw"; // 默认 'raw'
  resolver?: AstResolver; // 跨文件解析器
  sourceFile?: ts.SourceFile; // 内部复用
  zodRoots?: string[]; // 默认 ['z']
}

function castFromAst(
  source: string,
  exportName: string,
  opts?: AstCastOptions,
): IRNode;

function castAllFromAst(
  source: string,
  opts?: AstCastOptions,
): Array<{ name: string; ir: IRNode }>;
```

## 行为

### 入口识别

- `export const X = ...` ✅
- `export let X = ...` ✅
- `export { X }` ✅（若 X 在文件内定义）
- `export type X`、`export interface X`、`export function X` ❌（跳过）

### 支持的 schema 形态

- 13 种原语：`z.string/number/bigint/boolean/date/symbol/undefined/null/void/any/unknown/never/nan`
- 9 种集合：`z.array/set/object/tuple/record/map`
- 字面量与枚举：`z.literal/enum/nativeEnum`
- 联合与交集：`z.union/discriminatedUnion/intersection`
- 高级：`z.lazy/promise/function/pipe`
- 修饰符链：`optional/nullable/nullish/default/catch/brand/readonly/prefault`
- 约束链：`min/max/length/regex/email/url/int/positive/...`
- `z.coerce.*` 5 种
- 跨文件 import + spread `.shape`
- 包装函数内联（单层）

### onUnknown 处理

| 取值           | 行为                                     |
| -------------- | ---------------------------------------- |
| `'raw'` (默认) | 返回 `RawNode`，带 `reason` 字段说明原因 |
| `'fallback'`   | 返回 `FallbackNode`                      |
| `'throw'`      | 抛出错误                                 |

## AstResolver 接口

`AstResolver` 是 `ModuleResolver` 的视图接口：

```typescript
interface AstResolver {
  resolveSchema(
    specifier: string,
    exportName: string,
    fromFile: string,
    opts?: AstCastOptions,
  ): IRNode | { kind: "circular" } | undefined;

  resolveSpreadShape(
    baseExpr: ts.Expression,
    fromFile: string,
    opts?: AstCastOptions,
  ): ObjectField[] | undefined;

  resolveIdentifier(
    name: string,
    fromFile: string,
    fromSource: ts.SourceFile,
    opts?: AstCastOptions,
  ): IRNode | undefined;
}
```

用 `makeAstResolver(moduleResolver)` 构造实例。

## 示例

### 单 export

```typescript
const ir = castFromAst(
  `export const User = z.object({ id: z.number() });`,
  "User",
);
// ir.kind === 'object'
```

### 全部 export

```typescript
const src = `
  export const A = z.string();
  export const B = z.number().int();
  const _internal = z.any();
  export type T = typeof A;
`;
const results = castAllFromAst(src);
// [{ name: 'A', ir: ... }, { name: 'B', ir: ... }]
// _internal 和 T 不在结果里
```

### 跨文件 + 自定义 onUnknown

```typescript
import {
  ModuleResolver,
  makeAstResolver,
  castFromAst,
} from "@zod-codepen/core";

const resolver = new ModuleResolver(process.cwd());
const ir = castFromAst(source, "User", {
  resolver: makeAstResolver(resolver),
  onUnknown: "throw",
});
```

## 与 castFromZod 的差异

| 维度                 | castFromZod           | castFromAst            |
| -------------------- | --------------------- | ---------------------- |
| 输入                 | 运行时 Zod 对象       | TS 源码字符串          |
| 需要 import 用户代码 | 是                    | 否                     |
| 支持重运行时依赖     | 否（导入会失败）      | 是                     |
| 版本中立             | 通过 adapter          | 完全中立               |
| 性能                 | 直接读对象，快        | 编译 AST，约 50ms 启动 |
| 不识别的 schema      | 返回 `z.any()` 字符串 | `RawNode` 或抛错       |

两条路径都产出相同的 IRNode 结构，可互换地喂给 `codegen`。

## 错误恢复

`castFromAst` 不会因为单个 schema 解析失败而中止。在 `castAllFromAst` 中，失败的 schema 会以 `RawNode` 或 `FallbackNode` 出现在结果里 —— 调用方可以决定跳过、警告、或抛错。

```typescript
const results = castAllFromAst(src);
const valid = results.filter(
  ({ ir }) => ir.kind !== "raw" && ir.kind !== "fallback",
);
```

## 相关 API

- [`extractSchemaExports`](./cast-from-ast.md#extractschemaexports) — 列出 export，不构造 IR
- [`ModuleResolver`](./cast-from-ast.md#moduleresolver) — 跨文件解析器
- [`codegen`](./serialize.md) — IR → 代码字符串
