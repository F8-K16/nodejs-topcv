import { prisma } from "../utils/prisma";
import { Prisma } from "../generated/prisma/client";

type AuditLogQuery = Record<string, unknown>;

export const auditLogService = {
  async list(query: AuditLogQuery) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(Math.max(1, Number(query.limit) || 20), 50);
    const skip = (page - 1) * limit;

    const where: Prisma.AuditLogWhereInput = {};
    if (query.action) where.action = { contains: String(query.action) };
    if (query.actorUserId) where.actorUserId = Number(query.actorUserId);
    if (query.entityType) where.entityType = String(query.entityType);
    if (query.entityId) where.entityId = String(query.entityId);
    if (query.success != null) {
      const s = String(query.success);
      if (s === "true" || s === "false") where.success = s === "true";
    }

    if (query.from || query.to) {
      where.createdAt = {};
      if (query.from) where.createdAt.gte = new Date(String(query.from));
      if (query.to) where.createdAt.lte = new Date(String(query.to));
    }

    const [total, logs] = await Promise.all([
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        include: {
          actorUser: {
            select: { id: true, email: true, username: true },
          },
        },
      }),
    ]);

    return {
      logs,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  },

  async getById(id: number) {
    return prisma.auditLog.findUnique({
      where: { id },
      include: {
        actorUser: { select: { id: true, email: true, username: true } },
      },
    });
  },
};
