import { z } from "zod";
import {
  ExperienceLevel,
  JobModerationStatus,
  JobType,
} from "../generated/prisma/enums";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const jobModerationEnum = z.enum([
  JobModerationStatus.PENDING,
  JobModerationStatus.APPROVED,
  JobModerationStatus.REJECTED,
]);

const jobFields = {
  title: z.string().min(1, "Tiêu đề không được để trống"),
  description: z.string().min(1, "Mô tả không được để trống"),

  minSalary: z.number().int().nonnegative().optional(),
  maxSalary: z.number().int().nonnegative().optional(),

  quantity: z.number().min(1),

  jobType: z.enum(JobType),
  experienceLevel: z.enum(ExperienceLevel),

  employerId: z.number().optional(),
  companyId: z.number(),
  categoryId: z.number(),

  moderationStatus: jobModerationEnum.optional(),
  deadline: z.coerce.date().optional().nullable(),
  isFeatured: z.boolean().optional(),
  workLocation: z.string().max(500).optional().nullable(),
  skillIds: z.array(z.number().int().positive()).max(50).optional(),
};

export function assertDeadlineAtLeastOneDayFromNow(
  data: { deadline?: Date | null | undefined },
  ctx: z.RefinementCtx,
) {
  if (data.deadline == null) return;
  const d = data.deadline;
  if (d.getTime() < Date.now() + MS_PER_DAY) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message:
        "H\u1ea1n n\u1ed9p h\u1ed3 s\u01a1 ph\u1ea3i c\u00e1ch th\u1eddi \u0111i\u1ec3m hi\u1ec7n t\u1ea1i \u00edt nh\u1ea5t 1 ng\u00e0y (24 gi\u1edd).",
      path: ["deadline"],
    });
  }
}

export const coreJobSchema = z.object(jobFields);

export const createJobSchema = coreJobSchema.superRefine(
  assertDeadlineAtLeastOneDayFromNow,
);

export const updateJobSchema = coreJobSchema
  .partial()
  .superRefine(assertDeadlineAtLeastOneDayFromNow);

export const patchJobModerationSchema = z.object({
  status: jobModerationEnum,
});

export const patchJobFeaturedSchema = z.object({
  isFeatured: z.boolean(),
});
