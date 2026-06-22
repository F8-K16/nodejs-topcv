/* eslint-disable no-unused-vars */
import type { Server as HttpServer } from "http";
import { Server } from "socket.io";

import { ChatMessageKind } from "../generated/prisma/enums";
import { authService } from "../services/auth.service";
import { chatService } from "../services/chat.service";
import { logger } from "../utils/logger";

let ioRef: Server | null = null;

export type ChatMessagePayload = {
  id: number;
  conversationId: number;
  kind: ChatMessageKind;
  body: string;
  imageUrl: string | null;
  createdAt: Date;
  sender: { id: number; username: string; avatar: string | null };
};

export function emitChatMessageToParticipants(
  payload: ChatMessagePayload,
  senderUserId: number,
  peerUserId: number,
) {
  const io = ioRef;
  if (!io) return;
  io.to(`user:${peerUserId}`).emit("chat:message", payload);
  io.to(`user:${senderUserId}`).emit("chat:message", payload);
}

export type NotificationSocketPayload = {
  id: number;
  userId: number;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  readAt: string | null;
  createdAt: string;
};

export function emitNotificationToUser(
  userId: number,
  row: {
    id: number;
    userId: number;
    type: string;
    title: string;
    body: string | null;
    link: string | null;
    readAt: Date | null;
    createdAt: Date;
  },
) {
  const io = ioRef;
  if (!io) return;
  const payload: NotificationSocketPayload = {
    id: row.id,
    userId: row.userId,
    type: row.type,
    title: row.title,
    body: row.body,
    link: row.link,
    readAt: row.readAt ? row.readAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
  io.to(`user:${userId}`).emit("notification:new", payload);
}

export function getSocketIo(): Server | null {
  return ioRef;
}

export function initSocketIo(httpServer: HttpServer, allowedOrigins: string[]) {
  const io = new Server(httpServer, {
    path: "/socket.io",
    cors: {
      origin: allowedOrigins,
      credentials: true,
    },
  });

  ioRef = io;

  io.use(async (socket, next) => {
    try {
      const token =
        typeof socket.handshake.auth?.token === "string"
          ? socket.handshake.auth.token
          : undefined;
      if (!token) {
        return next(new Error("unauthorized"));
      }
      const { user } = await authService.profile(token);
      if (!user) return next(new Error("unauthorized"));
      socket.data.userId = user.id as number;
      next();
    } catch {
      next(new Error("unauthorized"));
    }
  });

  io.on("connection", (socket) => {
    const userId = socket.data.userId as number;
    void socket.join(`user:${userId}`);

    socket.on(
      "chat:typing",
      async (
        payload: { conversationId?: number; typing?: boolean },
        ack?: (r: unknown) => void,
      ) => {
        try {
          const conversationId = Number(payload?.conversationId);
          const typing = Boolean(payload?.typing);
          if (!conversationId || Number.isNaN(conversationId)) {
            ack?.({ ok: false, error: "invalid" });
            return;
          }
          const peerId = await chatService.getPeerUserIdForConversation(
            conversationId,
            userId,
          );
          io.to(`user:${peerId}`).emit("chat:typing", {
            conversationId,
            userId,
            typing,
          });
          ack?.({ ok: true });
        } catch (e) {
          logger.warn("chat:typing failed", { err: e });
          ack?.({ ok: false, error: "typing_failed" });
        }
      },
    );

    socket.on(
      "chat:send",
      async (
        payload: { conversationId?: number; body?: string },
        ack?: (r: unknown) => void,
      ) => {
        try {
          const conversationId = Number(payload?.conversationId);
          const body = String(payload?.body ?? "");
          if (!conversationId || Number.isNaN(conversationId) || !body.trim()) {
            ack?.({ ok: false, error: "invalid" });
            return;
          }
          const peerId = await chatService.getPeerUserIdForConversation(
            conversationId,
            userId,
          );
          const msg = await chatService.createMessage(conversationId, userId, {
            kind: ChatMessageKind.TEXT,
            body,
          });
          const out: ChatMessagePayload = {
            id: msg.id,
            conversationId,
            kind: msg.kind,
            body: msg.body,
            imageUrl: msg.imageUrl,
            createdAt: msg.createdAt,
            sender: msg.sender,
          };
          emitChatMessageToParticipants(out, userId, peerId);
          ack?.({ ok: true, message: out });
        } catch (e) {
          logger.warn("chat:send failed", { err: e });
          ack?.({ ok: false, error: "send_failed" });
        }
      },
    );
  });

  return io;
}
