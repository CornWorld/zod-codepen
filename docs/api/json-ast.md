# JSON AST Format Specification

## Overview

The JSON AST is a structured, machine-readable representation of Zod schemas produced by the IR layer. Unlike codegen, which produces TypeScript source strings (`z.string().min(5)`), the JSON AST produces a JSON-compatible object tree that downstream tools (e.g. a Go native validator) can consume without needing to run JavaScript or parse TypeScript.

The JSON AST is **always roundtrippable through `JSON.stringify`/`JSON.parse`**: no functions, no `undefined`, no `bigint`, no `RegExp` appear in the output.

## Top-Level Document Structure

```json
{
  "version": 1,
  "schemas": {
    "User": { "kind": "object", "fields": [...], "unknownMode": "strip" },
    "Post": { "kind": "object", "fields": [...], "unknownMode": "strip" }
  }
}
```

| Field     | Type                      | Description                         |
| --------- | ------------------------- | ----------------------------------- |
| `version` | `number`                  | Format version. Currently `1`.      |
| `schemas` | `Record<string, unknown>` | Map of schema name → JSON AST node. |

### API

```typescript
import { irToJson, schemasToJson, AST_JSON_VERSION } from "@zod-codepen/core";

// Serialize a single IR node
const jsonNode = irToJson(irNode);

// Serialize multiple named schemas
const doc = schemasToJson([
  { name: "User", ir: userIrNode },
  { name: "Post", ir: postIrNode },
]);
// { version: 1, schemas: { User: {...}, Post: {...} } }
```

## Node Types

Each node is a JSON object with a `kind` field that matches the IR node's discriminant.

### `primitive`

A basic Zod primitive schema with optional coerce flag and constraints.

```json
{
  "kind": "primitive",
  "primitive": "string",
  "coerce": true,
  "constraints": [
    {
      "kind": "constraint",
      "target": "string",
      "name": "email",
      "params": {}
    }
  ]
}
```

| Field         | Type               | Required | Description                                                                                                                                                |
| ------------- | ------------------ | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `primitive`   | `PrimitiveName`    | yes      | One of: `"string"`, `"number"`, `"bigint"`, `"boolean"`, `"date"`, `"symbol"`, `"null"`, `"undefined"`, `"any"`, `"unknown"`, `"never"`, `"void"`, `"nan"` |
| `coerce`      | `boolean`          | no       | Whether this is `z.coerce.X()`. Omitted when `undefined`.                                                                                                  |
| `constraints` | `ConstraintNode[]` | yes      | Ordered chain of constraints.                                                                                                                              |

### `constraint`

A validation constraint attached to a `primitive`, `array`, or `set` node.

```json
{
  "kind": "constraint",
  "target": "string",
  "name": "min",
  "params": {
    "value": 3
  }
}
```

| Field    | Type               | Required | Description                                                                                      |
| -------- | ------------------ | -------- | ------------------------------------------------------------------------------------------------ |
| `target` | `ConstraintTarget` | yes      | Type the constraint applies to: `"string"`, `"number"`, `"bigint"`, `"array"`, `"date"`, `"set"` |
| `name`   | `string`           | yes      | Constraint name: `"min"`, `"max"`, `"length"`, `"email"`, `"url"`, `"regex"`, etc.               |
| `params` | `ConstraintParams` | yes      | Constraint parameters.                                                                           |

`params` fields (all optional — omitted when `undefined`):

| Field       | Type                            | Description                     |
| ----------- | ------------------------------- | ------------------------------- |
| `value`     | `unknown`                       | Primary value (e.g. min/max).   |
| `minimum`   | `number` \| `{"_bigint":"..."}` | Minimum bound.                  |
| `maximum`   | `number` \| `{"_bigint":"..."}` | Maximum bound.                  |
| `inclusive` | `boolean`                       | Whether the bound is inclusive. |
| `regex`     | `{"_regex":"/.../..."}`         | Regular expression pattern.     |

### `modified`

A wrapper that applies modifiers (optional, nullable, default, etc.) to an inner node.

