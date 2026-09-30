import express from "express";
import { authMiddleware, requireRole } from "../middlewares/auth.middleware";
import { authController } from "../controllers/auth.controller";
import { resumeController } from "../controllers/resume.controller";
import { applicationController } from "../controllers/application.controller";
import { notificationController } from "../controllers/notification.controller";
import { validate } from "../middlewares/validate.middleware";
import { changePasswordSchema } from "../schemas/auth.schema";
import { applyJobSchema, bulkWithdrawApplicationsSchema } from "../schemas/application.schema";

const router = express.Router();

router.get("/profile", authMiddleware, authController.profile);
router.patch("/profile", authMiddleware, authController.updateProfile);
router.patch(
  "/password",
  authMiddleware,
  validate(changePasswordSchema),
  authController.changePassword,
);

router.get(
  "/resumes",
  authMiddleware,
  requireRole("CANDIDATE"),
  resumeController.getMyResume,
);
router.post(
  "/resumes",
  authMiddleware,
  requireRole("CANDIDATE"),
  resumeController.uploadResume,
);
router.delete(
  "/resumes/:id",
  authMiddleware,
  requireRole("CANDIDATE"),
  resumeController.deleteMyResume,
);

router.get(
  "/applications",
  authMiddleware,
  requireRole("CANDIDATE"),
  applicationController.listMine,
);

router.get(
  "/applications/applied-job-ids",
  authMiddleware,
  requireRole("CANDIDATE"),
  applicationController.appliedJobIds,
);

router.post(
  "/applications/bulk-withdraw",
  authMiddleware,
  requireRole("CANDIDATE"),
  validate(bulkWithdrawApplicationsSchema),
  applicationController.bulkWithdraw,
);

router.get(
  "/applications/:id",
  authMiddleware,
  requireRole("CANDIDATE"),
  applicationController.mineDetail,
);

router.post(
  "/applications",
  authMiddleware,
  requireRole("CANDIDATE"),
  validate(applyJobSchema),
  applicationController.apply,
);

router.get(
  "/notifications/unread-count",
  authMiddleware,
  notificationController.unreadCount,
);
router.get(
  "/notifications/:id",
  authMiddleware,
  notificationController.detail,
);
router.get("/notifications", authMiddleware, notificationController.list);
router.patch(
  "/notifications/:id/read",
  authMiddleware,
  notificationController.markRead,
);
router.post(
  "/notifications/read-all",
  authMiddleware,
  notificationController.markAllRead,
);

export default router;
