import express from "express";

import { validate } from "../middlewares/validate.middleware";
import {
  employerApplicationStatusSchema,
  employerCreateInviteSchema,
  employerCreateJobSchema,
  employerUpdateCompanySchema,
  employerUpdateJobSchema,
} from "../schemas/employer_portal.schema";
import { employerPortalController } from "../controllers/employer_portal.controller";

const router = express.Router();

router.get("/me", employerPortalController.me);
router.get("/company-members", employerPortalController.companyMembers);
router.get("/dashboard", employerPortalController.dashboard);
router.get("/form-meta", employerPortalController.formMeta);
router.patch(
  "/company",
  validate(employerUpdateCompanySchema),
  employerPortalController.updateCompany,
);

router.get("/jobs", employerPortalController.listJobs);
router.post(
  "/jobs",
  validate(employerCreateJobSchema),
  employerPortalController.createJob,
);
router.get("/jobs/:id", employerPortalController.getJob);
router.patch(
  "/jobs/:id",
  validate(employerUpdateJobSchema),
  employerPortalController.updateJob,
);
router.delete("/jobs/:id", employerPortalController.deleteJob);

router.get(
  "/suggested-candidates",
  employerPortalController.suggestedCandidates,
);
router.get(
  "/suggested-candidates/:candidateId/cv",
  employerPortalController.getSuggestedCandidateCv,
);
router.get("/applications", employerPortalController.listApplications);
router.get(
  "/applications/:id/preview",
  employerPortalController.getApplicationPreview,
);
router.patch(
  "/applications/:id/status",
  validate(employerApplicationStatusSchema),
  employerPortalController.patchApplicationStatus,
);

router.post(
  "/invites",
  validate(employerCreateInviteSchema),
  employerPortalController.createInvite,
);

export default router;
