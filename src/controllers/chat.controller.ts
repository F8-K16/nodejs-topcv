import { Request, Response } from "express";
import { HttpException } from "../utils/exception";
import { ChatMessageKind } from "../generated/prisma/enums";

import { chatService } from "../services/chat.service";
import { emitChatMessageToParticipants } from "../socket/chat.socket";

export const chatController = {
  ensureConversation: async (req: Request, res: Response) => {
    const peerUserId = Number(req.body?.peerUserId);
    if (Number.isNaN(peerUserId)) {
      throw new HttpException("peerUserId không hợp lệ", 400, "CHAT_BAD_PEER");
    }
    const conv = await chatService.ensureConversation(req.user!.id, peerUserId);
    res.json({ conversation: conv });
  },

  listConversations: async (req: Request, res: Response) => {
    const data = await chatService.listConversations(req.user!.id);
    res.json(data);
  },

  markRead: async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) {
      throw new HttpException("Invalid id", 400);
    }
    await chatService.markConversationRead(id, req.user!.id);
    res.json({ success: true });
  },

  listMessages: async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) {
      throw new HttpException("Invalid id", 400);
    }
    const beforeRaw = req.query.beforeId;
    const beforeId =
      beforeRaw != null && beforeRaw !== ""
        ? Number(beforeRaw)
        : undefined;
    if (beforeId != null && Number.isNaN(beforeId)) {
      throw new HttpException("beforeId không hợp lệ", 400);
    }
    const data = await chatService.listMessages(id, req.user!.id, beforeId);
    res.json(data);
  },

  postMessage: async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) {
      throw new HttpException("Invalid id", 400);
    }
    const uid = req.user!.id;
    const peerId = await chatService.getPeerUserIdForConversation(id, uid);
    const raw = req.body as {
      kind?: string;
      body?: string;
      imageUrl?: string | null;
    };
    const message = await chatService.createMessage(id, uid, {
      kind:
        raw?.kind === "IMAGE" ? ChatMessageKind.IMAGE : ChatMessageKind.TEXT,
      body: raw?.body ?? "",
      imageUrl: raw?.imageUrl ?? null,
    });
    emitChatMessageToParticipants(
      {
        id: message.id,
        conversationId: id,
        kind: message.kind,
        body: message.body,
        imageUrl: message.imageUrl,
        createdAt: message.createdAt,
        sender: message.sender,
      },
      uid,
      peerId,
    );
    res.status(201).json({ message });
  },

  deleteMessage: async (req: Request, res: Response) => {
    const cid = Number(req.params.id);
    const mid = Number(req.params.messageId);
    if (Number.isNaN(cid) || Number.isNaN(mid)) {
      throw new HttpException("Invalid id", 400);
    }
    await chatService.deleteMessage(cid, mid, req.user!.id);
    res.json({ success: true });
  },

  deleteConversation: async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) {
      throw new HttpException("Invalid id", 400);
    }
    await chatService.deleteConversation(id, req.user!.id);
    res.json({ success: true });
  },
};
