import { z } from "zod";

const numberField = (name: string) =>
  z
    .union([z.string(), z.number()])
    .transform((val) => Number(val))
    .refine((val) => !isNaN(val) && val > 0, {
      message: `${name} không hợp lệ`,
    });

export const createCompanySchema = z
  .object({
    name: z.string().min(1, "Tên công ty không được để trống"),
    description: z.string().max(2000, "Mô tả quá dài").optional(),
    location: z.string().min(1, "Địa chỉ không được để trống"),
    website: z
      .string()
      .optional()
      .or(z.literal(""))
      .refine((val) => !val || /^https?:\/\//.test(val), {
        message: "Website không hợp lệ",
      }),
    logo: z
      .string()
      .optional()
      .or(z.literal(""))
      .refine((val) => !val || /^https?:\/\//.test(val), {
        message: "Logo không hợp lệ",
      }),

    status: z
      .union([z.boolean(), z.string()])
      .transform((val) => val === true || val === "true")
      .optional(),

    provinceId: numberField("Tỉnh/Thành"),
    districtId: numberField("Quận/Huyện"),
    categoryIds: z.array(numberField("Danh mục")),
  })
  .superRefine((data, ctx) => {
    if (!data.provinceId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Vui lòng chọn tỉnh/thành",
        path: ["provinceId"],
      });
    }

    if (!data.districtId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Vui lòng chọn quận/huyện",
        path: ["districtId"],
      });
    }

    if (data.districtId && !data.provinceId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Phải chọn tỉnh/thành trước",
        path: ["districtId"],
      });
    }

    if (!data.categoryIds || data.categoryIds.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Vui lòng chọn ít nhất 1 danh mục",
        path: ["categoryIds"],
      });
    }
  });

export const updateCompanySchema = z
  .object({
    name: z.string().min(1, "Tên công ty không được để trống").optional(),
    description: z.string().max(2000, "Mô tả quá dài").optional(),
    location: z.string().min(1, "Địa chỉ không được để trống").optional(),

    website: z
      .string()
      .optional()
      .or(z.literal(""))
      .refine((val) => !val || /^https?:\/\//.test(val), {
        message: "Website không hợp lệ",
      }),

    logo: z
      .string()
      .optional()
      .or(z.literal(""))
      .refine((val) => !val || /^https?:\/\//.test(val), {
        message: "Logo không hợp lệ",
      }),

    status: z
      .union([z.boolean(), z.string()])
      .transform((val) => val === true || val === "true")
      .optional(),

    provinceId: numberField("Tỉnh/Thành").optional(),
    districtId: numberField("Quận/Huyện").optional(),
    categoryIds: z.array(numberField("Danh mục")).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.provinceId && !data.districtId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Vui lòng chọn quận/huyện",
        path: ["districtId"],
      });
    }

    if (!data.provinceId && data.districtId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Phải chọn tỉnh/thành trước",
        path: ["districtId"],
      });
    }
    if (!data.categoryIds || data.categoryIds.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Vui lòng chọn ít nhất 1 danh mục",
        path: ["categoryIds"],
      });
    }
  });
