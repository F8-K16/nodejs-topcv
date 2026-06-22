import { z } from "zod";

export const createCategorySchema = z.object({
  name: z.string().min(2, "Tên danh mục tối thiểu là 2 ký tự"),
  slug: z.string().min(2),
  parentCategoryId: z.number().int().positive(),
});

export const updateCategorySchema = z.object({
  name: z.string().min(2).optional(),
  slug: z.string().min(2).optional(),
  parentCategoryId: z.number().int().positive().optional(),
});
