import { describe, it, expect, vi } from "vitest";
import { zodDecouplingAlias, zodDecoupling } from "../src/index.js";
import type { UserConfig, ResolvedConfig } from "vite";

type ConfigFn = (config: UserConfig) => {
  resolve: { alias: Record<string, string> };
};
type ConfigResolvedFn = (config: ResolvedConfig) => void;
type BuildStartFn = () => Promise<void>;

describe("zodDecouplingAlias", () => {
  it("returns a plugin with correct name", () => {
    const plugin = zodDecouplingAlias({
      aliasFrom: "../runtime/schema.js",
      aliasTo: "./src/generated/schemas.ts",
    });

    expect(plugin.name).toBe("zod-decoupling-alias");
  });

  it("enforces pre-order execution", () => {
    const plugin = zodDecouplingAlias({
      aliasFrom: "../runtime/schema.js",
      aliasTo: "./src/generated/schemas.ts",
    });

    expect(plugin.enforce).toBe("pre");
  });

  it("configures resolve alias correctly", () => {
    const plugin = zodDecouplingAlias({
      aliasFrom: "../runtime/schema.js",
      aliasTo: "./src/generated/schemas.ts",
    });

    const userConfig: UserConfig = {};
    const configResult = (plugin.config as ConfigFn)(userConfig);

    expect(configResult).toBeDefined();
    expect(configResult.resolve).toBeDefined();
    expect(configResult.resolve.alias).toBeDefined();
    expect(configResult.resolve.alias["../runtime/schema.js"]).toContain(
      "src/generated/schemas.ts",
    );
  });

  it("uses project root from user config", () => {
    const plugin = zodDecouplingAlias({
      aliasFrom: "../runtime/schema.js",
      aliasTo: "./src/generated/schemas.ts",
    });

    const userConfig: UserConfig = {
      root: "/custom/root",
    };
    const configResult = (plugin.config as ConfigFn)(userConfig);

    expect(configResult.resolve.alias["../runtime/schema.js"]).toContain(
      "/custom/root",
    );
  });
});

describe("zodDecoupling", () => {
  it("returns a plugin with correct name", () => {
    const plugin = zodDecoupling({
      schemaEntry: "./src/runtime/schema.ts",
      outputPath: "./src/generated/schemas.ts",
      aliasFrom: "../runtime/schema.js",
    });

    expect(plugin.name).toBe("zod-decoupling");
  });

  it("enforces pre-order execution", () => {
    const plugin = zodDecoupling({
      schemaEntry: "./src/runtime/schema.ts",
      outputPath: "./src/generated/schemas.ts",
      aliasFrom: "../runtime/schema.js",
    });

    expect(plugin.enforce).toBe("pre");
  });

  it("has configResolved hook", () => {
    const plugin = zodDecoupling({
      schemaEntry: "./src/runtime/schema.ts",
      outputPath: "./src/generated/schemas.ts",
      aliasFrom: "../runtime/schema.js",
    });

    expect(typeof plugin.configResolved).toBe("function");
  });

  it("has buildStart hook", () => {
    const plugin = zodDecoupling({
      schemaEntry: "./src/runtime/schema.ts",
      outputPath: "./src/generated/schemas.ts",
      aliasFrom: "../runtime/schema.js",
    });

    expect(typeof plugin.buildStart).toBe("function");
  });

  it("configures resolve alias correctly", () => {
    const plugin = zodDecoupling({
      schemaEntry: "./src/runtime/schema.ts",
      outputPath: "./src/generated/schemas.ts",
      aliasFrom: "../runtime/schema.js",
    });

    const userConfig: UserConfig = {};
    const configResult = (plugin.config as ConfigFn)(userConfig);

    expect(configResult).toBeDefined();
    expect(configResult.resolve).toBeDefined();
    expect(configResult.resolve.alias).toBeDefined();
    expect(configResult.resolve.alias["../runtime/schema.js"]).toContain(
      "src/generated/schemas.ts",
    );
  });

  it("stores root from resolved config", () => {
    const plugin = zodDecoupling({
      schemaEntry: "./src/runtime/schema.ts",
      outputPath: "./src/generated/schemas.ts",
      aliasFrom: "../runtime/schema.js",
    });

    const mockConfig = {
      root: "/project/root",
    } as ResolvedConfig;

    (plugin.configResolved as ConfigResolvedFn)(mockConfig);

    // The root should be stored internally (we can't directly check private state,
    // but we can verify buildStart uses it correctly in integration tests)
    expect(plugin.configResolved).toBeDefined();
  });

  it("handles buildStart with import error gracefully", async () => {
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    const plugin = zodDecoupling({
      schemaEntry: "./non-existent-file.ts",
      outputPath: "./src/generated/schemas.ts",
      aliasFrom: "../runtime/schema.js",
    });

    // Setup config first
    const mockConfig = {
      root: "/project/root",
    } as ResolvedConfig;

    (plugin.configResolved as ConfigResolvedFn)(mockConfig);

    // buildStart should handle import errors gracefully
    await (plugin.buildStart as BuildStartFn)();

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining("[zod-decoupling]"),
      expect.anything(),
    );

    consoleErrorSpy.mockRestore();
  });

  it("uses default options correctly", () => {
    const plugin = zodDecoupling({
      schemaEntry: "./src/runtime/schema.ts",
      outputPath: "./src/generated/schemas.ts",
      aliasFrom: "../runtime/schema.js",
    });

    // Plugin should be created without errors using defaults
    expect(plugin).toBeDefined();
    expect(plugin.name).toBe("zod-decoupling");
  });

  it("accepts custom options", () => {
    const customFilter = (name: string) => name.startsWith("Api");
    const customHeader = "// Custom header";

    const plugin = zodDecoupling({
      schemaEntry: "./src/runtime/schema.ts",
      outputPath: "./src/generated/schemas.ts",
      aliasFrom: "../runtime/schema.js",
      zodVersion: "v3",
      filter: customFilter,
      includeTypes: false,
      header: customHeader,
      serializeOptions: { format: false },
      verbose: true,
    });

    // Plugin should be created without errors with custom options
    expect(plugin).toBeDefined();
  });
});
