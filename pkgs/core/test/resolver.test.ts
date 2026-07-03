import { describe, it, expect } from "vitest";
import { ModuleResolver, makeAstResolver } from "../src/extract/resolver.js";
import { castFromAst } from "../src/cast/ast.js";
import { codegen } from "../src/ir/printer/codegen.js";
import type { CodegenOptions } from "../src/ir/printer/codegen.js";

const defaultOpts: CodegenOptions = {
  indent: "  ",
  indentLevel: 0,
  format: false,
  optimizations: { semanticMethods: false, scientificNotation: false },
};

interface FileMap {
  [path: string]: string;
}

function makeResolver(files: FileMap, rootDir = "/test") {
  const resolver = new ModuleResolver(rootDir, {
    fileExists: (p) => Object.prototype.hasOwnProperty.call(files, p),
    readFile: (p) => files[p],
  });
  return resolver;
}

describe("ModuleResolver — basic resolution", () => {
  it("resolves named import from sibling file", () => {
    const files = {
      "/test/schema.ts": `
        import { BaseUser } from './shared';
        export const User = z.object({
          ...BaseUser.shape,
          role: z.enum(['admin']),
        });
      `,
      "/test/shared.ts": `
        export const BaseUser = z.object({ id: z.number() });
      `,
    };
    const resolver = makeResolver(files);
    const astResolver = makeAstResolver(resolver);
    const ir = castFromAst(files["/test/schema.ts"], "User", {
      fileName: "/test/schema.ts",
      resolver: astResolver,
    });
    const out = codegen(ir, defaultOpts).trim();
    expect(out).toBe('z.object({ id: z.number(), role: z.enum(["admin"]) })');
  });

  it("resolves nested cross-file import", () => {
    const files = {
      "/test/a.ts": `
        import { B } from './b';
        export const A = z.object({ child: B });
      `,
      "/test/b.ts": `
        export const B = z.object({ id: z.number() });
      `,
    };
    const resolver = makeResolver(files);
    const ir = castFromAst(files["/test/a.ts"], "A", {
      fileName: "/test/a.ts",
      resolver: makeAstResolver(resolver),
    });
    const out = codegen(ir, defaultOpts).trim();
    expect(out).toBe("z.object({ child: z.object({ id: z.number() }) })");
  });
});

describe("ModuleResolver — external modules", () => {
  it("returns undefined for non-relative specifiers", () => {
    const files = {
      "/test/schema.ts": `
        import { z } from 'zod';
        import { createSelectSchema } from 'drizzle-zod';
        export const S = createSelectSchema();
      `,
    };
    const resolver = makeResolver(files);
    const ir = castFromAst(files["/test/schema.ts"], "S", {
      fileName: "/test/schema.ts",
      resolver: makeAstResolver(resolver),
    });
    // drizzle-zod wrapper call returns RawNode.
    expect(ir.kind).toBe("raw");
  });
});

describe("ModuleResolver — circular imports", () => {
  it("returns circular marker on direct cycle", () => {
    const files = {
      "/test/a.ts": `
        import { B } from './b';
        export const A = B;
      `,
      "/test/b.ts": `
        import { A } from './a';
        export const B = A;
      `,
    };
    const resolver = makeResolver(files);
    const result = resolver.resolveSchema("./b", "B", "/test/a.ts");
    // Direct cycle: B → A → B → circular marker.
    expect(result).toEqual({ kind: "circular" });
  });
});

describe("ModuleResolver — caching", () => {
  it("caches resolved IR", () => {
    let readCount = 0;
    const files = {
      "/test/schema.ts": `
        import { A } from './shared';
        import { A as A2 } from './shared';
        export const X = A;
        export const Y = A2;
      `,
      "/test/shared.ts": `
        export const A = z.string();
      `,
    };
    const resolver = new ModuleResolver("/test", {
      fileExists: (p) => Object.prototype.hasOwnProperty.call(files, p),
      readFile: (p) => {
        readCount++;
        return files[p];
      },
    });
    // Read schema.ts once to count shared.ts reads.
    resolver.resolveSchema("./shared", "A", "/test/schema.ts");
    resolver.resolveSchema("./shared", "A", "/test/schema.ts");
    // shared.ts should be read once, cached on second resolve.
    // (schema.ts read counts toward total, so we check the difference.)
    const baseline = readCount;
    resolver.resolveSchema("./shared", "A", "/test/schema.ts");
    expect(readCount).toBe(baseline);
  });
});

describe("ModuleResolver — identifier resolution", () => {
  it("resolves bare identifier reference (cross-file)", () => {
    const files = {
      "/test/schema.ts": `
        import { CommonSchema } from './shared';
        export const S = CommonSchema;
      `,
      "/test/shared.ts": `
        export const CommonSchema = z.string().email();
      `,
    };
    const resolver = makeResolver(files);
    const ir = castFromAst(files["/test/schema.ts"], "S", {
      fileName: "/test/schema.ts",
      resolver: makeAstResolver(resolver),
    });
    expect(codegen(ir, defaultOpts).trim()).toBe("z.string().email()");
  });

  it("resolves local const reference (same file)", () => {
    const files = {
      "/test/schema.ts": `
        const base = z.string().min(1);
        export const S = base;
      `,
    };
    const resolver = makeResolver(files);
    const ir = castFromAst(files["/test/schema.ts"], "S", {
      fileName: "/test/schema.ts",
      resolver: makeAstResolver(resolver),
    });
    expect(codegen(ir, defaultOpts).trim()).toBe("z.string().min(1)");
  });
});

describe("ModuleResolver — maxDepth protection", () => {
  it("stops at maxDepth", () => {
    // A → B → A → B ... would cycle; maxDepth forces termination.
    const files = {
      "/test/a.ts": `
        import { B } from './b';
        export const A = B;
      `,
      "/test/b.ts": `
        import { A } from './a';
        export const B = A;
      `,
    };
    const resolver = new ModuleResolver("/test", {
      maxDepth: 3,
      fileExists: (p) => Object.prototype.hasOwnProperty.call(files, p),
      readFile: (p) => files[p],
    });
    // Either circular or undefined — depends on order. Just verify it
    // terminates without throwing.
    const result = resolver.resolveSchema("./b", "B", "/test/a.ts");
    expect(
      result === undefined || (result as { kind?: string }).kind === "circular",
    ).toBe(true);
  });
});
