import { z } from "zod";

const roleName = z
  .string({ message: "Tên vai trò là bắt buộc" })
  .trim()
  .min(1, { message: "Tên vai trò là bắt buộc" })
  .max(200, { message: "Tên vai trò tối đa 200 ký tự" })
  .regex(/^[A-Z0-9_]+$/, {
    message: "Tên vai trò chỉ gồm chữ HOA, số và dấu gạch dưới",
  });

const permissionIds = z
  .array(z.number().int().positive(), {
    message: "Danh sách quyền không hợp lệ",
  })
  .max(2000)
  .default([]);

export const createRoleSchema = z.object({
  name: roleName,
  status: z.boolean().optional().default(true),
  permissionIds,
});

export const updateRoleSchema = z.object({
  name: roleName,
  status: z.boolean().optional(),
  permissionIds,
});

export type CreateRoleDto = z.infer<typeof createRoleSchema>;
export type UpdateRoleDto = z.infer<typeof updateRoleSchema>;
