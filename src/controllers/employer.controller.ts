import { Request, Response } from "express";
import { employerService } from "../services/employer.service";
import { auditService } from "../services/audit.service";

export const employerController = {
  indexPending: async (req: Request, res: Response) => {
    const employers = await employerService.getPendingEmployers();

    res.json({
      employers,
    });
  },

  approveAllPending: async (req: Request, res: Response) => {
    const data = await employerService.approveAllPendingEmployers();
    await auditService.log(req, {
      action: "admin:moderation:approve_all_pending_employers",
      entityType: "Employer",
      metadata: data,
    });
    res.json({
      message: "Đã xử lý duyệt hàng loạt",
      ...data,
    });
  },

  approve: async (req: Request, res: Response) => {
    const employerId = Number(req.params.id);

    const employer = await employerService.approveEmployer(employerId);
    await auditService.log(req, {
      action: "admin:moderation:approve_employer",
      entityType: "Employer",
      entityId: employerId,
    });
    res.json({
      message: "Chấp nhận tài khoản thành công",
      data: employer,
    });
  },

  reject: async (req: Request, res: Response) => {
    const employerId = Number(req.params.id);
    const { reason } = req.body;
    const employer = await employerService.rejectEmployer(employerId, reason);
    await auditService.log(req, {
      action: "admin:moderation:reject_employer",
      entityType: "Employer",
      entityId: employerId,
      metadata: reason ? { reason } : undefined,
    });
    res.json({
      message: "Từ chối tài khoản thành công",
      data: employer,
    });
  },
  getByCompany: async (req: Request, res: Response) => {
    const companyId = Number(req.params.id);
    const data = await employerService.getByCompany(companyId);
    res.json(data);
  },
};
