import { Request, Response } from "express";
import { auditLogService } from "../services/audit_log.service";

export const auditLogController = {
  index: async (req: Request, res: Response) => {
    const data = await auditLogService.list(req.query as Record<string, unknown>);
    res.json(data);
  },

  show: async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    const log = await auditLogService.getById(id);
    if (!log) {
      return res.status(404).json({ message: "Không tìm thấy log" });
    }
    return res.json({ data: log });
  },
};
