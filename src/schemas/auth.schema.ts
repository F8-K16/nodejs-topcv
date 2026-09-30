import { z } from "zod";
import { userService } from "../services/user.service";

export const emailSchema = z
  .string()
  .min(1, "Email không được để trống")
  .email("Email không đúng định dạng");

export const passwordSchema = z.string().min(6, "Mật khẩu phải từ 6 ký tự");

export const nameSchema = z.string().min(1, "Tên không được để trống");

export const phoneSchema = z
  .string()
  .min(1, "Số điện thoại không được để trống")
  .transform((val) => val.replace(/[\s.-]/g, ""))
  .transform((val) => {
    if (val.startsWith("0")) return "+84" + val.slice(1);
    return val;
  })
  .refine((val) => /^\+84\d{9}$/.test(val), {
    message: "SĐT không hợp lệ (+84xxxxxxxxx)",
  });
export const roleSchema = z
  .union([
    z.array(z.union([z.coerce.number(), z.string()])),
    z.coerce.number(),
    z.string(),
  ])
  .transform((val) => (Array.isArray(val) ? val : [val]))
  .refine((val) => val.length > 0, {
    message: "Phải chọn ít nhất 1 vai trò",
  });

export const isVerifiedSchema = z.coerce.boolean().optional();

export const registerSchema = z
  .object({
    username: nameSchema,
    email: emailSchema,
    password: passwordSchema,
    phone: phoneSchema,
    roles: roleSchema,

    companyName: z.string().optional(),
    location: z.string().optional(),
    provinceId: z.coerce.number().optional(),
    districtId: z.coerce.number().optional(),
    inviteToken: z.string().optional(),
    isVerified: isVerifiedSchema.optional(),
  })
  .superRefine(async (data, ctx) => {
    const existingEmail = await userService.existingEmail(data.email);

    if (existingEmail) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Email đã tồn tại",
        path: ["email"],
      });
    }

    if (data.phone) {
      const existingPhone = await userService.existingPhone(data.phone);

      if (existingPhone) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Số điện thoại đã tồn tại",
          path: ["phone"],
        });
      }
    }
  });

export const updateUserSchema = (userId: number) =>
  z
    .object({
      username: nameSchema,
      email: emailSchema,
      password: z
        .string()
        .min(6, "Mật khẩu phải từ 6 ký tự")
        .optional()
        .or(z.literal("")),

      phone: phoneSchema,
      roles: roleSchema,
      isVerified: isVerifiedSchema,
      isBlocked: z.boolean().optional(),
    })
    .superRefine(async (data, ctx) => {
      const existingEmail = await userService.existingEmail(data.email, userId);

      if (existingEmail) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Email đã tồn tại",
          path: ["email"],
        });
      }

      const existingPhone = await userService.existingPhone(data.phone, userId);

      if (existingPhone) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "SĐT đã tồn tại",
          path: ["phone"],
        });
      }
    });

export const loginSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
});

export const googleOAuthCodeSchema = z.object({
  code: z.string().min(1, "Mã xác thực Google không hợp lệ"),
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, "Chưa cung cấp refresh token"),
});

export const verifyEmailSchema = z.object({
  email: emailSchema,
  code: z.string().min(1, "Chưa cung cấp mã OTP"),
});

export const emailOnlySchema = z.object({
  email: emailSchema,
});

export const resetPasswordSchema = z.object({
  email: emailSchema,
  code: z.string().min(1, "Chưa cung cấp mã OTP"),
  newPassword: passwordSchema,
});

export const twoFactorCodeSchema = z.object({
  code: z.string().regex(/^\d{6}$/, "Mã xác thực gồm 6 chữ số"),
});

export const twoFactorVerifySchema = z.object({
  challengeToken: z.string().min(20, "Phiên xác thực không hợp lệ"),
  code: z.string().regex(/^\d{6}$/, "Mã xác thực gồm 6 chữ số"),
});

export const twoFactorDisableSchema = z.object({
  code: z.string().regex(/^\d{6}$/, "Mã xác thực gồm 6 chữ số"),
  password: passwordSchema,
});

export const changePasswordSchema = z
  .object({
    oldPassword: passwordSchema,
    newPassword: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Mật khẩu nhập lại không khớp",
    path: ["confirmPassword"],
  });
