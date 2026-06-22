import { Request, Response } from "express";
import { applicationService } from "../services/application.service";
import type { ApplicationStatus } from "../generated/prisma/client";

export const applicationController = {
  index: async (req: Request, res: Response) => {
    const data = await applicationService.listForAdmin(
      req.query as Record<string, unknown>,
    );
    return res.json({ success: true, data });
  },

  updateStatus: async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    const { status } = req.body as { status: ApplicationStatus };
    const application = await applicationService.updateStatus(id, status);
    return res.json({
      success: true,
      message: "Cập nhật trạng thái ứng tuyển thành công",
      data: application,
    });
  },

  previewForAdmin: async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    const data = await applicationService.getApplicationPreviewForAdmin(id);
    return res.json({ success: true, data });
  },

  apply: async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const { jobId, resumeId, coverLetter } = req.body as {
      jobId: number;
      resumeId: number;
      coverLetter?: string;
    };
    const coverLetterText = coverLetter?.trim();
    const application = await applicationService.applyAsCandidate(userId, {
      jobId,
      resumeId,
      ...(coverLetterText ? { coverLetter: coverLetterText } : {}),
    });
    return res.status(201).json({
      success: true,
      message: "Nộp đơn ứng tuyển thành công",
      data: application,
    });
  },

  listMine: async (req: Request, res: Response) => {
    const rows = await applicationService.listForCandidate(req.user!.id);
    return res.json({ success: true, data: rows });
  },

  mineDetail: async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    const row = await applicationService.getForCandidate(req.user!.id, id);
    return res.json({ success: true, data: row });
  },

  appliedJobIds: async (req: Request, res: Response) => {
    const jobIds = await applicationService.getAppliedJobIds(req.user!.id);
    return res.json({ success: true, data: { jobIds } });
  },
};
