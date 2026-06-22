import { Request, Response } from "express";
import { siteSettingsService } from "../services/site_settings.service";
import { auditService } from "../services/audit.service";

export const siteSettingsController = {
  show: async (_req: Request, res: Response) => {
    const data = await siteSettingsService.getOrCreate();
    res.json({ data });
  },

  update: async (req: Request, res: Response) => {
    const data = await siteSettingsService.update(req.body);
    await auditService.log(req, {
      action: "admin:settings:update",
      entityType: "SiteSettings",
      entityId: "singleton",
    });
    res.json({ data, message: "Đã cập nhật cấu hình" });
  },
};
