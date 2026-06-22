import express from "express";

import { authMiddleware, requireRole } from "../middlewares/auth.middleware";
import { validate } from "../middlewares/validate.middleware";
import { cvController } from "../controllers/cv.controller";
import { cvCreateSchema, cvUpdateSchema } from "../schemas/cv.schema";

const router = express.Router();

router.get("/cv/templates", cvController.listTemplates);
router.get("/cv/templates/:id", cvController.getTemplate);
router.get("/cv/public/:id", cvController.getPublicCv);

router.get("/cvs/my", authMiddleware, requireRole("CANDIDATE"), cvController.listMine);
router.post(
  "/cvs",
  authMiddleware,
  requireRole("CANDIDATE"),
  validate(cvCreateSchema),
  cvController.createCv,
);
router.get("/cvs/:id", authMiddleware, requireRole("CANDIDATE"), cvController.getMine);
router.patch(
  "/cvs/:id",
  authMiddleware,
  requireRole("CANDIDATE"),
  validate(cvUpdateSchema),
  cvController.updateMine,
);
router.delete("/cvs/:id", authMiddleware, requireRole("CANDIDATE"), cvController.deleteMine);
router.post(
  "/cvs/:id/publish-resume",
  authMiddleware,
  requireRole("CANDIDATE"),
  cvController.publishResume,
);

export default router;
