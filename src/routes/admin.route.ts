import express from "express";

import { validate } from "../middlewares/validate.middleware";
import { requirePermission } from "../middlewares/auth.middleware";
import { registerSchema, updateUserSchema } from "../schemas/auth.schema";

import {
  createCompanySchema,
  updateCompanySchema,
} from "../schemas/company.schema";

import {
  createCategorySchema,
  updateCategorySchema,
} from "../schemas/category.schema";
import {
  createCategoryParentSchema,
  updateCategoryParentSchema,
} from "../schemas/category_parent.schema";

import {
  createJobSchema,
  patchJobFeaturedSchema,
  patchJobModerationSchema,
  updateJobSchema,
} from "../schemas/job.schema";
import { createSkillSchema, updateSkillSchema } from "../schemas/skill.schema";
import {
  createDistrictSchema,
  createProvinceSchema,
  updateDistrictSchema,
  updateProvinceSchema,
} from "../schemas/location_admin.schema";
import { updateSiteSettingsSchema } from "../schemas/site_settings.schema";
import { dashboardController } from "../controllers/dashboard.controller";
import { userController } from "../controllers/user.controller";
import { companyController } from "../controllers/company.controller";
import { employerController } from "../controllers/employer.controller";
import { categoryController } from "../controllers/category.controller";
import { categoryParentController } from "../controllers/category_parent.controller";
import { jobController } from "../controllers/job.controller";
import { skillController } from "../controllers/skill.controller";
import { siteSettingsController } from "../controllers/site_settings.controller";
import { locationAdminController } from "../controllers/location_admin.controller";
import { resumeController } from "../controllers/resume.controller";
import {
  createResumeSchema,
  updateResumeSchema,
} from "../schemas/resume.schema";
import { applicationController } from "../controllers/application.controller";
import { updateApplicationStatusSchema } from "../schemas/application.schema";
import { cvController } from "../controllers/cv.controller";
import {
  createCvTemplateSchema,
  updateCvTemplateSchema,
} from "../schemas/cv.schema";
import { auditLogController } from "../controllers/audit_log.controller";
import { adminCacheController } from "../controllers/admin_cache.controller";
import { accessControlController } from "../controllers/access_control.controller";
import {
  createRoleSchema,
  updateRoleSchema,
} from "../schemas/access_control.schema";
const router = express.Router();

router.get(
  "/dashboard/summary",
  requirePermission("admin:dashboard:read"),
  dashboardController.summary,
);
router.get("/", requirePermission("admin:dashboard:read"), dashboardController.index);

// USER
router.get("/users", requirePermission("admin:users:read"), userController.index);
router.get(
  "/users/:id",
  requirePermission("admin:users:read"),
  userController.show,
);
router.post(
  "/users",
  requirePermission("admin:users:create"),
  validate(registerSchema),
  userController.store,
);
router.put(
  "/users/:id",
  requirePermission("admin:users:update"),
  validate((req) => updateUserSchema(Number(req.params.id))),
  userController.update,
);
router.delete(
  "/users/:id",
  requirePermission("admin:users:delete"),
  userController.delete,
);
router.patch(
  "/users/:id/restore",
  requirePermission("admin:users:update"),
  userController.restore,
);

// COMPANY
router.get(
  "/companies",
  requirePermission("admin:companies:read"),
  companyController.index,
);
router.get(
  "/companies/:id",
  requirePermission("admin:companies:read"),
  companyController.show,
);
router.post(
  "/companies",
  requirePermission("admin:companies:create"),
  validate(createCompanySchema),
  companyController.store,
);
router.put(
  "/companies/:id",
  requirePermission("admin:companies:update"),
  validate(updateCompanySchema),
  companyController.update,
);
router.delete(
  "/companies/:id",
  requirePermission("admin:companies:delete"),
  companyController.delete,
);
router.patch(
  "/companies/:id/restore",
  requirePermission("admin:companies:update"),
  companyController.restore,
);

// EMPLOYER
router.get(
  "/employers/pending",
  requirePermission("admin:moderation:read"),
  employerController.indexPending,
);
router.post(
  "/employers/approve-all",
  requirePermission("admin:moderation:approve"),
  employerController.approveAllPending,
);
router.get(
  "/company/:id/employers",
  requirePermission("admin:companies:read"),
  employerController.getByCompany,
);
router.post(
  "/employers/:id/approval",
  requirePermission("admin:moderation:approve"),
  employerController.approve,
);
router.post(
  "/employers/:id/rejected",
  requirePermission("admin:moderation:reject"),
  employerController.reject,
);