```json
{
  "kind": "modified",
  "inner": { "kind": "primitive", "primitive": "string", "constraints": [] },
  "modifiers": [
    { "kind": "modifier", "name": "optional" },
    { "kind": "modifier", "name": "default", "value": "hello" }
  ]
}
```

| Field       | Type             | Required | Description                                   |
| ----------- | ---------------- | -------- | --------------------------------------------- |
| `inner`     | (any node)       | yes      | The inner node being modified.                |
| `modifiers` | `ModifierNode[]` | yes      | Ordered chain of modifiers (innermost first). |

### `modifier`

A single modifier in a chain.

```json
{ "kind": "modifier", "name": "optional" }
{ "kind": "modifier", "name": "default", "value": "hello" }
{ "kind": "modifier", "name": "default", "placeholder": "<complex>" }
```

| Field         | Type           | Required | Description                                                                                                    |
| ------------- | -------------- | -------- | -------------------------------------------------------------------------------------------------------------- |
| `name`        | `ModifierName` | yes      | One of: `"optional"`, `"nullable"`, `"nullish"`, `"default"`, `"catch"`, `"brand"`, `"readonly"`, `"prefault"` |
| `value`       | `unknown`      | no       | Literal value (e.g. default value). Encoded via special rules. Omitted if `undefined`.                         |
| `placeholder` | `string`       | no       | Placeholder string when value can't be reconstructed. Omitted if `undefined`.                                  |

### `literal`

A Zod literal value.

```json
{ "kind": "literal", "value": "hello" }
{ "kind": "literal", "value": 42 }
{ "kind": "literal", "value": true }
{ "kind": "literal", "value": null }
{ "kind": "literal", "value": { "_bigint": "123" } }
```

| Field   | Type      | Required | Description                                   |
| ------- | --------- | -------- | --------------------------------------------- |
| `value` | `unknown` | yes      | The literal value, encoded via special rules. |

### `enum`

A Zod enum or discriminated union variant.

```json
{
  "kind": "enum",
  "variant": "enum",
  "values": ["foo", "bar", "baz"]
}
```

With discriminator:

```json
{
  "kind": "enum",
  "variant": "enum",
  "values": ["a", "b"],
  "discriminator": "type",
  "options": [
    { "kind": "object", "fields": [...], "unknownMode": "strip" }
  ]
}
```

| Field           | Type                     | Required | Description                                                     |
| --------------- | ------------------------ | -------- | --------------------------------------------------------------- |
| `variant`       | `"enum" \| "nativeEnum"` | yes      | Enum variant.                                                   |
| `values`        | `string[]`               | yes      | Enum values.                                                    |
| `discriminator` | `string`                 | no       | v4-style discriminator key. Omitted if `undefined`.             |
| `options`       | `IRNode[]`               | no       | Option nodes when discriminator is set. Omitted if `undefined`. |

### `array`

A Zod array schema.

```json
{
  "kind": "array",
  "element": { "kind": "primitive", "primitive": "string", "constraints": [] },
  "constraints": [
    {
      "kind": "constraint",
      "target": "array",
      "name": "min",
      "params": { "value": 1 }
    },
    {
      "kind": "constraint",
      "target": "array",
      "name": "max",
      "params": { "value": 10 }
    }
  ]
}
```

| Field         | Type               | Required | Description              |
| ------------- | ------------------ | -------- | ------------------------ |
| `element`     | (any node)         | yes      | Element type.            |
| `constraints` | `ConstraintNode[]` | yes      | Array-level constraints. |

### `object`

A Zod object schema.

```json
{
  "kind": "object",
  "fields": [
    {
      "key": "name",
      "value": { "kind": "primitive", "primitive": "string", "constraints": [] }
    },
    {
      "key": "age",
      "value": { "kind": "primitive", "primitive": "number", "constraints": [] }
    }
  ],
  "unknownMode": "strip",
  "catchall": { "kind": "primitive", "primitive": "string", "constraints": [] }
}
```

