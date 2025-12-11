import { describe, it, expect } from "vitest";
import { createZodV3Adapter, createZodV4Adapter } from "../src/index.js";

describe("createZodV4Adapter", () => {
  const adapter = createZodV4Adapter();

  it("has correct version", () => {
    expect(adapter.version).toBe("v4");
  });

  describe("getType", () => {
    it("returns undefined for non-object values", () => {
      expect(adapter.getType(null)).toBe(undefined);
      expect(adapter.getType(undefined)).toBe(undefined);
      expect(adapter.getType("string")).toBe(undefined);
      expect(adapter.getType(123)).toBe(undefined);
    });

    it("extracts type from v4 schema structure (_zod.def.type)", () => {
      const mockV4Schema = {
        _zod: {
          def: {
            type: "string",
          },
        },
      };
      expect(adapter.getType(mockV4Schema)).toBe("string");
    });

    it("extracts type from v4 mini schema structure (direct type property)", () => {
      const mockMiniSchema = {
        type: "number",
        parse: () => {},
      };
      expect(adapter.getType(mockMiniSchema)).toBe("number");
    });

    it("falls back to v3 structure (_def.typeName)", () => {
      const mockV3Schema = {
        _def: {
          typeName: "ZodBoolean",
        },
      };
      expect(adapter.getType(mockV3Schema)).toBe("boolean");
    });
  });

  describe("getDef", () => {
    it("returns undefined for non-object values", () => {
      expect(adapter.getDef(null)).toBe(undefined);
      expect(adapter.getDef(undefined)).toBe(undefined);
    });

    it("returns def from v4 schema structure", () => {
      const def = { type: "string", checks: [] };
      const mockV4Schema = {
        _zod: { def },
      };
      expect(adapter.getDef(mockV4Schema)).toBe(def);
    });

    it("falls back to v3 _def structure", () => {
      const def = { typeName: "ZodString" };
      const mockSchema = { _def: def };
      expect(adapter.getDef(mockSchema)).toBe(def);
    });
  });

  describe("isZodSchema", () => {
    it("returns false for non-object values", () => {
      expect(adapter.isZodSchema(null)).toBe(false);
      expect(adapter.isZodSchema(undefined)).toBe(false);
      expect(adapter.isZodSchema("string")).toBe(false);
      expect(adapter.isZodSchema(123)).toBe(false);
    });

    it("returns true for v4 schema structure", () => {
      const mockV4Schema = {
        _zod: { def: { type: "string" } },
      };
      expect(adapter.isZodSchema(mockV4Schema)).toBe(true);
    });

    it("returns true for v3 schema structure", () => {
      const mockV3Schema = {
        _def: { typeName: "ZodString" },
      };
      expect(adapter.isZodSchema(mockV3Schema)).toBe(true);
    });

    it("returns true for v4 mini schema structure", () => {
      const mockMiniSchema = {
        type: "string",
        parse: () => {},
      };
      expect(adapter.isZodSchema(mockMiniSchema)).toBe(true);
    });

    it("returns false for objects without valid structure", () => {
      expect(adapter.isZodSchema({})).toBe(false);
      expect(adapter.isZodSchema({ type: "string" })).toBe(false); // No parse function
      expect(adapter.isZodSchema({ _def: {} })).toBe(false); // No typeName
    });
  });
});

describe("createZodV3Adapter", () => {
  const adapter = createZodV3Adapter();

  it("has correct version", () => {
    expect(adapter.version).toBe("v3");
  });

  describe("getType", () => {
    it("returns undefined for non-object values", () => {
      expect(adapter.getType(null)).toBe(undefined);
      expect(adapter.getType(undefined)).toBe(undefined);
    });

    it("extracts type from v3 schema structure (_def.typeName)", () => {
      const mockSchema = {
        _def: {
          typeName: "ZodString",
        },
      };
      expect(adapter.getType(mockSchema)).toBe("string");
    });

    it("converts ZodTypeName to lowercase without Zod prefix", () => {
      expect(adapter.getType({ _def: { typeName: "ZodNumber" } })).toBe(
        "number",
      );
      expect(adapter.getType({ _def: { typeName: "ZodBoolean" } })).toBe(
        "boolean",
      );
      expect(adapter.getType({ _def: { typeName: "ZodArray" } })).toBe("array");
      expect(adapter.getType({ _def: { typeName: "ZodObject" } })).toBe(
        "object",
      );
    });
  });

  describe("getDef", () => {
    it("returns undefined for non-object values", () => {
      expect(adapter.getDef(null)).toBe(undefined);
      expect(adapter.getDef(undefined)).toBe(undefined);
    });

    it("returns _def from schema", () => {
      const def = { typeName: "ZodString" };
      const mockSchema = { _def: def };
      expect(adapter.getDef(mockSchema)).toBe(def);
    });
  });

  describe("isZodSchema", () => {
    it("returns false for non-object values", () => {
      expect(adapter.isZodSchema(null)).toBe(false);
      expect(adapter.isZodSchema(undefined)).toBe(false);
    });

    it("returns true for valid v3 schema structure", () => {
      const mockSchema = {
        _def: { typeName: "ZodString" },
      };
      expect(adapter.isZodSchema(mockSchema)).toBe(true);
    });

    it("returns false for objects without _def.typeName", () => {
      expect(adapter.isZodSchema({})).toBe(false);
      expect(adapter.isZodSchema({ _def: {} })).toBe(false);
      expect(adapter.isZodSchema({ _def: { typeName: 123 } })).toBe(false);
    });
  });
});