// CATEGORY PARENT
router.post(
  "/category-parents",
  requirePermission("admin:categories:create"),
  validate(createCategoryParentSchema),
  categoryParentController.create,
);
router.get(
  "/category-parents",
  requirePermission("admin:categories:read"),
  categoryParentController.findAll,
);
router.get(
  "/category-parents/:id",
  requirePermission("admin:categories:read"),
  categoryParentController.findOne,
);
router.put(
  "/category-parents/:id",
  requirePermission("admin:categories:update"),
  validate(updateCategoryParentSchema),
  categoryParentController.update,
);
router.delete(
  "/category-parents/:id",
  requirePermission("admin:categories:delete"),
  categoryParentController.delete,
);
router.patch(
  "/category-parents/:id/restore",
  requirePermission("admin:categories:update"),
  categoryParentController.restore,
);

// CATEGORY
router.post(
  "/categories",
  requirePermission("admin:categories:create"),
  validate(createCategorySchema),
  categoryController.create,
);
router.get(
  "/categories",
  requirePermission("admin:categories:read"),
  categoryController.findAll,
);
router.get(
  "/categories/:id",
  requirePermission("admin:categories:read"),
  categoryController.findOne,
);
router.put(
  "/categories/:id",
  requirePermission("admin:categories:update"),
  validate(updateCategorySchema),
  categoryController.update,
);
router.delete(
  "/categories/:id",
  requirePermission("admin:categories:delete"),
  categoryController.delete,
);
router.patch(
  "/categories/:id/restore",
  requirePermission("admin:categories:update"),
  categoryController.restore,
);

// JOB
router.post(
  "/jobs",
  requirePermission("admin:jobs:create"),
  validate(createJobSchema),
  jobController.create,
);
router.get("/jobs", requirePermission("admin:jobs:read"), jobController.getAll);
router.post(
  "/jobs/approve-all-pending",
  requirePermission("admin:jobs:approve"),
  jobController.approveAllPending,
);
router.get(
  "/jobs/:id",
  requirePermission("admin:jobs:read"),
  jobController.getById,
);
router.put(
  "/jobs/:id",
  requirePermission("admin:jobs:update"),
  validate(updateJobSchema),
  jobController.update,
);
router.delete(
  "/jobs/:id",
  requirePermission("admin:jobs:delete"),
  jobController.delete,
);
router.patch(
  "/jobs/:id/restore",
  requirePermission("admin:jobs:update"),
  jobController.restore,
);
router.patch(
  "/jobs/:id/moderation",
  requirePermission("admin:jobs:approve"),
  validate(patchJobModerationSchema),
  jobController.patchModeration,
);
router.patch(
  "/jobs/:id/featured",
  requirePermission("admin:jobs:feature"),
  validate(patchJobFeaturedSchema),
  jobController.patchFeatured,
);

// SITE SETTINGS
router.get(
  "/settings",
  requirePermission("admin:settings:read"),
  siteSettingsController.show,
);
router.put(
  "/settings",
  requirePermission("admin:settings:update"),
  validate(updateSiteSettingsSchema),
  siteSettingsController.update,
);
router.post(
  "/cache/application",
  requirePermission("admin:settings:update"),
  adminCacheController.clearApplication,
);

// LOCATIONS
router.get(
  "/locations/provinces",
  requirePermission("admin:locations:read"),
  locationAdminController.listProvinces,
);
router.post(
  "/locations/provinces",
  requirePermission("admin:locations:create"),
  validate(createProvinceSchema),
  locationAdminController.createProvince,
);
router.put(
  "/locations/provinces/:id",
  requirePermission("admin:locations:update"),
  validate(updateProvinceSchema),
  locationAdminController.updateProvince,
);
router.delete(
  "/locations/provinces/:id",
  requirePermission("admin:locations:delete"),
  locationAdminController.deleteProvince,
);
router.patch(
  "/locations/provinces/:id/restore",
  requirePermission("admin:locations:update"),
  locationAdminController.restoreProvince,
);
router.get(
  "/locations/provinces/:provinceId/districts",
  requirePermission("admin:locations:read"),
  locationAdminController.listDistricts,
);
router.post(
  "/locations/districts",
  requirePermission("admin:locations:create"),
  validate(createDistrictSchema),
  locationAdminController.createDistrict,
);
router.put(
  "/locations/districts/:id",
  requirePermission("admin:locations:update"),
  validate(updateDistrictSchema),
  locationAdminController.updateDistrict,
);
router.delete(
  "/locations/districts/:id",
  requirePermission("admin:locations:delete"),
  locationAdminController.deleteDistrict,
);
router.patch(
  "/locations/districts/:id/restore",
  requirePermission("admin:locations:update"),
  locationAdminController.restoreDistrict,
);

