import { z } from "zod";

import {
  assertDeadlineAtLeastOneDayFromNow,
  coreJobSchema,
} from "./job.schema";
import { updateApplicationStatusSchema } from "./application.schema";
import { emailSchema } from "./auth.schema";

export const employerCreateJobSchema = coreJobSchema
  .omit({
    companyId: true,
    employerId: true,
    moderationStatus: true,
    isFeatured: true,
  })
  .superRefine(assertDeadlineAtLeastOneDayFromNow);

export const employerUpdateJobSchema = coreJobSchema
  .omit({
    companyId: true,
    employerId: true,
    moderationStatus: true,
    isFeatured: true,
  })
  .partial()
  .superRefine(assertDeadlineAtLeastOneDayFromNow);

export const employerApplicationStatusSchema = updateApplicationStatusSchema;

const emptyToUndef = (v: unknown) => {
  if (v == null) return undefined;
  if (typeof v === "string" && v.trim() === "") return undefined;
  return v;
};

export const employerUpdateCompanySchema = z.object({
  name: z.string().min(1),
  description: z.preprocess(emptyToUndef, z.string().optional()),
  location: z.string().min(1),
  website: z.preprocess(emptyToUndef, z.string().optional()),
  logo: z.preprocess(emptyToUndef, z.string().optional()),
  provinceId: z.coerce.number().int().positive(),
  districtId: z.coerce.number().int().positive(),
  categoryIds: z
    .array(z.coerce.number().int().positive())
    .min(1, { message: "At least one company category is required" }),
});

export const employerCreateInviteSchema = z.object({
  email: emailSchema,
});
