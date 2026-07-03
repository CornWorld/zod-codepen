import { z } from "zod";

export const BaseUser = z.object({
  id: z.number(),
  createdAt: z.date(),
});
