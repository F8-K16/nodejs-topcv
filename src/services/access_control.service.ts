import { Prisma } from "../generated/prisma/client";
import { prisma, prismaTransaction } from "../utils/prisma";
import { HttpException } from "../utils/exception";
import { invalidateUserAuthDataCache } from "../utils/cache";
import type { CreateRoleDto, UpdateRoleDto } from "../schemas/access_control.schema";

/**
 * Tên vai trò được hệ thống dùng cứng trong middleware / proxy / FE guards.
 * Không cho phép admin đổi tên hoặc xoá để tránh phá vỡ luồng auth.
 */
export const PROTECTED_ROLE_NAMES = new Set<string>([
  "ADMIN",
  "MODERATOR",
  "SUPPORT",
  "EMPLOYER",
  "CANDIDATE",
]);

type ListRolesQuery = {
  page?: number | string;
  limit?: number | string;
  search?: string;
  status?: string;
};

async function invalidateUsersOfRoles(roleIds: number[]): Promise<void> {
  if (roleIds.length === 0) return;
  const userRoles = await prisma.userRole.findMany({
    where: { roleId: { in: roleIds } },
    select: { userId: true },
  });
  const userIds = Array.from(
    new Set<number>(userRoles.map((u) => Number(u.userId))),
  );
  await Promise.all(userIds.map((id) => invalidateUserAuthDataCache(id)));
}

async function assertPermissionsExist(ids: number[]): Promise<void> {
  if (ids.length === 0) return;
  const uniqueIds = Array.from(new Set(ids));
  const found = await prisma.permission.findMany({
    where: { id: { in: uniqueIds } },
    select: { id: true },
  });
  if (found.length !== uniqueIds.length) {
    const foundSet = new Set(found.map((p) => p.id));
    const missing = uniqueIds.filter((id) => !foundSet.has(id));
    throw new HttpException(
      "Một số quyền không tồn tại",
      400,
      "VALIDATION_ERROR",
      { permissionIds: missing },
    );
  }
}