| Field         | Type                                   | Required | Description                                                |
| ------------- | -------------------------------------- | -------- | ---------------------------------------------------------- |
| `fields`      | `{key: string, value: node}[]`         | yes      | Object fields with keys and value schemas.                 |
| `unknownMode` | `"strip" \| "strict" \| "passthrough"` | yes      | Unknown key handling mode.                                 |
| `catchall`    | (any node)                             | no       | Catch-all schema for unknown keys. Omitted if `undefined`. |

### `tuple`

A Zod tuple schema.

```json
{
  "kind": "tuple",
  "items": [
    { "kind": "primitive", "primitive": "string", "constraints": [] },
    { "kind": "primitive", "primitive": "number", "constraints": [] }
  ],
  "rest": { "kind": "primitive", "primitive": "string", "constraints": [] }
}
```

| Field   | Type         | Required | Description                                |
| ------- | ------------ | -------- | ------------------------------------------ |
| `items` | (any node)[] | yes      | Positional tuple items.                    |
| `rest`  | (any node)   | no       | Rest element type. Omitted if `undefined`. |

### `record`

A Zod record schema.

```json
{
  "kind": "record",
  "key": { "kind": "primitive", "primitive": "string", "constraints": [] },
  "value": { "kind": "primitive", "primitive": "number", "constraints": [] }
}
```

| Field   | Type       | Required | Description   |
| ------- | ---------- | -------- | ------------- |
| `key`   | (any node) | yes      | Key schema.   |
| `value` | (any node) | yes      | Value schema. |

### `map`

A Zod map schema.

```json
{
  "kind": "map",
  "key": { "kind": "primitive", "primitive": "string", "constraints": [] },
  "value": { "kind": "primitive", "primitive": "number", "constraints": [] }
}
```

| Field   | Type       | Required | Description   |
| ------- | ---------- | -------- | ------------- |
| `key`   | (any node) | yes      | Key schema.   |
| `value` | (any node) | yes      | Value schema. |

### `set`

A Zod set schema.

```json
{
  "kind": "set",
  "element": { "kind": "primitive", "primitive": "string", "constraints": [] },
  "constraints": [
    {
      "kind": "constraint",
      "target": "set",
      "name": "min",
      "params": { "value": 1 }
    }
  ]
}
```

| Field         | Type               | Required | Description            |
| ------------- | ------------------ | -------- | ---------------------- |
| `element`     | (any node)         | yes      | Element type.          |
| `constraints` | `ConstraintNode[]` | yes      | Set-level constraints. |

### `union`

A Zod union or discriminated union.

```json
{
  "kind": "union",
  "options": [
    { "kind": "primitive", "primitive": "string", "constraints": [] },
    { "kind": "primitive", "primitive": "number", "constraints": [] }
  ]
}
```

With discriminator:

```json
{
  "kind": "union",
  "options": [...],
  "discriminator": "type"
}
```

| Field           | Type         | Required | Description                                                         |
| --------------- | ------------ | -------- | ------------------------------------------------------------------- |
| `options`       | (any node)[] | yes      | Union member schemas.                                               |
| `discriminator` | `string`     | no       | Discriminator key for discriminated unions. Omitted if `undefined`. |

### `intersection`

A Zod intersection schema.

```json
{
  "kind": "intersection",
  "left": { "kind": "primitive", "primitive": "string", "constraints": [] },
  "right": { "kind": "object", "fields": [...], "unknownMode": "strip" }
}
```

| Field   | Type       | Required | Description    |
| ------- | ---------- | -------- | -------------- |
| `left`  | (any node) | yes      | Left operand.  |
| `right` | (any node) | yes      | Right operand. |

### `function`

An opaque function node. Used as the `fn` field in `transform`, `refine`, `preprocess`, or as a standalone node.

```json
{
  "kind": "function",
  "usage": "transform",
  "mode": "placeholder"
}
```

With inline source:

```json
{
  "kind": "function",
  "usage": "transform",
  "mode": "inline",
  "source": "(x) => Number(x)",
  "vars": ["x"]
}
```

