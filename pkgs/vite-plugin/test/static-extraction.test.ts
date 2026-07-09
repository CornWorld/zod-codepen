import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  generateSchemasFromSource,
  zodDecouplingStatic,
  defaultSourceFilter,
} from "../src/index.js";

const FIXTURE_ROOT = path.resolve(__dirname, "fixtures/static-extraction/src");
const SCHEMA_PATH = path.join(FIXTURE_ROOT, "schema.ts");
const SHARED_PATH = path.join(FIXTURE_ROOT, "shared.ts");

function readSchemaSrc(): string {
  return fs.readFileSync(SCHEMA_PATH, "utf-8");
}

describe("generateSchemasFromSource — end-to-end", () => {
  let tmpOut: string;

  beforeEach(() => {
    tmpOut = path.join(
      os.tmpdir(),
      `zod-codepen-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    fs.mkdirSync(tmpOut, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpOut, { recursive: true, force: true });
  });

  it("writes a pure-Zod file without executing the source", () => {
    const out = path.join(tmpOut, "out.ts");
    // Purposefully NOT importing the fixture — we feed source as text.
    generateSchemasFromSource({
      source: readSchemaSrc(),
      fileName: SCHEMA_PATH,
      rootDir: FIXTURE_ROOT,
      outputPath: out,
      zodVersion: "v4",
      codegenOptions: {
        indent: "  ",
        indentLevel: 0,
        format: false,
        optimizations: { semanticMethods: false, scientificNotation: false },
      },
    });

    const written = fs.readFileSync(out, "utf-8");

    // Header
    expect(written).toContain("AUTO-GENERATED FILE");
    expect(written).toContain("import { z } from 'zod/v4';");

    // User — cross-file spread inlined
    expect(written).toContain("export const User = z.object({");
    expect(written).toContain("id: z.number()");
    expect(written).toContain("createdAt: z.date()");
    expect(written).toContain('role: z.enum(["admin", "user"])');

    // Name — wrapper inlined
    expect(written).toContain("export const Name = z.string().min(1).max(50);");

    // Email — plain primitive
    expect(written).toContain("export const Email = z.string().email();");

    // Type exports included
    expect(written).toContain("export type User = z.infer<typeof User>;");

    // DrizzleUser (RawNode) and $-prefixed/type-only exports filtered out.
    expect(written).not.toContain("DrizzleUser");
    expect(written).not.toContain("$drizzleInternal");
    expect(written).not.toContain("UserType");
  });

  it("emits RawNode placeholder when filter accepts it", () => {
    const out = path.join(tmpOut, "out.ts");
    generateSchemasFromSource({
      source: readSchemaSrc(),
      fileName: SCHEMA_PATH,
      rootDir: FIXTURE_ROOT,
      outputPath: out,
      filter: () => true, // keep everything including raw/fallback
      codegenOptions: {
        indent: "  ",
        indentLevel: 0,
        format: false,
        optimizations: { semanticMethods: false, scientificNotation: false },
      },
    });
    const written = fs.readFileSync(out, "utf-8");
    expect(written).toContain("DrizzleUser");
    expect(written).toMatch(/\/\* raw:/);
  });

  it("emits 'zod/v4' import for v4 and 'zod' for v3", () => {
    const outV4 = path.join(tmpOut, "v4.ts");
    generateSchemasFromSource({
      source: "export const X = z.string();",
      fileName: "/x.ts",
      outputPath: outV4,
      zodVersion: "v4",
    });
    expect(fs.readFileSync(outV4, "utf-8")).toContain(
      "import { z } from 'zod/v4';",
    );

    const outV3 = path.join(tmpOut, "v3.ts");
    generateSchemasFromSource({
      source: "export const X = z.string();",
      fileName: "/x.ts",
      outputPath: outV3,
      zodVersion: "v3",
    });
    expect(fs.readFileSync(outV3, "utf-8")).toContain(
      "import { z } from 'zod';",
    );
  });

  it("resolveSchema does not throw on cross-file import when shared file exists", () => {
    // Sanity: shared.ts is reachable from fixture root.
    expect(fs.existsSync(SHARED_PATH)).toBe(true);
    const out = path.join(tmpOut, "out.ts");
    expect(() =>
      generateSchemasFromSource({
        source: readSchemaSrc(),
        fileName: SCHEMA_PATH,
        rootDir: FIXTURE_ROOT,
        outputPath: out,
      }),
    ).not.toThrow();
  });
});

describe("defaultSourceFilter", () => {
  it("drops raw / fallback IR", () => {
    expect(defaultSourceFilter("X", { kind: "raw" } as never)).toBe(false);
    expect(defaultSourceFilter("X", { kind: "fallback" } as never)).toBe(false);
  });

  it("keeps valid IR kinds", () => {
    expect(
      defaultSourceFilter("X", { kind: "primitive", name: "string" } as never),
    ).toBe(true);
    expect(
      defaultSourceFilter("X", {
        kind: "object",
        fields: [],
        unknownMode: "strip",
      } as never),
    ).toBe(true);
  });
});

describe("zodDecouplingStatic — Vite plugin shape", () => {
  it("returns a Plugin with buildStart hook", () => {
    const plugin = zodDecouplingStatic({
      schemaEntry: "./schema.ts",
      outputPath: "./out.ts",
      aliasFrom: "./schema",
    });
    expect(plugin.name).toBe("zod-decoupling-static");
    expect(typeof plugin.buildStart).toBe("function");
    expect(plugin.enforce).toBe("pre");
  });
});

describe("generateSchemasFromSource — JSON output", () => {
  let tmpOut: string;

  beforeEach(() => {
    tmpOut = path.join(
      os.tmpdir(),
      `zod-codepen-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    fs.mkdirSync(tmpOut, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpOut, { recursive: true, force: true });
  });

  it("outputs valid JSON when outputFormat is 'json'", () => {
    const out = path.join(tmpOut, "schemas.json");
    generateSchemasFromSource({
      source: readSchemaSrc(),
      fileName: SCHEMA_PATH,
      rootDir: FIXTURE_ROOT,
      outputPath: out,
      outputFormat: "json",
    });

    const raw = fs.readFileSync(out, "utf-8");
    const parsed = JSON.parse(raw); // should not throw
    expect(parsed.version).toBe(1);
    expect(parsed.schemas).toBeDefined();
    expect(parsed.schemas.User).toBeDefined();
    expect(parsed.schemas.User.kind).toBe("object");
  });

  it("default outputFormat is 'ts' (backward compatible)", () => {
    const out = path.join(tmpOut, "out.ts");
    generateSchemasFromSource({
      source: readSchemaSrc(),
      fileName: SCHEMA_PATH,
      rootDir: FIXTURE_ROOT,
      outputPath: out,
      // no outputFormat — should default to "ts"
    });

    const written = fs.readFileSync(out, "utf-8");
    expect(written).toContain("AUTO-GENERATED FILE");
    expect(written).toContain("import { z } from");
  });

  it("JSON output for Primo-style fixture", () => {
    const primoPath = path.join(FIXTURE_ROOT, "primo-sample.ts");
    const primoSource = fs.readFileSync(primoPath, "utf-8");
    const out = path.join(tmpOut, "primo.json");
    generateSchemasFromSource({
      source: primoSource,
      fileName: primoPath,
      rootDir: FIXTURE_ROOT,
      outputPath: out,
      outputFormat: "json",
    });

    const parsed = JSON.parse(fs.readFileSync(out, "utf-8"));
    expect(parsed.schemas.Page.kind).toBe("object");
    expect(parsed.schemas.Page.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "id" }),
        expect.objectContaining({ key: "title" }),
      ]),
    );
    // discriminatedUnion
    expect(parsed.schemas.Block.kind).toBe("union");
    expect(parsed.schemas.Block.discriminator).toBe("type");
    // simple union
    expect(parsed.schemas.StringOrNumber.kind).toBe("union");
    // literal
    expect(parsed.schemas.DefaultTheme.kind).toBe("literal");
    expect(parsed.schemas.DefaultTheme.value).toBe("light");
  });
});
