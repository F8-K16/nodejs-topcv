import { z } from "zod";

export const aiCvSuggestSchema = z.object({
  section: z.enum(["summary"]),
  language: z.enum(["vi", "en"]).default("vi"),
  tone: z
    .enum(["professional", "friendly", "formal", "concise"])
    .default("professional"),
  profileTitle: z.string().trim().max(120).optional(),
  currentText: z.string().trim().max(2000).optional(),
  skills: z.array(z.string().trim().min(1).max(60)).max(50).optional(),
  experiences: z
    .array(
      z.object({
        title: z.string().trim().max(120).optional(),
        company: z.string().trim().max(120).optional(),
        highlights: z.array(z.string().trim().max(200)).max(8).optional(),
      }),
    )
    .max(10)
    .optional(),
});

export type AiCvSuggestPayload = z.infer<typeof aiCvSuggestSchema>;

export const aiApplyCoverLetterSchema = z.object({
  language: z.enum(["vi", "en"]).default("vi"),
  tone: z
    .enum(["professional", "friendly", "formal", "concise"])
    .default("professional"),
  length: z.enum(["short", "medium", "long"]).default("medium"),
  jobTitle: z.string().trim().min(2).max(160),
  companyName: z.string().trim().max(160).optional(),
  jobDescription: z.string().trim().min(10).max(8000),
  skills: z.array(z.string().trim().min(1).max(60)).max(50).optional(),
  candidateHighlights: z
    .array(z.string().trim().min(1).max(140))
    .max(12)
    .optional(),
});

export type AiApplyCoverLetterPayload = z.infer<
  typeof aiApplyCoverLetterSchema
>;

export const aiJobQuestionsSchema = z.object({
  language: z.enum(["vi", "en"]).default("vi"),
  jobTitle: z.string().trim().min(2).max(160),
  companyName: z.string().trim().max(160).optional(),
  jobDescription: z.string().trim().min(10).max(8000),
  skills: z.array(z.string().trim().min(1).max(60)).max(50).optional(),
});

export type AiJobQuestionsPayload = z.infer<typeof aiJobQuestionsSchema>;

export const aiCvReviewJobSchema = z.object({
  language: z.enum(["vi", "en"]).default("vi"),
  jobId: z.coerce.number().int().positive("jobId không hợp lệ"),
  resumeId: z.coerce.number().int().positive("resumeId không hợp lệ"),
});

export type AiCvReviewJobPayload = z.infer<typeof aiCvReviewJobSchema>;
