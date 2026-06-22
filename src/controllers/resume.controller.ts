import { Request, Response } from "express";
import { resumeService } from "../services/resume.service";
import { candidateService } from "../services/candidate.service";

export const resumeController = {
  getAll: async (req: Request, res: Response) => {
    const candidates = await candidateService.getAllCandidates();
    const resumes = await resumeService.getAll(req.query);
    res.json({
      ...resumes,
      candidates,
    });
  },
  getMyResume: async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const resumes = await resumeService.getResumeById(userId);
    res.json(resumes);
  },
  create: async (req: Request, res: Response) => {
    const data = req.body;
    const resume = await resumeService.createResume(data);
    res.json({
      message: "Tạo CV thành công",
      resume,
    });
  },
  uploadResume: async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const result = await resumeService.uploadMyResume(userId, req.body);
    res.json({
      message: "Upload CV thành công",
      result,
    });
  },
  update: async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    const data = req.body;
    const resume = await resumeService.updateResume(id, data);
    res.json({
      message: "Cập nhật CV thành công",
      resume,
    });
  },
  delete: async (req: Request, res: Response) => {
    await resumeService.deleteResume(Number(req.params.id));
    res.json({ message: "Xóa CV thành công" });
  },

  restore: async (req: Request, res: Response) => {
    const resume = await resumeService.restoreResume(Number(req.params.id));
    res.json({ message: "Khôi phục CV thành công", resume });
  },
  deleteMyResume: async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const resumeId = Number(req.params.id);
    const result = await resumeService.deleteMyResume(userId, resumeId);
    res.json({ message: "Xóa CV thành công", result });
  },
};
