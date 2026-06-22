import { Request, Response } from "express";
import { jobService } from "../services/job.service";
import { companyService } from "../services/company.service";
import { getPublicMetadata } from "../services/public_catalog.service";
import { skillService } from "../services/skill.service";
import { siteSettingsService } from "../services/site_settings.service";

export const homeController = {
  siteStatus: async (_req: Request, res: Response) => {
    const s = await siteSettingsService.getOrCreate();
    res.json({
      maintenanceMode: s.maintenanceMode,
      siteName: s.siteName,
    });
  },

  metadata: async (req: Request, res: Response) => {
    const payload = await getPublicMetadata();
    res.json(payload);
  },
  listSkillsPublic: async (_req: Request, res: Response) => {
    const skills = await skillService.listAllForSelect();
    return res.json({ skills });
  },
  getJobs: async (req: Request, res: Response) => {
    res.set("Cache-Control", "private, no-store, must-revalidate, max-age=0");
    const jobs = await jobService.getJobs(req.query, "public");
    res.json(jobs);
  },
  suggestJobs: async (req: Request, res: Response) => {
    res.set("Cache-Control", "private, no-store, must-revalidate, max-age=0");
    const q = (req.query as { q?: string }).q;
    const payload = await jobService.suggestPublicJobs(q);
    res.json(payload);
  },
  getDetailJob: async (req: Request, res: Response) => {
    res.set("Cache-Control", "private, no-store, must-revalidate, max-age=0");
    const job = await jobService.getJobById(Number(req.params.id), "public");
    if (!job) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy việc làm hoặc tin đã hết hạn",
      });
    }
    const newViews = await jobService.incrementPublicJobView(
      Number(req.params.id),
    );
    res.json(newViews != null ? { ...job, viewCount: newViews } : job);
  },
  getCompanies: async (req: Request, res: Response) => {
    const companies = await companyService.getAll({
      ...req.query,
      status: "true",
    });
    res.json(companies);
  },
  getTopHiringCompanies: async (req: Request, res: Response) => {
    const limit = Number((req.query as { limit?: string }).limit) || 8;
    const data = await companyService.getTopHiring(limit);
    res.json(data);
  },
  getCompanyDetail: async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    const company = await companyService.getPublicById(id);
    if (!company) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy công ty hoặc công ty chưa được duyệt",
      });
    }
    return res.json(company);
  },
};
