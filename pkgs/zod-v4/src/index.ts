import { createSerializer, type SerializeOptions } from '@zod-codepen/core';
import { zodV4Adapter } from './adapter.js';

export { zodV4Adapter } from './adapter.js';

/**
 * Pre-configured serializer for Zod v4
 */
const serializer = createSerializer(zodV4Adapter);

/**
 * Serialize a Zod v4 schema to code string
 */
export function serialize(schema: unknown, options?: SerializeOptions): string {
  return serializer.serialize(schema, options);
}

/**
 * Generate a module with multiple schema exports
 */
export function generateModule(
  schemas: Record<string, unknown>,
  options?: SerializeOptions,
): string {
  return serializer.generateModule(schemas, options);
}

/**
 * Register a custom handler for a schema type
 */
export const registerHandler = serializer.registerHandler;

export default serializer;
