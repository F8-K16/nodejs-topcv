import { Request, Response } from "express";

import { cvService } from "../services/cv.service";

export const cvController = {
  listTemplatesAdmin: async (_req: Request, res: Response) => {
    const data = await cvService.listTemplatesForAdmin();
    res.json({ templates: data });
  },

  createTemplateAdmin: async (req: Request, res: Response) => {
    const data = await cvService.createTemplate(req.body);
    res.status(201).json(data);
  },

  updateTemplateAdmin: async (req: Request, res: Response) => {
    const data = await cvService.updateTemplate(Number(req.params.id), req.body);
    res.json(data);
  },

  deleteTemplateAdmin: async (req: Request, res: Response) => {
    const data = await cvService.deleteTemplate(Number(req.params.id));
    res.json({ success: true, ...data });
  },

  restoreTemplateAdmin: async (req: Request, res: Response) => {
    const data = await cvService.restoreTemplate(Number(req.params.id));
    res.json({ success: true, message: "Đã khôi phục mẫu CV", template: data });
  },

  listTemplates: async (_req: Request, res: Response) => {
    const data = await cvService.listTemplates();
    res.json({ templates: data });
  },

  getTemplate: async (req: Request, res: Response) => {
    const data = await cvService.getTemplate(Number(req.params.id));
    res.json(data);
  },

  createCv: async (req: Request, res: Response) => {
    const data = await cvService.createCv(req.user!.id, req.body);
    res.status(201).json(data);
  },

  listMine: async (req: Request, res: Response) => {
    const data = await cvService.listMyCvs(req.user!.id);
    res.json({ cvs: data });
  },

  getMine: async (req: Request, res: Response) => {
    const data = await cvService.getMyCv(req.user!.id, Number(req.params.id));
    res.json(data);
  },

  updateMine: async (req: Request, res: Response) => {
    const data = await cvService.updateMyCv(
      req.user!.id,
      Number(req.params.id),
      req.body,
    );
    res.json(data);
  },

  deleteMine: async (req: Request, res: Response) => {
    const data = await cvService.deleteMyCv(
      req.user!.id,
      Number(req.params.id),
    );
    res.json({ success: true, ...data });
  },

  getPublicCv: async (req: Request, res: Response) => {
    const data = await cvService.getPublicCv(Number(req.params.id));
    res.json(data);
  },

  getCvForAdmin: async (req: Request, res: Response) => {
    const data = await cvService.getCvForAdmin(Number(req.params.id));
    res.json(data);
  },

  publishResume: async (req: Request, res: Response) => {
    const data = await cvService.publishCvAsResume(
      req.user!.id,
      Number(req.params.id),
    );
    res.json(data);
  },
};
