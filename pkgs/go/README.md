# zodval — Go Native Validator for Zod Schemas

A Go library that validates data against [Zod](https://zod.dev) schemas, **without needing JavaScript or a JS runtime**.

## How It Works

Instead of running a JavaScript VM to execute `Zod.parse()`, this library reads a **JSON AST** file exported by [zod-codepen](https://github.com/CornWorld/zod-codepen)'s TypeScript tools:

```
TypeScript (build time):
  Zod Schema → cast → IR → irToJson → schemas.json

Go (runtime):
  schemas.json → ParseDocument → ValidateSchema(input) → result
```

This eliminates the Goja JS VM overhead (1–5ms per validation) and replaces it with native Go validation (~microseconds).

## Quick Start

### 1. Export schemas from TypeScript

```typescript
import { generateSchemasFromSource } from "@zod-codepen/vite-plugin";

await generateSchemasFromSource({
  source: fs.readFileSync("./src/schemas.ts", "utf-8"),
  fileName: "./src/schemas.ts",
  rootDir: "./src",
  outputPath: "./generated/schemas.json",
  outputFormat: "json", // ← key option
});
```

### 2. Validate in Go

```go
package main

import (
    "os"
    "github.com/CornWorld/zod-codepen/pkgs/go"
)

func main() {
    data, _ := os.ReadFile("schemas.json")
    doc, err := zodval.ParseDocument(data)
    if err != nil {
        panic(err)
    }

    result := zodval.ValidateSchema(doc, "User", map[string]any{
        "id":    "abc",
        "name":  "Alice",
        "email": "alice@example.com",
    })

    if result.IsValid() {
        println("Valid!")
    } else {
        for _, e := range result.Errors {
            println(e.Error())
        }
    }
}
```

## API Reference

### `ParseDocument(data []byte) (*AstDocument, error)`

Parse a JSON AST file. Checks the `version` field for compatibility.

### `ParseNode(data []byte) (IRNode, error)`

Parse a single JSON AST node. Dispatches on the `kind` field.

### `ValidateSchema(doc *AstDocument, name string, input any) *ValidationResult`

Validate `input` against a named schema in the document. Returns a `*ValidationResult`.

### `ValidateNode(node IRNode, input any) *ValidationResult`

Validate `input` against a parsed IRNode directly.

### `ValidationResult`

```go
type ValidationResult struct {
    Errors []*ValidationError
}

func (r *ValidationResult) IsValid() bool
func (r *ValidationResult) First() *ValidationError
func (r *ValidationResult) Error() string
```

### `ValidationError`

```go
type ValidationError struct {
    Path     []string // e.g. ["user", "address", "city"]
    Code     string   // e.g. "invalid_type", "too_small"
    Message  string   // human-readable
    Expected string
    Received string
}
```

## Supported Schema Types

| Category             | Types                                                                                          |
| -------------------- | ---------------------------------------------------------------------------------------------- |
| **Primitives**       | string, number, bigint, boolean, date, null, undefined, void, any, unknown, never, nan, symbol |
| **Literals & Enums** | literal, enum, nativeEnum                                                                      |
| **Wrappers**         | optional, nullable, nullish, default, catch, readonly, brand, prefault                         |
| **Collections**      | array, object, record, map, set, tuple                                                         |
| **Union Types**      | union, discriminatedUnion, intersection                                                        |
| **Pipe**             | pipe (validates `in` only)                                                                     |
| **Lazy**             | lazy (with inner)                                                                              |
| **Promise**          | promise (sync validation of inner)                                                             |

### Constraint Support

**String**: min, max, length, email, url, uuid, regex, startsWith, endsWith, includes, nonempty, cuid, datetime, ip

**Number**: min, max, int, finite, positive, negative, nonnegative, nonpositive, multipleOf, safe

**Array/Set**: min, max, length, nonempty

**BigInt**: min, max, multipleOf

### Coerce Support

`z.coerce.string()`, `z.coerce.number()`, `z.coerce.boolean()`, `z.coerce.bigint()` — all supported with type-appropriate coercion.

### Unsupported (returns error)

Transform, refine, and preprocess schemas contain JavaScript functions that cannot be executed in Go. These return a clear `unsupported` validation error.

## License

MPL-2.0
