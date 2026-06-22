import { z } from "zod";

export const updateApplicationStatusSchema = z.object({
  status: z.enum(["PENDING", "REVIEWED", "ACCEPTED", "REJECTED"]),
});

export const applyJobSchema = z.object({
  jobId: z.coerce.number().int().positive("jobId không hợp lệ"),
  resumeId: z.coerce.number().int().positive("resumeId không hợp lệ"),
  coverLetter: z.string().trim().min(1).max(8000).optional(),
});