export const accessControlService = {
  /**
   * Trả về toàn bộ permission kèm thông tin module/action để FE nhóm hiển thị.
   * Read-only theo scope hiện tại — admin không thể tạo permission từ UI.
   */
  async listPermissionsGrouped() {
    const permissions = await prisma.permission.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        moduleAction: {
          select: {
            id: true,
            module: { select: { id: true, name: true, status: true } },
            action: { select: { id: true, name: true, status: true } },
          },
        },
      },
    });

    type ModuleBucket = {
      moduleId: number;
      moduleName: string;
      moduleStatus: boolean;
      permissions: Array<{
        id: number;
        name: string;
        actionId: number;
        actionName: string;
        actionStatus: boolean;
      }>;
    };

    const map = new Map<number, ModuleBucket>();
    for (const p of permissions) {
      const moduleId = p.moduleAction.module.id;
      if (!map.has(moduleId)) {
        map.set(moduleId, {
          moduleId,
          moduleName: p.moduleAction.module.name,
          moduleStatus: p.moduleAction.module.status,
          permissions: [],
        });
      }
      map.get(moduleId)!.permissions.push({
        id: p.id,
        name: p.name,
        actionId: p.moduleAction.action.id,
        actionName: p.moduleAction.action.name,
        actionStatus: p.moduleAction.action.status,
      });
    }

    return {
      modules: Array.from(map.values()).sort((a, b) =>
        a.moduleName.localeCompare(b.moduleName),
      ),
      total: permissions.length,
    };
  },

  async listRoles(query: ListRolesQuery) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const search = (query.search ?? "").trim();

    const statusFilter =
      query.status === "true"
        ? true
        : query.status === "false"
          ? false
          : undefined;

    const where: Prisma.RoleWhereInput = {
      deletedAt: null,
      ...(search && { name: { contains: search } }),
      ...(statusFilter !== undefined && { status: statusFilter }),
    };

    const [roles, total] = await Promise.all([
      prisma.role.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          _count: {
            select: { rolePermissions: true, userRoles: true },
          },
        },
      }),
      prisma.role.count({ where }),
    ]);

    return {
      roles: roles.map((r) => ({
        id: r.id,
        name: r.name,
        status: r.status,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
        permissionCount: r._count.rolePermissions,
        userCount: r._count.userRoles,
        isProtected: PROTECTED_ROLE_NAMES.has(r.name),
      })),
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  },

  async getRoleDetail(id: number) {
    if (!Number.isFinite(id) || id <= 0) {
      throw new HttpException("Vai trò không tồn tại", 404, "ROLE_NOT_FOUND");
    }
    const role = await prisma.role.findFirst({
      where: { id, deletedAt: null },
      select: {
        id: true,
        name: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        rolePermissions: {
          select: { permissionId: true },
        },
        _count: { select: { userRoles: true } },
      },
    });
    if (!role) {
      throw new HttpException("Vai trò không tồn tại", 404, "ROLE_NOT_FOUND");
    }
    return {
      id: role.id,
      name: role.name,
      status: role.status,
      createdAt: role.createdAt,
      updatedAt: role.updatedAt,
      permissionIds: role.rolePermissions.map((rp) => rp.permissionId),
      userCount: role._count.userRoles,
      isProtected: PROTECTED_ROLE_NAMES.has(role.name),
    };
  },

  async createRole(input: CreateRoleDto) {
    const name = input.name.trim().toUpperCase();
    const existing = await prisma.role.findFirst({
      where: { name, deletedAt: null },
    });
    if (existing) {
      throw new HttpException(
        "Tên vai trò đã tồn tại",
        400,
        "ROLE_NAME_DUPLICATED",
      );
    }

    await assertPermissionsExist(input.permissionIds);

    const created = await prismaTransaction(async (tx) => {
      const role = await tx.role.create({
        data: { name, status: input.status ?? true },
        select: { id: true },
      });
      if (input.permissionIds.length > 0) {
        await tx.rolePermission.createMany({
          data: input.permissionIds.map((permissionId) => ({
            roleId: role.id,
            permissionId,
          })),
          skipDuplicates: true,
        });
      }
      return role;
    });

    return this.getRoleDetail(created.id);
  },

  async updateRole(id: number, input: UpdateRoleDto) {
    if (!Number.isFinite(id) || id <= 0) {
      throw new HttpException("Vai trò không tồn tại", 404, "ROLE_NOT_FOUND");
    }
    const role = await prisma.role.findUnique({
      where: { id },
      select: { id: true, name: true },
    });
    if (!role) {
      throw new HttpException("Vai trò không tồn tại", 404, "ROLE_NOT_FOUND");
    }

    const nextName = input.name.trim().toUpperCase();
    const isProtected = PROTECTED_ROLE_NAMES.has(role.name);

    if (isProtected && nextName !== role.name) {
      throw new HttpException(
        "Không thể đổi tên vai trò hệ thống",
        400,
        "ROLE_PROTECTED",
      );
    }

    if (nextName !== role.name) {
      const dup = await prisma.role.findFirst({
        where: { name: nextName, deletedAt: null, NOT: { id } },
        select: { id: true },
      });
      if (dup) {
        throw new HttpException(
          "Tên vai trò đã tồn tại",
          400,
          "ROLE_NAME_DUPLICATED",
        );
      }
    }

    await assertPermissionsExist(input.permissionIds);

    await prismaTransaction(async (tx) => {
      await tx.role.update({
        where: { id },
        data: {
          name: nextName,
          ...(input.status !== undefined && { status: input.status }),
        },
      });
      await tx.rolePermission.deleteMany({ where: { roleId: id } });
      if (input.permissionIds.length > 0) {
        await tx.rolePermission.createMany({
          data: input.permissionIds.map((permissionId) => ({
            roleId: id,
            permissionId,
          })),
          skipDuplicates: true,
        });
      }
    });

    await invalidateUsersOfRoles([id]);
    return this.getRoleDetail(id);
  },

  async deleteRole(id: number) {
    if (!Number.isFinite(id) || id <= 0) {
      throw new HttpException("Vai trò không tồn tại", 404, "ROLE_NOT_FOUND");
    }
    const role = await prisma.role.findFirst({
      where: { id, deletedAt: null },
      select: {
        id: true,
        name: true,
        _count: { select: { userRoles: true } },
      },
    });
    if (!role) {
      throw new HttpException("Vai trò không tồn tại", 404, "ROLE_NOT_FOUND");
    }
    if (PROTECTED_ROLE_NAMES.has(role.name)) {
      throw new HttpException(
        "Không thể xóa vai trò hệ thống",
        400,
        "ROLE_PROTECTED",
      );
    }
    if (role._count.userRoles > 0) {
      throw new HttpException(
        "Không thể xóa vai trò đang được gán cho người dùng",
        400,
        "ROLE_IN_USE",
        { userCount: role._count.userRoles },
      );
    }

    await prismaTransaction(async (tx) => {
      await tx.role.update({
        where: { id },
        data: { deletedAt: new Date(), status: false },
      });
    });
    return { success: true };
  },

  async restoreRole(id: number) {
    if (!Number.isFinite(id) || id <= 0) {
      throw new HttpException("Vai trò không tồn tại", 404, "ROLE_NOT_FOUND");
    }
    const role = await prisma.role.update({
      where: { id },
      data: { deletedAt: null, status: true },
      select: { id: true, name: true, status: true },
    });
    return role;
  },
};
