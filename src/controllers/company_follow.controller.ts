import { Request, Response } from "express";
import { companyFollowService } from "../services/company_follow.service";

export const companyFollowController = {
  list: async (req: Request, res: Response) => {
    const data = await companyFollowService.listFollowedCompanies(req.user!.id);
    res.json({ companies: data });
  },

  follow: async (req: Request, res: Response) => {
    const companyId = Number(req.params.id);
    const data = await companyFollowService.follow(req.user!.id, companyId);
    res.json(data);
  },

  unfollow: async (req: Request, res: Response) => {
    const companyId = Number(req.params.id);
    const data = await companyFollowService.unfollow(req.user!.id, companyId);
    res.json(data);
  },

  status: async (req: Request, res: Response) => {
    const companyId = Number(req.params.id);
    const data = await companyFollowService.status(req.user!.id, companyId);
    res.json(data);
  },
};
