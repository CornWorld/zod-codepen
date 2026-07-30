# QA Review Report — zod-codepen Adapters & Vite Plugin

**Reviewer:** qa-adapters  
**Date:** 2026-07-29  
**Scope:** 5 files across 3 packages (zod-v3, zod-v4, vite-plugin)

---

## OVERVIEW

| File                            | Lines | Verdict           |
| ------------------------------- | ----- | ----------------- |
| `pkgs/zod-v3/src/index.ts`      | 34    | ✅ PASS           |
| `pkgs/zod-v3/src/adapter.ts`    | 50    | ⚠️ NEEDS REVISION |
| `pkgs/zod-v4/src/index.ts`      | 34    | ✅ PASS           |
| `pkgs/zod-v4/src/adapter.ts`    | 122   | ⚠️ NEEDS REVISION |
| `pkgs/vite-plugin/src/index.ts` | 746   | ⚠️ NEEDS REVISION |

---

## 🔴 CRITICAL ISSUES (Must Fix Before Merge)

### C1. [vite-plugin] Inline v4 `isZodSchema` is too permissive — false positive risk

**File:** `pkgs/vite-plugin/src/index.ts:176`  
**Severity: CRITICAL**

The inline `createZodV4Adapter().isZodSchema` returns `true` for **any** object with a truthy `_zod` property. The dedicated `zod-v4` adapter package requires the full `_zod.def.type` chain — a much stricter check. This means a non-Zod object like `{ _zod: { foo: 1 } }` is incorrectly accepted by the inline adapter.

### C2. [vite-plugin] Inline v4 `getDef` is missing the `schema.def` fallback path

**File:** `pkgs/vite-plugin/src/index.ts:152-168`  
**Severity: CRITICAL**

The inline `getDef` checks `_zod.def` → `_def`, but **skips** `schema.def` (v4 classic direct property). Zod v4 classic schemas expose their definition at `schema.def` — the inline adapter falls through to `schema._def` (v3 compat), getting a wrong/incomplete definition object.

### C3. [vite-plugin] Inline v4 `getType` ordering differs and is missing `schema.def.type`

**File:** `pkgs/vite-plugin/src/index.ts:125-151`  
**Severity: CRITICAL**

Priority cascade differs between the inline and package adapters. A v4 classic schema with both `schema.type` and `_zod.def.type` may get different `getType` results depending on which adapter is used. The inline version is also missing the `schema.def.type` fallback path.

### C4. [vite-plugin] `generateSchemas` always emits `import { z } from 'zod'` ignoring `zodVersion: "v4"`

**File:** `pkgs/vite-plugin/src/index.ts:325`  
**Severity: CRITICAL**

`generateSchemas` hardcodes `import { z } from 'zod'` regardless of `zodVersion`. For Zod v4, the correct import is `'zod/v4'`. The sister function `generateSchemasFromSource` (line 601) correctly uses `'zod/v4'` for v4. This means generated files from `generateSchemas` with `zodVersion: "v4"` will import from the wrong package path.

### C5. [vite-plugin] `zodDecoupling.buildStart` silently swallows errors (no re-throw)

**File:** `pkgs/vite-plugin/src/index.ts:463-465`  
**Severity: CRITICAL**

Error logged but **not re-thrown** — build continues with stale or absent generated file. Compare with `zodDecouplingStatic` (line 714) which **correctly re-throws**. Inconsistent and dangerous: silent failures produce mystifying runtime errors downstream.

### C6. [vite-plugin] All three plugins' `config` hook overwrites user's `resolve.alias`

**Files:** `pkgs/vite-plugin/src/index.ts:395-400, 472-477, 722-728`  
**Severity: CRITICAL**

Returning `resolve: { alias: { [aliasFrom]: aliasToResolved } }` in the `config` hook **replaces all user-configured aliases**. Vite merges `resolve` shallowly. Users' custom aliases (e.g., `@/` → `./src/`) are silently dropped.

### C7. [zod-v4/adapter] v3 compatibility fallback causes silent false positives

**File:** `pkgs/zod-v4/src/adapter.ts:50-57, 80-83, 109-115`  
**Severity: CRITICAL**

