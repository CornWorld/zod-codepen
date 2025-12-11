// Mock runtime schema file (simulating drizzle-orm dependency)
import { z } from "zod";

// Simulating a heavy dependency export
export const $drizzleInternal = "should be filtered";

// API schemas that should be included
export const User = z.object({
  id: z.number(),
  name: z.string(),
  email: z.string().email(),
  createdAt: z.date(),
});

export const Post = z.object({
  id: z.number(),
  title: z.string().min(1).max(100),
  content: z.string(),
  authorId: z.number(),
  published: z.boolean().default(false),
});

export const Status = z.enum(["active", "inactive", "pending"]);

export const CreateUserInput = z.object({
  name: z.string().min(1),
  email: z.string().email(),
});

// Type-only export (should be filtered)
export type UserType = z.infer<typeof User>;
