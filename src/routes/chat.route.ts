import express from "express";

import { authMiddleware, requireRole } from "../middlewares/auth.middleware";
import { chatController } from "../controllers/chat.controller";

const router = express.Router();

router.use(authMiddleware);
router.use(requireRole("EMPLOYER", "CANDIDATE"));

router.post("/conversations", chatController.ensureConversation);
router.get("/conversations", chatController.listConversations);
router.post("/conversations/:id/read", chatController.markRead);
router.get("/conversations/:id/messages", chatController.listMessages);
router.post("/conversations/:id/messages", chatController.postMessage);
router.delete(
  "/conversations/:id/messages/:messageId",
  chatController.deleteMessage,
);
router.delete("/conversations/:id", chatController.deleteConversation);

export default router;
