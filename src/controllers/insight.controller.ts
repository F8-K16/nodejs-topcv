import { Request, Response } from "express";
import { insightService } from "../services/insight.service";

export const insightController = {
  salary: async (req: Request, res: Response) => {
    const byRaw = String(req.query.by ?? "category").toLowerCase();
    const by = byRaw === "province" ? "province" : "category";
    const data = await insightService.salaryBenchmark(by);
    res.json(data);
  },
};
