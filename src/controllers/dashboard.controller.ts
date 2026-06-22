import { Request, Response } from "express";
import { dashboardService } from "../services/dashboard.service";

export const dashboardController = {
  index: (req: Request, res: Response) => {
    res.render("admin/dashboard", {
      layout: "layouts/admin",
      currentPath: req.path,
    });
  },

  summary: async (_req: Request, res: Response) => {
    const data = await dashboardService.getSummary();
    return res.json({ success: true, data });
  },
};