The v3 fallback in the v4 adapter (checking `_def.typeName`) means a v3 schema silently passes `isZodSchema`. Then `getDef` returns `_def` (v3 structure) but `getType` normalizes the type name. The type and def are **desynchronized** — downstream handlers accessing `def.type` find `undefined`. This produces corrupted serialization output with no error or warning.

### C8. [vite-plugin] `codegen()` call in TS output path not wrapped in try-catch

**File:** `pkgs/vite-plugin/src/index.ts:619`  
**Severity: CRITICAL**

If `codegen()` throws for any single schema, the entire generation fails. Compare with `generateSchemas` (lines 331-343) where each serialization is individually try-caught with `z.any()` fallback. Inconsistent and fragile.

---

## 🟠 MAJOR ISSUES (Should Fix)

### M1. [zod-v3/adapter] Code duplication with vite-plugin inline adapter

**File:** `pkgs/zod-v3/src/adapter.ts:12-47` ↔ `pkgs/vite-plugin/src/index.ts:196-237`  
**Severity: MAJOR**

`createZodV3Adapter()` in the vite-plugin is a line-for-line duplicate of `zodV3Adapter`. Every fix must be applied twice — guaranteed divergence.

### M2. [vite-plugin] Full adapter code duplication (116 lines)

**File:** `pkgs/vite-plugin/src/index.ts:122-237`  
**Severity: MAJOR**

Both `createZodV4Adapter()` and `createZodV3Adapter()` are duplicates of the dedicated adapter packages. Root cause of C1-C3.

### M3. [zod-v3/adapter] `this` context fragility — methods break on extraction

**File:** `pkgs/zod-v3/src/adapter.ts:16,28`  
**Severity: MAJOR**

`getType` and `getDef` use `this.isZodSchema(schema)`. If any method is extracted from the adapter object (e.g., `const { getType } = zodV3Adapter`), it crashes with `TypeError: this is undefined`. The vite-plugin inline adapters avoid this with self-contained guards.

### M4. [vite-plugin] `defaultFilter` Type-suffix heuristic is unreliable

**File:** `pkgs/vite-plugin/src/index.ts:246-251`  
**Severity: MAJOR**

Skipping all `Type`-suffixed names causes false negatives: `UserType`, `ProductType`, `StringType` are valid schema names that get silently dropped. No namespace guard beyond `$`. Also ignores the `schema` second parameter.

### M5. [vite-plugin] Zod import inconsistency between runtime and static paths

**Files:** `pkgs/vite-plugin/src/index.ts:325` vs `601`  
**Severity: MAJOR**

`generateSchemas` always emits `'zod'` (even for v4), while `generateSchemasFromSource` correctly uses `'zod/v4'` for v4. See C4 (separate critical for the generateSchemas side).

### M6. [zod-v4/adapter] Massively duplicated traversal logic across all three methods

**File:** `pkgs/zod-v4/src/adapter.ts:21-60, 62-86, 88-118`  
**Severity: MAJOR**

All three methods independently re-implement the same nested property traversal. If Zod v4 internal structure changes, all three must be updated. The same property accesses happen 3× per schema.

### M7. [vite-plugin] Missing trailing newline in generated files

**Files:** `pkgs/vite-plugin/src/index.ts:358, 647`  
**Severity: MAJOR**

Both `generateSchemas` and `generateSchemasFromSource` produce files without trailing `\n`. Violates POSIX convention; linters and `git diff` will flag this.

### M8. [vite-plugin] Duplicated name-based filtering between JSON and TS paths

**Files:** `pkgs/vite-plugin/src/index.ts:560-561, 609-610`  
**Severity: MAJOR**

The `name.startsWith("$") || name.endsWith("Type")` filter is duplicated across JSON and TS output paths. If naming conventions change, both must be updated.

### M9. [vite-plugin] `defaultSourceFilter` ignores name but name filter is hardcoded

**File:** `pkgs/vite-plugin/src/index.ts:516-519`  
**Severity: MAJOR**

