import { z } from "zod";

export const createResumeSchema = z.object({
  title: z
    .string()
    .min(1, "Tiêu đề không được để trống")
    .max(255, "Tiêu đề quá dài"),

  fileUrl: z.string().url("File phải là URL hợp lệ"),

  candidateId: z.number("Thiếu thông tin ứng viên").int().positive(),
});

export type CreateResumeInput = z.infer<typeof createResumeSchema>;
export const updateResumeSchema = createResumeSchema;
