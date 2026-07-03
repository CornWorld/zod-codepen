// Simulates a schema file that imports a heavy third-party wrapper.
// `createSelectSchema` would normally drag in drizzle-orm + pg driver.
import { createSelectSchema } from "drizzle-zod";
import { z } from "zod";
import { BaseUser } from "./shared";

// Third-party wrapper — should emit RawNode placeholder.
export const DrizzleUser = createSelectSchema(undefined as never);

// Cross-file spread — should inline BaseUser's fields.
export const User = z.object({
  ...BaseUser.shape,
  role: z.enum(["admin", "user"]),
});

// Wrapper inlining.
const makeName = () => z.string().min(1).max(50);
export const Name = makeName();

// Plain primitive schema.
export const Email = z.string().email();

// Type export (filtered out by default).
export type UserType = typeof User._type;
