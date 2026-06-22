import { Request, Response } from "express";
import { SavedJobService } from "../services/saved_job.service";

export const savedJobController = {
  saveJob: async (req: Request, res: Response) => {
    const data = await SavedJobService.saveJob(
      req.user!.id,
      Number(req.params.jobId),
    );
    res.json({
      message: "Lưu việc làm thành công",
      data,
    });
  },

  unsaveJob: async (req: Request, res: Response) => {
    await SavedJobService.unsaveJob(req.user!.id, Number(req.params.jobId));
    res.json({ message: "Bỏ lưu việc làm thành công" });
  },

  getSavedJobs: async (req: Request, res: Response) => {
    const data = await SavedJobService.getSavedJobs(req.user!.id);
    res.json(data);
  },

  checkSaved: async (req: Request, res: Response) => {
    const data = await SavedJobService.checkSaved(
      req.user!.id,
      Number(req.params.jobId),
    );
    res.json(data);
  },
};
