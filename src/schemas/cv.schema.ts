import { z } from "zod";

export const cvContentSchema = z
  .record(z.string(), z.unknown())
  .refine((value) => Object.keys(value).length <= 200, {
    message: "Cấu trúc CV quá lớn",
  });

export const cvCreateSchema = z.object({
  templateId: z.coerce.number().int().positive(),
  title: z.string().trim().min(1).max(160).optional(),
});

export const cvUpdateSchema = z.object({
  title: z.string().trim().min(1).max(160).optional(),
  status: z.enum(["DRAFT", "COMPLETED"]).optional(),
  content: cvContentSchema.optional(),
});

export const cvTemplateDataSchema = z
  .record(z.string(), z.unknown())
  .refine((value) => Object.keys(value).length > 0, {
    message: "templateData không hợp lệ",
  });

export const createCvTemplateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(255).optional().nullable(),
  thumbnailUrl: z.string().trim().url().max(512).optional().nullable(),
  templateData: cvTemplateDataSchema,
  isActive: z.boolean().optional(),
});

export const updateCvTemplateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(255).optional().nullable(),
  thumbnailUrl: z.string().trim().url().max(512).optional().nullable(),
  templateData: cvTemplateDataSchema.optional(),
  isActive: z.boolean().optional(),
});

export type CvCreateInput = z.infer<typeof cvCreateSchema>;
export type CvUpdateInput = z.infer<typeof cvUpdateSchema>;
export type CreateCvTemplateInput = z.infer<typeof createCvTemplateSchema>;
export type UpdateCvTemplateInput = z.infer<typeof updateCvTemplateSchema>;
