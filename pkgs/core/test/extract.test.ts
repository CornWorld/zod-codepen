import { describe, it, expect } from "vitest";
import {
  extractSchemaExports,
  collectZodAliases,
} from "../src/extract/module.js";

describe("extractSchemaExports", () => {
  it("extracts exported const schemas", () => {
    const src = `
      import { z } from 'zod';
      export const User = z.object({ id: z.number() });
      export const Name = z.string();
      const $internal = z.any();
    `;
    const exports = extractSchemaExports(src);
    const names = exports.map((e) => e.name);
    expect(names).toEqual(["User", "Name"]);
    expect(exports.every((e) => e.isSchemaLike)).toBe(true);
  });

  it("marks type-only exports", () => {
    const src = `
      export const User = z.object({});
      export type UserType = typeof User;
      export interface Foo {}
    `;
    const exports = extractSchemaExports(src);
    const userExport = exports.find((e) => e.name === "User");
    const userTypeExport = exports.find((e) => e.name === "UserType");
    const fooExport = exports.find((e) => e.name === "Foo");
    expect(userExport?.isTypeOnly).toBe(false);
    expect(userTypeExport?.isTypeOnly).toBe(true);
    expect(fooExport?.isTypeOnly).toBe(true);
  });

  it("detects isSchemaLike via zod root identifier", () => {
    const src = `
      export const A = z.string();
      export const B = 42;
      export const C = "string";
      export const D = someWrapper(z.string());
    `;
    const exports = extractSchemaExports(src);
    expect(exports.find((e) => e.name === "A")?.isSchemaLike).toBe(true);
    expect(exports.find((e) => e.name === "B")?.isSchemaLike).toBe(false);
    expect(exports.find((e) => e.name === "C")?.isSchemaLike).toBe(false);
    // D is a wrapper call — root identifier is 'someWrapper', not 'z'.
    expect(exports.find((e) => e.name === "D")?.isSchemaLike).toBe(false);
  });

  it("respects custom zodRoots", () => {
    const src = `
      export const A = Z.string();
    `;
    const exports = extractSchemaExports(src, { zodRoots: ["Z"] });
    expect(exports[0]?.isSchemaLike).toBe(true);
  });

  it("captures range offsets", () => {
    const src = `export const X = z.string();`;
    const exports = extractSchemaExports(src);
    expect(exports[0]?.range).toBeDefined();
    expect(exports[0]?.range.length).toBe(2);
  });

  it("handles export { A, B } re-export", () => {
    const src = `
      const A = z.string();
      const B = z.number();
      export { A, B };
    `;
    const exports = extractSchemaExports(src);
    const names = exports.map((e) => e.name);
    expect(names).toContain("A");
    expect(names).toContain("B");
  });

  it("handles export { X } from './y'", () => {
    const src = `
      export { X } from './shared';
    `;
    const exports = extractSchemaExports(src);
    expect(exports[0]?.name).toBe("X");
    expect(exports[0]?.reExportedFrom).toBe("./shared");
  });

  it("handles export default", () => {
    const src = `
      export default z.object({ id: z.number() });
    `;
    const exports = extractSchemaExports(src);
    expect(exports[0]?.name).toBe("default");
    expect(exports[0]?.isSchemaLike).toBe(true);
  });

  it("excludes non-exported declarations", () => {
    const src = `
      const $internal = z.any();
      let counter = 0;
      function helper() {}
      export const Real = z.string();
    `;
    const exports = extractSchemaExports(src);
    const names = exports.map((e) => e.name);
    expect(names).toEqual(["Real"]);
  });
});

describe("collectZodAliases", () => {
  it("always includes default 'z'", () => {
    const src = `export const X = 1;`;
    const aliases = collectZodAliases(src);
    expect(aliases.has("z")).toBe(true);
  });

  it("captures import { z } from 'zod'", () => {
    const src = `import { z } from 'zod';`;
    expect(collectZodAliases(src).has("z")).toBe(true);
  });

  it("captures import { z as Z } from 'zod'", () => {
    const src = `import { z as Z } from 'zod';`;
    const aliases = collectZodAliases(src);
    expect(aliases.has("Z")).toBe(true);
  });

  it("captures namespace import", () => {
    const src = `import * as zod from 'zod';`;
    const aliases = collectZodAliases(src);
    expect(aliases.has("zod")).toBe(true);
  });

  it("captures default import", () => {
    const src = `import z from 'zod';`;
    const aliases = collectZodAliases(src);
    expect(aliases.has("z")).toBe(true);
  });

  it("recognizes zod subpaths", () => {
    const src = `import { z } from 'zod/v4';`;
    expect(collectZodAliases(src).has("z")).toBe(true);
  });

  it("ignores non-zod imports", () => {
    const src = `import { z } from './custom';`;
    const aliases = collectZodAliases(src);
    expect(aliases.has("z")).toBe(true); // 'z' is always in defaults
    // But there's no alias added for ./custom — verify size stays minimal.
    expect(aliases.size).toBe(1);
  });
});
