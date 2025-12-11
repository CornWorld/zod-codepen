import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import { generateSchemas } from "../src/index.js";
import { z } from "zod";

// Mock fs module
vi.mock("node:fs", () => ({
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

describe("generateSchemas", () => {
  const mockWriteFileSync = fs.writeFileSync as ReturnType<typeof vi.fn>;
  const mockExistsSync = fs.existsSync as ReturnType<typeof vi.fn>;
  const mockMkdirSync = fs.mkdirSync as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockExistsSync.mockReturnValue(true);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("generates file with default options", async () => {
    const schemas = {
      User: z.object({ id: z.number(), name: z.string() }),
      Status: z.enum(["active", "inactive"]),
    };

    await generateSchemas({
      schemas,
      outputPath: "/output/schemas.ts",
    });

    expect(mockWriteFileSync).toHaveBeenCalledTimes(1);
    const [outputPath, content] = mockWriteFileSync.mock.calls[0];
    expect(outputPath).toBe("/output/schemas.ts");
    expect(content).toContain("import { z } from 'zod';");
    expect(content).toContain("export const User =");
    expect(content).toContain("export const Status =");
    expect(content).toContain("export type User = z.infer<typeof User>;");
    expect(content).toContain("export type Status = z.infer<typeof Status>;");
  });

  it("creates output directory if it does not exist", async () => {
    mockExistsSync.mockReturnValue(false);

    await generateSchemas({
      schemas: { Test: z.string() },
      outputPath: "/new/dir/schemas.ts",
    });

    expect(mockMkdirSync).toHaveBeenCalledWith("/new/dir", { recursive: true });
  });

  it("respects includeTypes option", async () => {
    await generateSchemas({
      schemas: { User: z.string() },
      outputPath: "/output/schemas.ts",
      includeTypes: false,
    });

    const content = mockWriteFileSync.mock.calls[0][1];
    expect(content).not.toContain("export type User");
    expect(content).not.toContain("// Type exports");
  });

  it("uses custom header when provided", async () => {
    const customHeader = "// Custom header\n// For testing";

    await generateSchemas({
      schemas: { Test: z.string() },
      outputPath: "/output/schemas.ts",
      header: customHeader,
    });

    const content = mockWriteFileSync.mock.calls[0][1];
    expect(content).toContain("// Custom header");
    expect(content).not.toContain("AUTO-GENERATED FILE");
  });

  it("applies default filter", async () => {
    const schemas = {
      User: z.string(),
      $internal: z.number(),
      UserType: z.boolean(),
    };

    await generateSchemas({
      schemas,
      outputPath: "/output/schemas.ts",
    });

    const content = mockWriteFileSync.mock.calls[0][1];
    expect(content).toContain("export const User");
    expect(content).not.toContain("export const $internal");
    expect(content).not.toContain("export const UserType");
  });

  it("applies custom filter", async () => {
    const schemas = {
      ApiUser: z.string(),
      InternalUser: z.number(),
      ApiStatus: z.boolean(),
    };

    await generateSchemas({
      schemas,
      outputPath: "/output/schemas.ts",
      filter: (name) => name.startsWith("Api"),
    });

    const content = mockWriteFileSync.mock.calls[0][1];
    expect(content).toContain("export const ApiUser");
    expect(content).toContain("export const ApiStatus");
    expect(content).not.toContain("export const InternalUser");
  });

  it("skips non-zod values", async () => {
    const schemas = {
      User: z.string(),
      notASchema: "just a string",
      aNumber: 42,
      aFunction: () => {},
    };

    await generateSchemas({
      schemas,
      outputPath: "/output/schemas.ts",
    });

    const content = mockWriteFileSync.mock.calls[0][1];
    expect(content).toContain("export const User");
    expect(content).not.toContain("export const notASchema");
    expect(content).not.toContain("export const aNumber");
    expect(content).not.toContain("export const aFunction");
  });

  it("handles undefined values gracefully", async () => {
    const schemas = {
      User: z.string(),
      undefined: undefined,
    };

    await generateSchemas({
      schemas,
      outputPath: "/output/schemas.ts",
    });

    const content = mockWriteFileSync.mock.calls[0][1];
    expect(content).toContain("export const User");
  });

  it("uses v3 adapter when specified", async () => {
    const schemas = {
      User: z.string(),
    };

    await generateSchemas({
      schemas,
      outputPath: "/output/schemas.ts",
      zodVersion: "v3",
    });

    // Should still work (zod v4 schemas are backward compatible with v3 adapter detection)
    expect(mockWriteFileSync).toHaveBeenCalledTimes(1);
  });

  it("passes serialize options to serializer", async () => {
    const schemas = {
      User: z.object({ id: z.number() }),
    };

    await generateSchemas({
      schemas,
      outputPath: "/output/schemas.ts",
      serializeOptions: { format: false },
    });

    const content = mockWriteFileSync.mock.calls[0][1];
    // With format: false, the output should be more compact
    expect(content).toContain("export const User =");
  });

  it("logs when verbose is enabled", async () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await generateSchemas({
      schemas: { User: z.string() },
      outputPath: "/output/schemas.ts",
      verbose: true,
    });

    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it("handles serialization errors gracefully", async () => {
    const consoleWarnSpy = vi
      .spyOn(console, "warn")
      .mockImplementation(() => {});

    // Create a mock schema that will fail serialization
    const brokenSchema = {
      _zod: { def: { type: "unknown_type" } },
    };

    const schemas = {
      Broken: brokenSchema,
      Working: z.string(),
    };

    await generateSchemas({
      schemas,
      outputPath: "/output/schemas.ts",
    });

    const content = mockWriteFileSync.mock.calls[0][1];
    expect(content).toContain("export const Working");
    // Broken schema should have fallback
    expect(content).toContain("export const Broken = z.any()");

    consoleWarnSpy.mockRestore();
  });
});
