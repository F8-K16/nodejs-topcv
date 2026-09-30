import { Request, Response } from "express";
import { sendError } from "../utils/response";
import { jobService } from "../services/job.service";
import { categoryService } from "../services/category.service";
import { companyService } from "../services/company.service";
import { auditService } from "../services/audit.service";

export const jobController = {
  create: async (req: Request, res: Response) => {
    const job = await jobService.createJob(req.body);
    if (!job) {
      return res.status(500).json({ message: "Tạo việc làm thất bại" });
    }
    await auditService.log(req, {
      action: "admin:jobs:create",
      entityType: "Job",
      entityId: job.id,
    });
    res.json(job);
  },

  getAll: async (req: Request, res: Response) => {
    const data = await jobService.getJobs(req.query, "admin");
    const categories = await categoryService.getAll({ all: true });
    const companies = await companyService.getAll({ all: true });

    res.json({
      ...data,
      categories: categories.categories,
      companies: companies.companies,
    });
  },

  approveAllPending: async (req: Request, res: Response) => {
    const data = await jobService.approveAllPendingJobs();
    await auditService.log(req, {
      action: "admin:jobs:approve_all_pending",
      entityType: "Job",
      metadata: data,
    });
    res.json({
      message: "Đã xử lý duyệt hàng loạt",
      ...data,
    });
  },

  getById: async (req: Request, res: Response) => {
    const job = await jobService.getJobById(Number(req.params.id), "admin");
    if (!job) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy việc làm",
      });
    }
    res.json(job);
  },

  patchModeration: async (req: Request, res: Response) => {
    const status = String(req.body.status ?? "");
    const user = req.user;
    const isAdmin = Boolean(user?.roles.includes("ADMIN"));
    if (!isAdmin) {
      const perms = user?.permissions ?? [];
      const allowed =
        status === "REJECTED"
          ? perms.includes("admin:jobs:reject") ||
            perms.includes("admin:jobs:approve")
          : perms.includes("admin:jobs:approve");
      if (!allowed) {
        return sendError(res, 403, {
          code: "FORBIDDEN",
          message: "Forbidden",
          traceId: req.requestId,
        });
      }
    }

    const jobId = Number(req.params.id);
    const job = await jobService.setModeration(
      jobId,
      req.body.status,
    );
    await auditService.log(req, {
      action: "admin:jobs:moderation",
      entityType: "Job",
      entityId: jobId,
      metadata: { status: req.body.status },
    });
    res.json(job);
  },

  patchFeatured: async (req: Request, res: Response) => {
    const jobId = Number(req.params.id);
    const job = await jobService.setFeatured(
      jobId,
      req.body.isFeatured,
    );
    await auditService.log(req, {
      action: "admin:jobs:featured",
      entityType: "Job",
      entityId: jobId,
      metadata: { isFeatured: req.body.isFeatured },
    });
    res.json(job);
  },

  update: async (req: Request, res: Response) => {
    const jobId = Number(req.params.id);
    const job = await jobService.updateJob(jobId, req.body);
    await auditService.log(req, {
      action: "admin:jobs:update",
      entityType: "Job",
      entityId: jobId,
    });
    res.json(job);
  },

  delete: async (req: Request, res: Response) => {
    const jobId = Number(req.params.id);
    await jobService.deleteJob(jobId);
    await auditService.log(req, {
      action: "admin:jobs:delete",
      entityType: "Job",
      entityId: jobId,
    });
    res.json({ message: "Xóa việc làm thành công" });
  },

  restore: async (req: Request, res: Response) => {
    const jobId = Number(req.params.id);
    const job = await jobService.restoreJob(jobId);
    await auditService.log(req, {
      action: "admin:jobs:restore",
      entityType: "Job",
      entityId: jobId,
    });
    res.json({ message: "Khôi phục việc làm thành công", job });
  },
};
