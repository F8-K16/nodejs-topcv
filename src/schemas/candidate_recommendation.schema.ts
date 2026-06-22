import { z } from "zod";

import { ExperienceLevel, JobType } from "../generated/prisma/enums";

const positiveIdArray = z
  .array(z.coerce.number().int().positive())
  .max(50)
  .optional();

export const recommendationProfilePutSchema = z.object({
  desiredMinSalary: z
    .union([z.coerce.number().int().min(0), z.null()])
    .optional(),
  desiredMaxSalary: z
    .union([z.coerce.number().int().min(0), z.null()])
    .optional(),
  jobType: z.union([z.nativeEnum(JobType), z.null()]).optional(),
  experienceLevel: z
    .union([z.nativeEnum(ExperienceLevel), z.null()])
    .optional(),
  preferredProvinceId: z
    .union([z.coerce.number().int().positive(), z.null()])
    .optional(),
  preferredDistrictId: z
    .union([z.coerce.number().int().positive(), z.null()])
    .optional(),
  isOpenToRemote: z.boolean().optional(),
  skillIds: positiveIdArray,
  categoryIds: positiveIdArray,
});

export type RecommendationProfilePutBody = z.infer<
  typeof recommendationProfilePutSchema
>;