| Field    | Type                                                                               | Required | Description                                                  |
| -------- | ---------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------ |
| `usage`  | `"transform" \| "refine" \| "preprocess" \| "function-args" \| "function-returns"` | yes      | Where the function is used.                                  |
| `mode`   | `"placeholder" \| "inline" \| "marked"`                                            | yes      | Function rendering mode.                                     |
| `source` | `string`                                                                           | no       | Source code when mode is `"inline"`. Omitted if `undefined`. |
| `vars`   | `string[]`                                                                         | no       | Variable names when available. Omitted if `undefined`.       |

### `transform`

A Zod transform schema.

```json
{
  "kind": "transform",
  "inner": { "kind": "primitive", "primitive": "string", "constraints": [] },
  "fn": { "kind": "function", "usage": "transform", "mode": "placeholder" }
}
```

| Field   | Type            | Required | Description         |
| ------- | --------------- | -------- | ------------------- |
| `inner` | (any node)      | yes      | Input schema.       |
| `fn`    | `function` node | yes      | Transform function. |

### `refine`

A Zod refine schema.

```json
{
  "kind": "refine",
  "inner": { "kind": "primitive", "primitive": "string", "constraints": [] },
  "fn": { "kind": "function", "usage": "refine", "mode": "placeholder" }
}
```

| Field   | Type            | Required | Description          |
| ------- | --------------- | -------- | -------------------- |
| `inner` | (any node)      | yes      | Input schema.        |
| `fn`    | `function` node | yes      | Refinement function. |

### `preprocess`

A Zod preprocess schema.

```json
{
  "kind": "preprocess",
  "inner": { "kind": "primitive", "primitive": "string", "constraints": [] },
  "fn": { "kind": "function", "usage": "preprocess", "mode": "placeholder" }
}
```

| Field   | Type            | Required | Description          |
| ------- | --------------- | -------- | -------------------- |
| `inner` | (any node)      | yes      | Output schema.       |
| `fn`    | `function` node | yes      | Preprocess function. |

### `pipe`

A Zod pipe schema.

```json
{
  "kind": "pipe",
  "in": { "kind": "primitive", "primitive": "string", "constraints": [] },
  "out": { "kind": "primitive", "primitive": "number", "constraints": [] }
}
```

| Field | Type       | Required | Description    |
| ----- | ---------- | -------- | -------------- |
| `in`  | (any node) | yes      | Input schema.  |
| `out` | (any node) | yes      | Output schema. |

### `zod-function`

A `z.function()` schema.

```json
{
  "kind": "zod-function",
  "args": [{ "kind": "primitive", "primitive": "string", "constraints": [] }],
  "returns": { "kind": "primitive", "primitive": "number", "constraints": [] }
}
```

| Field     | Type         | Required | Description                                 |
| --------- | ------------ | -------- | ------------------------------------------- |
| `args`    | (any node)[] | yes      | Function argument schemas.                  |
| `returns` | (any node)   | no       | Return type schema. Omitted if `undefined`. |

### `lazy`

A Zod lazy schema.

```json
{ "kind": "lazy", "placeholder": true }
```

With inner:

```json
{
  "kind": "lazy",
  "placeholder": false,
  "inner": { "kind": "primitive", "primitive": "string", "constraints": [] }
}
```

| Field         | Type       | Required | Description                                       |
| ------------- | ---------- | -------- | ------------------------------------------------- |
| `placeholder` | `boolean`  | yes      | Whether this is a circular-reference placeholder. |
| `inner`       | (any node) | no       | Inner schema. Omitted if `undefined`.             |

### `promise`

A Zod promise schema.

```json
{
  "kind": "promise",
  "inner": { "kind": "primitive", "primitive": "string", "constraints": [] }
}
```

| Field   | Type       | Required | Description   |
| ------- | ---------- | -------- | ------------- |
| `inner` | (any node) | yes      | Inner schema. |

### `fallback`

A sentinel for schemas that failed to cast.

```json
{ "kind": "fallback", "reason": "not-a-zod-schema" }
```

With detail:

```json
{ "kind": "fallback", "reason": "unhandled", "detail": "z.custom" }
```