Name-based filtering is always applied as hardcoded logic before the user's `filter`. A user-provided filter cannot override it. Not documented.

### M10. [zod-v3/adapter] No direct adapter unit tests

**File:** `pkgs/zod-v3/test/` — no adapter-specific tests  
**Severity: MAJOR**

Adapter is only tested indirectly through 155 serialization integration tests. Functions `getType`, `getDef`, and `isZodSchema` have no direct behavioral tests.

### M11. [zod-v3/adapter] `instanceof` cross-context/duplicate fragility

**File:** `pkgs/zod-v3/src/adapter.ts:45`  
**Severity: MAJOR**

The fallback `value instanceof z.ZodType` fails across Node.js `vm` contexts, ESM vs CJS duplicates, or hoisted `node_modules` — all common in monorepos. A Zod schema incorrectly returns `false` and is silently skipped.

### M12. [vite-plugin] `zodDecouplingAlias` has no input validation

**File:** `pkgs/vite-plugin/src/index.ts:384-385`  
**Severity: MAJOR**

Empty strings for `aliasFrom`/`aliasTo` produce broken aliases silently. Users get confusing "module not found" errors.

### M13. [vite-plugin] `let root: string;` uninitialized — TS strict mode risk

**File:** `pkgs/vite-plugin/src/index.ts:435, 446`  
**Severity: MAJOR**

`root` declared but never initialized. Vite guarantees `configResolved` before `buildStart` at runtime, but TypeScript cannot verify this. Strict mode configs will error.

### M14. [vite-plugin] Dynamic import caching in `zodDecoupling.buildStart`

**File:** `pkgs/vite-plugin/src/index.ts:451`  
**Severity: MAJOR**

`await import(schemaPath)` uses Node.js's module cache. In watch/rebuild scenarios (`vite dev`), changes to schema files are not reflected — stale schema generation.

---

## 🟡 MINOR ISSUES (Nice to Fix)

### m1. [zod-v4/adapter] Redundant `as string` cast on line 54

The `typeof` guard already narrows the type. The `as string` is dead code that suppresses TS errors if the guard is removed.

### m2. [zod-v4/adapter] `isZodSchema` classifies plain objects as schemas

Any object `{ type: "string", parse: () => {} }` passes. Low impact but increases false positive surface area.

### m3. [zod-v4/adapter] Unnecessary re-traversal in `getType` after `isZodSchema` gate

Since `getType` is gated by `isZodSchema`, some checks are guaranteed to succeed for schemas that passed — but the redundant traversal logic is not extracted.

### m4. [zod-v4/adapter] Near-zero test coverage for adapter behavior

Only 2 tests verifying method existence — none test `isZodSchema(false for null)`, `isZodSchema(true for real v4 schema)`, `getType` return values, etc.

### m5. [zod-v3/v4 index] `SerializeOptions` type not re-exported

`SerializeOptions` is imported as a type but not re-exported. Users must depend on `@zod-codepen/core` for typed usage.

### m6. [zod-v3/v4 index] Structural duplication between v3 and v4 index files

Byte-for-byte identical except adapter import. Acceptable for now (separate packages) but should be unified if a v5 emerges.

### m7. [zod-v3/v4 index] `registerHandler` JSDoc imprecision

Says "for a schema type" — it registers for a **schema type name** (e.g. `"string"`), not a schema instance.

### m8. [vite-plugin] Missing empty line after type exports in `generateSchemas`

Line 349: `lines.push(...typeExports)` but no trailing blank line. `generateSchemasFromSource` (line 637) correctly adds one.

### m9. [vite-plugin] Non-Zod exports silently skipped without log

In `generateSchemas`, values failing `adapter.isZodSchema()` are silently skipped. Users may not understand why exports are missing.

### m10. [vite-plugin] `defaultFilter` signature doesn't accept `schema` parameter

Signature `(name: string)` vs expected `(name: string, schema: unknown)`. Works via TS arity compatibility but misleads API consumers.

### m11. [vite-plugin] `GenerateFromSourceOptions` doesn't expose `onUnknown` parameter

`castAllFromAst` accepts `onUnknown?: "raw" | "fallback" | "throw"` but the option is not exposed to users.

