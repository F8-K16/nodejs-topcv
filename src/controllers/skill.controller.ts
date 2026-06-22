import { Request, Response } from "express";
import { skillService } from "../services/skill.service";

export const skillController = {
  index: async (req: Request, res: Response) => {
    const data = await skillService.list(req.query);
    res.json(data);
  },

  selectAll: async (_req: Request, res: Response) => {
    const skills = await skillService.listAllForSelect();
    res.json({ skills });
  },

  store: async (req: Request, res: Response) => {
    const skill = await skillService.create(req.body.name);
    res.status(201).json(skill);
  },

  update: async (req: Request, res: Response) => {
    const skill = await skillService.update(
      Number(req.params.id),
      req.body.name,
    );
    res.json(skill);
  },

  destroy: async (req: Request, res: Response) => {
    await skillService.delete(Number(req.params.id));
    res.json({ success: true, message: "Đã xóa kỹ năng" });
  },

  restore: async (req: Request, res: Response) => {
    const skill = await skillService.restore(Number(req.params.id));
    res.json({ success: true, message: "Đã khôi phục kỹ năng", skill });
  },
};