| Field    | Type                                                  | Required | Description                                |
| -------- | ----------------------------------------------------- | -------- | ------------------------------------------ |
| `reason` | `"not-a-zod-schema" \| "unknown-type" \| "unhandled"` | yes      | Why the cast failed.                       |
| `detail` | `string`                                              | no       | Additional detail. Omitted if `undefined`. |

### `raw`

An escape hatch for schemas whose shape doesn't yet map cleanly to a typed IR node.

```json
{
  "kind": "raw",
  "code": "z.custom(someCheck)",
  "reason": "custom-type"
}
```

| Field    | Type     | Required | Description                       |
| -------- | -------- | -------- | --------------------------------- |
| `code`   | `string` | yes      | Pre-rendered code string.         |
| `reason` | `string` | yes      | Why the node was diverted to raw. |

> **Note:** The `original` field (present on `RawNode` for debugging) is intentionally **omitted** from JSON AST output. It may contain non-serializable values.

## Special Value Encoding

Values that are not directly representable in JSON are encoded into compatible wrapper objects.

### BigInt

`bigint` values are encoded as:

```json
{ "_bigint": "<string-representation>" }
```

**Example:** `100n` → `{"_bigint": "100"}`

Applies to:

- `LiteralNode.value` (bigint literal)
- `ConstraintParams.minimum` / `ConstraintParams.maximum` (bigint constraints)
- `ModifierNode.value` (bigint default)

### RegExp

`RegExp` values are encoded using `regex.toString()`:

```json
{ "_regex": "/pattern/flags" }
```

**Example:** `/^[a-z]+$/i` → `{"_regex": "/^[a-z]+$/i"}`

Applies to:

- `LiteralNode.value` (regex literal)
- `ConstraintParams.regex`

### undefined

`undefined` values are **omitted** from the output entirely. If a field's value is `undefined`, the entire key is not included in the JSON object.

This applies to all optional fields across all node types.

### Unsupported values

Function and Symbol values are encoded as:

```json
{ "_unsupported": "function" }
{ "_unsupported": "symbol" }
```

These appear in `LiteralNode.value` when a literal wraps a function or symbol.

### NaN and Infinity

`NaN`, `Infinity`, and `-Infinity` are not valid JSON (`JSON.stringify` silently converts them to `null`). They are encoded as:

```json
{ "_nan": true }
{ "_infinity": 1 }
{ "_infinity": -1 }
```

### Fallback for other types

Values whose `typeof` is not string/number/boolean are serialized via `JSON.parse(JSON.stringify(value))`. If that fails (e.g. circular references), the value is encoded as `{"_unsupported": "<typeof>"}`.

## Versioning Policy

The `version` field in the top-level document tracks the JSON AST format version. Any breaking change to the format (new fields, changed field meanings, removed node types) will increment this number.

**Current version:** `1`

### Compatibility guarantees

- **Forward compatibility:** Consumers should check the `version` field and reject documents with unknown versions rather than attempting to parse them.
- **Backward compatibility:** When the version is incremented, all existing version-1 consumers should continue to work; the new version represents an opt-in upgrade.
- **Node additions:** Adding new node `kind` values does not require a version bump if existing nodes are unchanged.
- **Field additions:** Adding new optional fields to existing nodes does not require a version bump — consumers should use `?` accessors for optional fields.

## Usage with Vite Plugin

The `@zod-codepen/vite-plugin` package supports JSON AST output via the `outputFormat` option in `generateSchemasFromSource`:

```typescript
import { generateSchemasFromSource } from "@zod-codepen/vite-plugin";

// Generate JSON AST for a Go backend
await generateSchemasFromSource({
  source: fs.readFileSync("./src/schemas.ts", "utf-8"),
  fileName: "./src/schemas.ts",
  outputPath: "./generated/schemas.json",
  outputFormat: "json", // <-- key option
});
```

The JSON output uses the same format documented above. The `version` field allows downstream consumers to handle format evolution — consumers should check the version before parsing and reject unknown versions.
