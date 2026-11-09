import {
  generateModule as generateModuleSource,
  serialize as serializeSource,
} from "../src/index.js";
import type { SerializeOptions } from "@zod-codepen/core";

export { registerHandler, zodV3Adapter } from "../src/index.js";

/**
 * Test-only wrapper: every generated expression/module must be accepted by
 * the JS engine's parser. Guards against outputs like
 * `z.number().min(-2**31)` that only fail when user code is compiled.
 */

/**
 * Compile a generated expression with the JS engine's parser.
 * Throws on invalid syntax before any assertion can pass.
 */
function assertExpressionParses(code: string): void {
  new Function("z", `return (${code});`);
}

/**
 * Compile every statement in a generated ESM module.
 * `import` lines are dropped because `new Function` bodies cannot contain
 * them; the rest is plain statement syntax the JS engine can parse.
 */
function assertModuleParses(code: string): void {
  const body = code
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("import "))
    .join("\n")
    .replace(/\bexport\s+const\b/g, "const");
  new Function("z", body);
}

export function serialize(schema: unknown, options?: SerializeOptions): string {
  const code = serializeSource(schema, options);
  assertExpressionParses(code);
  return code;
}

export function generateModule(
  schemas: Record<string, unknown>,
  options?: SerializeOptions,
): string {
  const code = generateModuleSource(schemas, options);
  assertModuleParses(code);
  return code;
}
