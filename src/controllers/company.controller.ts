import { Request, Response } from "express";
import { locationService } from "../services/location.service";
import { categoryParentService } from "../services/category.service";
import { companyService } from "../services/company.service";
import { auditService } from "../services/audit.service";

export const companyController = {
  index: async (req: Request, res: Response) => {
    const result = await companyService.getAll({
      ...req.query,
      ...(req.query.categoryId && {
        categoryId: Number(req.query.categoryId),
      }),
    });
    const provinces = await locationService.getProvinces();
    const categories = await categoryParentService.getAll({
      all: true,
    });

    res.json({
      companies: result.companies,
      pagination: result.pagination,
      query: req.query,
      provinces,
      categories: categories.categories,
    });
  },

  show: async (req: Request, res: Response) => {
    const company = await companyService.getCompanyById(Number(req.params.id));
    if (!company) {
      return res.status(404).json({ message: "Không tìm thấy công ty" });
    }
    res.json(company);
  },

  store: async (req: Request, res: Response) => {
    const data = req.body;
    const company = await companyService.createCompany(data);
    await auditService.log(req, {
      action: "admin:companies:create",
      entityType: "Company",
      entityId: company.id,
    });
    res.json({
      message: "Tạo công ty thành công",
      company,
    });
  },

  update: async (req: Request, res: Response) => {
    const companyId = Number(req.params.id);
    const company = await companyService.updateCompany(companyId, {
      ...req.body,
      provinceId: Number(req.body.provinceId),
      districtId: Number(req.body.districtId),
    });
    await auditService.log(req, {
      action: "admin:companies:update",
      entityType: "Company",
      entityId: companyId,
    });

    res.json(company);
  },

  delete: async (req: Request, res: Response) => {
    const companyId = Number(req.params.id);
    await companyService.deleteCompany(companyId);
    await auditService.log(req, {
      action: "admin:companies:delete",
      entityType: "Company",
      entityId: companyId,
    });
    res.json({
      message: "Xóa công ty thành công",
    });
  },

  restore: async (req: Request, res: Response) => {
    const companyId = Number(req.params.id);
    const company = await companyService.restoreCompany(companyId);
    await auditService.log(req, {
      action: "admin:companies:restore",
      entityType: "Company",
      entityId: companyId,
    });
    res.json({
      message: "Khôi phục công ty thành công",
      company,
    });
  },
};
