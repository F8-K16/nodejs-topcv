import express from "express";
import { homeController } from "../controllers/home.controller";

import { authMiddleware, requireRole } from "../middlewares/auth.middleware";
import { savedJobController } from "../controllers/saved_job.controller";
import { candidateRecommendationController } from "../controllers/candidate_recommendation.controller";

const router = express.Router();

router.get("/", homeController.getJobs);
router.get("/suggest", homeController.suggestJobs);

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

router.get("/:id", homeController.getDetailJob);

export default router;
