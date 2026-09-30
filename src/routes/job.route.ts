import express from "express";
import { homeController } from "../controllers/home.controller";

import { authMiddleware, requireRole } from "../middlewares/auth.middleware";
import { publicCatalogRateLimiter } from "../middlewares/rateLimit.middleware";
import { savedJobController } from "../controllers/saved_job.controller";
import { candidateRecommendationController } from "../controllers/candidate_recommendation.controller";

const router = express.Router();

router.get("/", publicCatalogRateLimiter, homeController.getJobs);
router.get("/suggest", publicCatalogRateLimiter, homeController.suggestJobs);

router.get(
  "/recommended",
  authMiddleware,
  requireRole("CANDIDATE"),
  candidateRecommendationController.getRecommendedJobs,
);

router.get(
  "/saved",
  authMiddleware,
  requireRole("CANDIDATE"),
  savedJobController.getSavedJobs,
);
router.get(
  "/:jobId/check",
  authMiddleware,
  requireRole("CANDIDATE"),
  savedJobController.checkSaved,
);
router.post(
  "/:jobId/saved",
  authMiddleware,
  requireRole("CANDIDATE"),
  savedJobController.saveJob,
);
router.delete(
  "/:jobId/saved",
  authMiddleware,
  requireRole("CANDIDATE"),
  savedJobController.unsaveJob,
);

router.get("/:id", publicCatalogRateLimiter, homeController.getDetailJob);
router.post(
  "/:id/view-source",
  publicCatalogRateLimiter,
  homeController.trackJobViewSource,
);

export default router;
