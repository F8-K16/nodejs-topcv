import { Request, Response } from "express";
import { notificationService } from "../services/notification.service";

export const notificationController = {
  list: async (req: Request, res: Response) => {
    const data = await notificationService.listForUser(req.user!.id, {
      page: Number((req.query as { page?: string }).page),
      limit: Number((req.query as { limit?: string }).limit),
      unreadOnly: (req.query as { unreadOnly?: string }).unreadOnly === "true",
    });
    return res.json({ success: true, data });
  },

  detail: async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) {
      return res.status(400).json({ success: false, message: "ID không hợp lệ" });
    }
    const row = await notificationService.getByIdForUser(req.user!.id, id);
    return res.json({ success: true, data: row });
  },

  unreadCount: async (req: Request, res: Response) => {
    const count = await notificationService.unreadCount(req.user!.id);
    return res.json({ success: true, data: { count } });
  },

  markRead: async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    await notificationService.markRead(req.user!.id, id);
    return res.json({ success: true, message: "Đã đọc" });
  },

  markAllRead: async (req: Request, res: Response) => {
    await notificationService.markAllRead(req.user!.id);
    return res.json({ success: true, message: "Đã đọc tất cả" });
  },
};