// SKILLS
router.get(
  "/skills/select",
  requirePermission("admin:skills:read"),
  skillController.selectAll,
);
router.get("/skills", requirePermission("admin:skills:read"), skillController.index);
router.post(
  "/skills",
  requirePermission("admin:skills:create"),
  validate(createSkillSchema),
  skillController.store,
);
router.put(
  "/skills/:id",
  requirePermission("admin:skills:update"),
  validate(updateSkillSchema),
  skillController.update,
);
router.delete(
  "/skills/:id",
  requirePermission("admin:skills:delete"),
  skillController.destroy,
);
router.patch(
  "/skills/:id/restore",
  requirePermission("admin:skills:update"),
  skillController.restore,
);

// RESUME
router.post(
  "/resumes",
  requirePermission("admin:resumes:create"),
  validate(createResumeSchema),
  resumeController.create,
);
router.get(
  "/resumes",
  requirePermission("admin:resumes:read"),
  resumeController.getAll,
);
router.put(
  "/resumes/:id",
  requirePermission("admin:resumes:update"),
  validate(updateResumeSchema),
  resumeController.update,
);
router.delete(
  "/resumes/:id",
  requirePermission("admin:resumes:delete"),
  resumeController.delete,
);
router.patch(
  "/resumes/:id/restore",
  requirePermission("admin:resumes:update"),
  resumeController.restore,
);
router.get(
  "/cvs/:id",
  requirePermission("admin:resumes:read"),
  cvController.getCvForAdmin,
);

// APPLICATIONS
router.get(
  "/applications",
  requirePermission("admin:applications:read"),
  applicationController.index,
);
router.get(
  "/applications/:id/preview",
  requirePermission("admin:applications:read"),
  applicationController.previewForAdmin,
);
router.patch(
  "/applications/:id/status",
  requirePermission("admin:applications:update"),
  validate(updateApplicationStatusSchema),
  applicationController.updateStatus,
);

// CV TEMPLATES
router.get(
  "/cv-templates",
  requirePermission("admin:cv_templates:read"),
  cvController.listTemplatesAdmin,
);
router.post(
  "/cv-templates",
  requirePermission("admin:cv_templates:create"),
  validate(createCvTemplateSchema),
  cvController.createTemplateAdmin,
);
router.put(
  "/cv-templates/:id",
  requirePermission("admin:cv_templates:update"),
  validate(updateCvTemplateSchema),
  cvController.updateTemplateAdmin,
);
router.delete(
  "/cv-templates/:id",
  requirePermission("admin:cv_templates:delete"),
  cvController.deleteTemplateAdmin,
);
router.patch(
  "/cv-templates/:id/restore",
  requirePermission("admin:cv_templates:update"),
  cvController.restoreTemplateAdmin,
);

// AUDIT LOGS
router.get(
  "/audit-logs",
  requirePermission("admin:audit_logs:read"),
  auditLogController.index,
);
router.get(
  "/audit-logs/:id",
  requirePermission("admin:audit_logs:read"),
  auditLogController.show,
);

// ACCESS CONTROL: roles + permissions
router.get(
  "/access-control/permissions",
  requirePermission("admin:access_control:read"),
  accessControlController.listPermissions,
);
router.get(
  "/access-control/roles",
  requirePermission("admin:access_control:read"),
  accessControlController.listRoles,
);
router.get(
  "/access-control/roles/:id",
  requirePermission("admin:access_control:read"),
  accessControlController.showRole,
);
router.post(
  "/access-control/roles",
  requirePermission("admin:access_control:create"),
  validate(createRoleSchema),
  accessControlController.createRole,
);
router.put(
  "/access-control/roles/:id",
  requirePermission("admin:access_control:update"),
  validate(updateRoleSchema),
  accessControlController.updateRole,
);
router.delete(
  "/access-control/roles/:id",
  requirePermission("admin:access_control:delete"),
  accessControlController.deleteRole,
);
router.patch(
  "/access-control/roles/:id/restore",
  requirePermission("admin:access_control:update"),
  accessControlController.restoreRole,
);

export default router;
