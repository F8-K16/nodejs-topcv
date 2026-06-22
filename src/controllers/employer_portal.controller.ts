import { Request, Response } from "express";

import { employerPortalService } from "../services/employer_portal.service";
import { employerInviteService } from "../services/employer_invite.service";

export const employerPortalController = {
  me: async (req: Request, res: Response) => {
    const data = await employerPortalService.me(req.user!.id);
    res.json(data);
  },

  companyMembers: async (req: Request, res: Response) => {
    const data = await employerPortalService.listCompanyMembers(req.user!.id);
    res.json(data);
  },

  dashboard: async (req: Request, res: Response) => {
    const data = await employerPortalService.dashboard(req.user!.id);
    res.json(data);
  },

  formMeta: async (req: Request, res: Response) => {
    const data = await employerPortalService.formMeta(req.user!.id);
    res.json(data);
  },

  updateCompany: async (req: Request, res: Response) => {
    const data = await employerPortalService.updateCompanyProfile(
      req.user!.id,
      req.body,
    );
    res.json({ success: true, data });
  },

  listJobs: async (req: Request, res: Response) => {
    const data = await employerPortalService.listJobs(
      req.user!.id,
      req.query as Record<string, unknown>,
    );
    res.json(data);
  },

  getJob: async (req: Request, res: Response) => {
    const data = await employerPortalService.getJob(
      req.user!.id,
      Number(req.params.id),
    );
    res.json(data);
  },

  createJob: async (req: Request, res: Response) => {
    const data = await employerPortalService.createJob(req.user!.id, req.body);
    res.status(201).json(data);
  },

  updateJob: async (req: Request, res: Response) => {
    const data = await employerPortalService.updateJob(
      req.user!.id,
      Number(req.params.id),
      req.body,
    );
    res.json(data);
  },

  deleteJob: async (req: Request, res: Response) => {
    await employerPortalService.deleteJob(req.user!.id, Number(req.params.id));
    res.json({ success: true, message: "Deleted" });
  },

  listApplications: async (req: Request, res: Response) => {
    const data = await employerPortalService.listApplications(
      req.user!.id,
      req.query as Record<string, unknown>,
    );
    res.json(data);
  },

  getApplicationPreview: async (req: Request, res: Response) => {
    const data = await employerPortalService.getApplicationPreview(
      req.user!.id,
      Number(req.params.id),
    );
    res.json(data);
  },

  suggestedCandidates: async (req: Request, res: Response) => {
    const limit = req.query.limit ? Number(req.query.limit) : undefined;
    const data = await employerPortalService.getSuggestedCandidates(
      req.user!.id,
      Number.isFinite(limit) ? limit : undefined,
    );
    res.json(data);
  },

  getSuggestedCandidateCv: async (req: Request, res: Response) => {
    const data = await employerPortalService.getSuggestedCandidateCv(
      req.user!.id,
      Number(req.params.candidateId),
    );
    res.json(data);
  },

  patchApplicationStatus: async (req: Request, res: Response) => {
    const data = await employerPortalService.updateApplicationStatus(
      req.user!.id,
      Number(req.params.id),
      req.body.status,
    );
    res.json({ success: true, data });
  },

  createInvite: async (req: Request, res: Response) => {
    const data = await employerInviteService.createInvite(
      req.user!.id,
      req.body,
    );
    res.status(201).json(data);
  },
};