### m12. [vite-plugin] `export default zodDecoupling` — static extraction not in docs

Top-level JSDoc example shows `zodDecoupling` and `zodDecouplingAlias` but doesn't mention `zodDecouplingStatic`.

---

## 📋 CROSS-CUTTING CONCERNS

### Consistency Issues

1. **Error handling**: `generateSchemas` + `zodDecoupling` = silent error swallowing. `generateSchemasFromSource` + `zodDecouplingStatic` = proper re-throw. Three different failure modes across the same module.
2. **Adapter implementations**: Three versions of v3 adapter and three versions of v4 adapter (adapter packages + vite-plugin inline), all with subtle behavioral differences.
3. **Zod import path**: `'zod'` vs `'zod/v4'` handled differently between runtime and static generation paths.
4. **Generated file formatting**: Runtime path misses trailing newline after type exports; static path includes it.

### Architecture Issues

1. **Adapter duplication**: The vite-plugin should import from the adapter packages instead of duplicating 116 lines of adapter logic.
2. **`this` dependency**: The adapter packages use `this.isZodSchema()` internally, making method extraction unsafe. The inline adapters use self-contained guards.
3. **v3 fallback in v4 adapter**: A design smell — the v4 adapter claiming to recognize v3 schemas is asymmetric and produces corrupted output.

### Test Coverage Gaps

| Gap                                                 | Impact                                         |
| --------------------------------------------------- | ---------------------------------------------- |
| No direct adapter behavioral tests (zod-v3, zod-v4) | **High** — adapter logic untested in isolation |
| No v4 import path test in `generateSchemas`         | **High** — C4 invisible to tests               |
| No cross-duplicate-instance test for `instanceof`   | **Medium**                                     |
| No `codegen` failure recovery test                  | **Medium**                                     |
| No user-aliases-preserved test for `config` hook    | **Medium**                                     |
| No watch-mode cache-busting test                    | **Medium**                                     |

---

## ✅ POSITIVE OBSERVATIONS

1. **Clean API separation**: All files have well-defined responsibilities with clear JSDoc documentation.
2. **Strong error containment in serialization loop**: `generateSchemas` wraps each schema in try-catch with `z.any()` fallback.
3. **Zero external dependency in v4 adapter**: Detects v4 schema structure without importing any Zod package — works across all v4 variants.
4. **Consistent pattern**: v3 and v4 packages follow identical structure, making cross-version understanding easy.
5. **Proper `enforce: "pre"` on all Vite plugins**: Schema generation runs before main build pipeline.
6. **Proactive directory creation**: Both `generateSchemas` and `generateSchemasFromSource` create output dirs if missing.
7. **Progressive disclosure**: JSDoc comments reference alternative functions, helping users choose the right mode.
8. **All tests pass**: 155 (v3) + 53 (v4) + 67 (vite-plugin) = 275 tests pass with zero failures.
9. **Build compiles cleanly**: TypeScript compilation with zero errors.

---

## PRIORITY RECOMMENDATIONS

### Immediate (before release)

1. **Fix C1-C3**: Align vite-plugin inline adapters with dedicated adapter packages OR import from packages
2. **Fix C4**: `generateSchemas` must use `'zod/v4'` for v4
3. **Fix C5+C8**: Unify error handling — both paths should re-throw on failure
4. **Fix C6**: Merge with existing user aliases instead of replacing
5. **Fix C7**: Remove v3 fallback from v4 adapter

### Short-term

6. **Fix M1-M2**: Eliminate adapter duplication (import from packages)
7. **Fix M3**: Make adapter methods `this`-independent
8. **Fix M5**: Consistent Zod import path across both generation functions
9. **Fix M12**: Add input validation to `zodDecouplingAlias`

### Medium-term

10. **Fix M6**: Extract shared traversal helper in v4 adapter
11. **Fix M7+M8**: Add trailing newlines, fix formatting inconsistencies
12. **Add adapter behavioral tests** for both v3 and v4
13. **Expose `onUnknown` option** in `GenerateFromSourceOptions`
