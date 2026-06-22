import { z } from "zod";

export const createSkillSchema = z.object({
  name: z.string().trim().min(1).max(120),
});

export const updateSkillSchema = z.object({
  name: z.string().trim().min(1).max(120),
});
