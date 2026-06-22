import { z } from "zod";

export const createCategoryParentSchema = z.object({
  name: z.string().min(2, "Tên danh mục tối thiểu là 2 ký tự"),
  slug: z.string().min(2),
});

export const updateCategoryParentSchema = z.object({
  name: z.string().min(2).optional(),
  slug: z.string().min(2).optional(),
});
