import { ADMIN_ROUTE_PERMISSIONS } from "../constants/admin-permissions";
import { invalidateUserAuthDataCache } from "../utils/cache";
import { logger } from "../utils/logger";
import { prisma } from "../utils/prisma";

/**
 * Tạo các quyền `admin:*` mà route đang kiểm tra và gán đủ cho vai trò ADMIN.
 * Seed cũ chỉ có tên `MODULE_ACTION`, nên admin "full quyền" vẫn thiếu
 * `admin:moderation:approve` / `admin:moderation:reject`.
 */
export async function ensureAdminRoutePermissions(): Promise<void> {
  const moduleNames = Array.from(
    new Set(ADMIN_ROUTE_PERMISSIONS.map((item) => item.module)),
  );
  const actionNames = Array.from(
    new Set(ADMIN_ROUTE_PERMISSIONS.map((item) => item.action)),
  );

  const moduleIds = new Map<string, number>();
  for (const name of moduleNames) {
    const row = await prisma.module.upsert({
      where: { name },
      update: { status: true },
      create: { name, status: true },
      select: { id: true },
    });
    moduleIds.set(name, row.id);
  }

  const actionIds = new Map<string, number>();
  for (const name of actionNames) {
    const row = await prisma.action.upsert({
      where: { name },
      update: { status: true },
      create: { name, status: true },
      select: { id: true },
    });
    actionIds.set(name, row.id);
  }

  let createdPermissions = 0;
  const permissionIds: number[] = [];

  for (const item of ADMIN_ROUTE_PERMISSIONS) {
    const moduleId = moduleIds.get(item.module);
    const actionId = actionIds.get(item.action);
    if (!moduleId || !actionId) continue;

    const moduleAction = await prisma.moduleAction.upsert({
      where: { moduleId_actionId: { moduleId, actionId } },
      update: {},
      create: { moduleId, actionId },
      select: { id: true },
    });

    const existing = await prisma.permission.findUnique({
      where: { name: item.name },
      select: { id: true },
    });
    if (existing) {
      permissionIds.push(existing.id);
      continue;
    }

    const created = await prisma.permission.create({
      data: { name: item.name, moduleActionId: moduleAction.id },
      select: { id: true },
    });
    createdPermissions += 1;
    permissionIds.push(created.id);
  }

  const adminRole = await prisma.role.findUnique({
    where: { name: "ADMIN" },
    select: { id: true },
  });
  if (!adminRole) {
    logger.warn("Skip granting admin route permissions: ADMIN role missing");
    return;
  }

  const granted = await prisma.rolePermission.createMany({
    data: permissionIds.map((permissionId) => ({
      roleId: adminRole.id,
      permissionId,
    })),
    skipDuplicates: true,
  });

  if (createdPermissions === 0 && granted.count === 0) return;

  const admins = await prisma.userRole.findMany({
    where: { roleId: adminRole.id },
    select: { userId: true },
  });
  await Promise.all(
    admins.map((row) => invalidateUserAuthDataCache(row.userId)),
  );

  logger.info("Synced admin route permissions", {
    createdPermissions,
    granted: granted.count,
  });
}
