import { Request } from "express";
import { Prisma } from "../generated/prisma/client";
import { prisma } from "../utils/prisma";

type AuditLogInput = {
  action: string;
  entityType?: string;
  entityId?: string | number;
  success?: boolean;
  metadata?: unknown;
};

export const auditService = {
  async log(req: Request, input: AuditLogInput) {
    const actorUserId = req.user?.id;
    if (!actorUserId) return;

    try {
      const metadata =
        input.metadata === undefined
          ? undefined
          : (input.metadata as Prisma.InputJsonValue);
      await prisma.auditLog.create({
        data: {
          actorUserId,
          action: input.action,
          ...(input.entityType !== undefined && { entityType: input.entityType }),
          ...(input.entityId != null && { entityId: String(input.entityId) }),
          success: input.success ?? true,
          ...(req.requestId !== undefined && { requestId: req.requestId }),
          ...(req.ip !== undefined && { ip: req.ip }),
          ...(req.get("user-agent") !== undefined && {
            userAgent: req.get("user-agent")!,
          }),
          ...(metadata !== undefined && { metadata }),
        },
      });
    } catch {
      return;
    }
  },
};
