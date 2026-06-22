import express from "express";
import authRoute from "./auth.route";
import adminRoute from "./admin.route";
import userRoute from "./user.route";
import jobRoute from "./job.route";
import employerPortalRoute from "./employer_portal.route";
import cvRoute from "./cv.route";

import { authMiddleware, requireRole } from "../middlewares/auth.middleware";
import { homeController } from "../controllers/home.controller";
import { locationController } from "../controllers/location.controller";
import { categoryController } from "../controllers/category.controller";
import { healthController } from "../controllers/health.controller";
import { companyFollowController } from "../controllers/company_follow.controller";
import { candidateRecommendationController } from "../controllers/candidate_recommendation.controller";
import chatRoute from "./chat.route";
import { validate } from "../middlewares/validate.middleware";
import { recommendationProfilePutSchema } from "../schemas/candidate_recommendation.schema";
import { aiController } from "../controllers/ai.controller";
import {
  aiApplyCoverLetterSchema,
  aiCvSuggestSchema,
  aiCvReviewJobSchema,
  aiJobQuestionsSchema,
} from "../schemas/ai.schema";
import { aiRateLimiter } from "../middlewares/rateLimit.middleware";

const router = express.Router();
router.get("/health", healthController.live);
router.get("/ready", healthController.ready);
router.use(
  "/admin",
  authMiddleware,
  requireRole("ADMIN", "MODERATOR", "SUPPORT"),
  adminRoute,
);
router.use(
  "/employer-portal",
  authMiddleware,
  requireRole("EMPLOYER"),
  employerPortalRoute,
);
router.use("/auth", authRoute);
router.use("/users", userRoute);
router.use("/jobs", jobRoute);
router.use("/chat", chatRoute);
router.use(cvRoute);

// Public
router.get("/metadata", homeController.metadata);
router.get("/skills", homeController.listSkillsPublic);

router.get(
  "/me/recommendation-profile",
  authMiddleware,
  requireRole("CANDIDATE"),
  candidateRecommendationController.getProfile,
);
router.put(
  "/me/recommendation-profile",
  authMiddleware,
  requireRole("CANDIDATE"),
  validate(recommendationProfilePutSchema),
  candidateRecommendationController.putProfile,
);

router.post(
  "/ai/cv/suggest",
  authMiddleware,
  requireRole("CANDIDATE"),
  aiRateLimiter,
  validate(aiCvSuggestSchema),
  aiController.cvSuggest,
);

router.post(
  "/ai/apply/cover-letter",
  authMiddleware,
  requireRole("CANDIDATE"),
  aiRateLimiter,
  validate(aiApplyCoverLetterSchema),
  aiController.coverLetter,
);

router.post(
  "/ai/job/questions",
  authMiddleware,
  requireRole("CANDIDATE"),
  aiRateLimiter,
  validate(aiJobQuestionsSchema),
  aiController.jobQuestions,
);

router.post(
  "/ai/cv/review-job",
  authMiddleware,
  requireRole("CANDIDATE"),
  aiRateLimiter,
  validate(aiCvReviewJobSchema),
  aiController.cvReviewJob,
);

router.get("/companies", homeController.getCompanies);
router.get("/companies/top-hiring", homeController.getTopHiringCompanies);
router.get(
  "/companies/followed",
  authMiddleware,
  requireRole("CANDIDATE"),
  companyFollowController.list,
);
router.get(
  "/companies/:id/follow/check",
  authMiddleware,
  requireRole("CANDIDATE"),
  companyFollowController.status,
);
router.post(
  "/companies/:id/follow",
  authMiddleware,
  requireRole("CANDIDATE"),
  companyFollowController.follow,
);
router.delete(
  "/companies/:id/follow",
  authMiddleware,
  requireRole("CANDIDATE"),
  companyFollowController.unfollow,
);
router.get("/companies/:id", homeController.getCompanyDetail);

router.get("/company/:id/categories", categoryController.getByCompany);
router.get("/provinces", locationController.province);
router.get("/provinces/:id/districts", locationController.district);
export default router;
