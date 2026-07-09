import { z } from "zod";

// Basic page schema with object, string, number, literal
export const Page = z.object({
  id: z.string(),
  title: z.string().min(1).max(200),
  slug: z.string().regex(/^[a-z0-9-]+$/),
  status: z.enum(["draft", "published", "archived"]),
  views: z.number().int().nonnegative(),
  content: z.string().optional(),
  publishedAt: z.date().nullable(),
});

// discriminatedUnion for content blocks
export const Block = z.discriminatedUnion("type", [
  z.object({ type: z.literal("text"), body: z.string() }),
  z.object({ type: z.literal("heading"), text: z.string(), level: z.number() }),
  z.object({
    type: z.literal("image"),
    url: z.string().url(),
    alt: z.string().optional(),
  }),
]);

// Simple union
export const StringOrNumber = z.union([z.string(), z.number()]);

// Array with constraints
export const TagList = z.array(z.string()).nonempty();

// Literal
export const DefaultTheme = z.literal("light");
