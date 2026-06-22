import { z } from "zod";

const nameField = z.string().trim().min(1).max(120);
const codeField = z
  .union([z.string().trim().max(32), z.literal("")])
  .optional()
  .transform((v) => (v === undefined || v === "" ? undefined : v));

export const createProvinceSchema = z.object({
  name: nameField,
  code: codeField,
});

export const updateProvinceSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    code: z
      .union([z.string().trim().max(32), z.literal(""), z.null()])
      .optional()
      .transform((v) => (v === "" ? null : v)),
  })
  .refine((d) => d.name !== undefined || d.code !== undefined, {
    message: "Cần ít nhất tên hoặc mã",
    path: ["name"],
  });

export const createDistrictSchema = z.object({
  provinceId: z.coerce.number().int().positive(),
  name: nameField,
});

export const updateDistrictSchema = z.object({
  name: nameField,
});
