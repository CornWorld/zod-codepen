import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { generateSchemas } from "../src/index.js";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixtureDir = path.join(__dirname, "fixtures/basic-project");
const outputPath = path.join(fixtureDir, "src/generated/schemas.ts");

describe("E2E: generateSchemas", () => {
  beforeAll(async () => {
    // Clean up any existing generated files
    const generatedDir = path.dirname(outputPath);
    if (fs.existsSync(generatedDir)) {
      fs.rmSync(generatedDir, { recursive: true });
    }
  });

  afterAll(() => {
    // Clean up generated files after tests
    const generatedDir = path.dirname(outputPath);
    if (fs.existsSync(generatedDir)) {
      fs.rmSync(generatedDir, { recursive: true });
    }
  });

  it("generates schema file from fixture", async () => {
    // Dynamic import the fixture schemas
    const schemas = await import("./fixtures/basic-project/src/schema.js");

    await generateSchemas({
      schemas,
      outputPath,
      zodVersion: "v4",
      verbose: false,
    });

    // Verify file was created
    expect(fs.existsSync(outputPath)).toBe(true);

    // Read and verify content
    const content = fs.readFileSync(outputPath, "utf-8");

    // Should have import
    expect(content).toContain("import { z } from 'zod';");

    // Should include User schema
    expect(content).toContain("export const User =");
    expect(content).toContain("z.object(");
    expect(content).toContain("id: z.number()");
    expect(content).toContain("name: z.string()");
    expect(content).toContain("email: z.string().email()");

    // Should include Post schema
    expect(content).toContain("export const Post =");
    expect(content).toContain("title: z.string()");

    // Should include Status enum
    expect(content).toContain("export const Status =");
    expect(content).toContain('z.enum(["active", "inactive", "pending"])');

    // Should include CreateUserInput
    expect(content).toContain("export const CreateUserInput =");

    // Should NOT include filtered exports
    expect(content).not.toContain("$drizzleInternal");
    expect(content).not.toContain("UserType");

    // Should have type exports
    expect(content).toContain("export type User = z.infer<typeof User>");
    expect(content).toContain("export type Post = z.infer<typeof Post>");
    expect(content).toContain("export type Status = z.infer<typeof Status>");
  });

  it("generated file is valid TypeScript that can be imported", async () => {
    // First generate the file
    const schemas = await import("./fixtures/basic-project/src/schema.js");
    await generateSchemas({
      schemas,
      outputPath,
      zodVersion: "v4",
    });

    // Try to import the generated file
    const generated =
      await import("./fixtures/basic-project/src/generated/schemas.js");

    // Verify exports exist
    expect(generated.User).toBeDefined();
    expect(generated.Post).toBeDefined();
    expect(generated.Status).toBeDefined();
    expect(generated.CreateUserInput).toBeDefined();

    // Verify schemas work correctly
    const validUser = {
      id: 1,
      name: "Test User",
      email: "test@example.com",
      createdAt: new Date(),
    };

    const parseResult = generated.User.safeParse(validUser);
    expect(parseResult.success).toBe(true);

    // Verify invalid data fails
    const invalidUser = {
      id: "not a number",
      name: "Test",
      email: "invalid-email",
    };

    const invalidResult = generated.User.safeParse(invalidUser);
    expect(invalidResult.success).toBe(false);
  });

  it("respects includeTypes option", async () => {
    const schemas = await import("./fixtures/basic-project/src/schema.js");

    const noTypesOutput = path.join(fixtureDir, "src/generated/no-types.ts");

    await generateSchemas({
      schemas,
      outputPath: noTypesOutput,
      zodVersion: "v4",
      includeTypes: false,
    });

    const content = fs.readFileSync(noTypesOutput, "utf-8");
    expect(content).not.toContain("export type");
    expect(content).not.toContain("z.infer");

    // Cleanup
    fs.unlinkSync(noTypesOutput);
  });

  it("respects custom filter", async () => {
    const schemas = await import("./fixtures/basic-project/src/schema.js");

    const filteredOutput = path.join(fixtureDir, "src/generated/filtered.ts");

    await generateSchemas({
      schemas,
      outputPath: filteredOutput,
      zodVersion: "v4",
      filter: (name) => name.startsWith("User") || name.startsWith("Create"),
    });

    const content = fs.readFileSync(filteredOutput, "utf-8");
    expect(content).toContain("export const User");
    expect(content).toContain("export const CreateUserInput");
    expect(content).not.toContain("export const Post");
    expect(content).not.toContain("export const Status");

    // Cleanup
    fs.unlinkSync(filteredOutput);
  });

  it("uses custom header when provided", async () => {
    const schemas = await import("./fixtures/basic-project/src/schema.js");

    const customHeaderOutput = path.join(
      fixtureDir,
      "src/generated/custom-header.ts",
    );
    const customHeader = `/**
 * Custom header for testing
 * @generated
 */`;

    await generateSchemas({
      schemas,
      outputPath: customHeaderOutput,
      zodVersion: "v4",
      header: customHeader,
    });

    const content = fs.readFileSync(customHeaderOutput, "utf-8");
    expect(content).toContain("Custom header for testing");
    expect(content).toContain("@generated");
    expect(content).not.toContain("AUTO-GENERATED FILE");

    // Cleanup
    fs.unlinkSync(customHeaderOutput);
  });
});
