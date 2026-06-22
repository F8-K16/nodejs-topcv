import { ChatMessageKind } from "../generated/prisma/enums";
import { env } from "../config/env";
import { prisma, prismaTransaction } from "../utils/prisma";
import { HttpException } from "../utils/exception";

const PEER_SELECT = {
  id: true,
  username: true,
  email: true,
  avatar: true,
} as const;

const SENDER_SELECT = {
  id: true,
  username: true,
  avatar: true,
} as const;

export type ChatConversationPeerContext = {
  peerUserId: number;
  username: string;
  avatar: string | null;
  role: "employer" | "candidate";
  companyName: string | null;
  companyLogo: string | null;
};

function assertCloudinaryChatImageUrl(urlStr: string) {
  let u: URL;
  try {
    u = new URL(urlStr);
  } catch {
    throw new HttpException("URL ảnh không hợp lệ", 400, "CHAT_BAD_IMAGE_URL");
  }
  if (u.protocol !== "https:") {
    throw new HttpException(
      "Chỉ chấp nhận ảnh HTTPS",
      400,
      "CHAT_BAD_IMAGE_URL",
    );
  }
  if (u.hostname !== "res.cloudinary.com") {
    throw new HttpException(
      "Ảnh phải lưu trên Cloudinary",
      400,
      "CHAT_BAD_IMAGE_URL",
    );
  }
  if (!u.pathname.includes("/image/upload/")) {
    throw new HttpException(
      "URL ảnh Cloudinary không hợp lệ",
      400,
      "CHAT_BAD_IMAGE_URL",
    );
  }
  const cloud =
    env.CLOUDINARY_CLOUD_NAME || env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
  if (cloud && !u.pathname.includes(`/${cloud}/`)) {
    throw new HttpException(
      "Cloud ảnh không khớp cấu hình",
      400,
      "CHAT_BAD_IMAGE_URL",
    );
  }
}

export type CreateChatMessageDto = {
  kind?: ChatMessageKind;
  body?: string;
  imageUrl?: string | null;
};

async function resolveChatPair(userId: number, peerUserId: number) {
  if (userId === peerUserId) {
    throw new HttpException("Không thể chat với chính mình", 400, "CHAT_SELF");
  }
  const [meEmp, peerCand, peerEmp, meCand] = await Promise.all([
    prisma.employer.findUnique({ where: { userId } }),
    prisma.candidate.findUnique({ where: { userId: peerUserId } }),
    prisma.employer.findUnique({ where: { userId: peerUserId } }),
    prisma.candidate.findUnique({ where: { userId } }),
  ]);
  if (meEmp && peerCand) {
    return { employerUserId: userId, candidateUserId: peerUserId };
  }
  if (meCand && peerEmp) {
    return { employerUserId: peerUserId, candidateUserId: userId };
  }
  throw new HttpException(
    "Chỉ có thể nhắn tin giữa nhà tuyển dụng và ứng viên",
    400,
    "CHAT_INVALID_PAIR",
  );
}

export const chatService = {
  async ensureConversation(userId: number, peerUserId: number) {
    const pair = await resolveChatPair(userId, peerUserId);
    const existing = await prisma.chatConversation.findUnique({
      where: {
        employerUserId_candidateUserId: pair,
      },
    });
    if (existing) return existing;
    return prisma.chatConversation.create({
      data: pair,
    });
  },

  async listConversations(userId: number) {
    const rows = await prisma.chatConversation.findMany({
      where: {
        OR: [{ employerUserId: userId }, { candidateUserId: userId }],
      },
      orderBy: [{ lastMessageAt: "desc" }, { id: "desc" }],
      take: 100,
      include: {
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    });
    const peerIds = rows.map((r) =>
      r.employerUserId === userId ? r.candidateUserId : r.employerUserId,
    );
    if (peerIds.length === 0) return [];
    const users = await prisma.user.findMany({
      where: { id: { in: peerIds } },
      select: PEER_SELECT,
    });
    const userMap = new Map(users.map((u) => [u.id, u]));

    const enriched = await Promise.all(
      rows.map(async (r) => {
        const peerId =
          r.employerUserId === userId ? r.candidateUserId : r.employerUserId;
        const lastRead =
          r.employerUserId === userId
            ? r.employerLastReadMessageId
            : r.candidateLastReadMessageId;
        const unreadCount = await prisma.chatMessage.count({
          where: {
            conversationId: r.id,
            senderUserId: { not: userId },
            ...(lastRead != null ? { id: { gt: lastRead } } : {}),
          },
        });
        const last = r.messages[0];
        const peer = userMap.get(peerId);
        let lastPreview: {
          body: string;
          createdAt: Date;
          kind: ChatMessageKind;
        } | null = null;
        if (last) {
          if (last.kind === ChatMessageKind.IMAGE) {
            const cap = last.body.trim();
            const text = cap
              ? `[Ảnh] ${cap.length > 180 ? `${cap.slice(0, 180)}…` : cap}`
              : "[Ảnh]";
            lastPreview = {
              body: text,
              createdAt: last.createdAt,
              kind: last.kind,
            };
          } else {
            const b =
              last.body.length > 200
                ? `${last.body.slice(0, 200)}…`
                : last.body;
            lastPreview = {
              body: b,
              createdAt: last.createdAt,
              kind: last.kind,
            };
          }
        }
        return {
          id: r.id,
          peer: peer ?? {
            id: peerId,
            username: "User",
            email: "",
            avatar: null,
          },
          lastMessage: lastPreview,
          lastMessageAt: r.lastMessageAt,
          unreadCount,
        };
      }),
    );

    const totalUnread = enriched.reduce((s, c) => s + c.unreadCount, 0);
    return { conversations: enriched, totalUnread };
  },

  async listMessages(
    conversationId: number,
    userId: number,
    beforeId?: number,
  ) {
    const conv = await prisma.chatConversation.findUnique({
      where: { id: conversationId },
    });
    if (!conv) {
      throw new HttpException("Không tìm thấy cuộc trò chuyện", 404);
    }
    if (conv.employerUserId !== userId && conv.candidateUserId !== userId) {
      throw new HttpException("Forbidden", 403);
    }
    const take = 50;
    const messages = await prisma.chatMessage.findMany({
      where: {
        conversationId,
        ...(beforeId != null && !Number.isNaN(beforeId)
          ? { id: { lt: beforeId } }
          : {}),
      },
      orderBy: { id: "desc" },
      take,
      include: {
        sender: { select: SENDER_SELECT },
      },
    });
    const hasMore = messages.length === take;
    const chronological = [...messages].reverse();
    const peerContext = await this.getPeerContext(conv, userId);
    return { messages: chronological, hasMore, peerContext };
  },

  async createMessage(
    conversationId: number,
    senderUserId: number,
    dto: CreateChatMessageDto,
  ) {
    const kind =
      dto.kind === ChatMessageKind.IMAGE
        ? ChatMessageKind.IMAGE
        : ChatMessageKind.TEXT;

    const conv = await prisma.chatConversation.findUnique({
      where: { id: conversationId },
    });
    if (!conv) {
      throw new HttpException("Không tìm thấy cuộc trò chuyện", 404);
    }
    if (
      conv.employerUserId !== senderUserId &&
      conv.candidateUserId !== senderUserId
    ) {
      throw new HttpException("Forbidden", 403);
    }

    let bodyToStore: string;
    let imageUrl: string | null = null;

    if (kind === ChatMessageKind.IMAGE) {
      const url = String(dto.imageUrl ?? "").trim();
      if (!url) {
        throw new HttpException("Thiếu URL ảnh", 400, "CHAT_IMAGE_REQUIRED");
      }
      assertCloudinaryChatImageUrl(url);
      imageUrl = url;
      const caption = String(dto.body ?? "").trim();
      if (caption.length > 8000) {
        throw new HttpException("Chú thích quá dài", 400);
      }
      bodyToStore = caption;
    } else {
      const trimmed = String(dto.body ?? "").trim();
      if (!trimmed) {
        throw new HttpException("Nội dung không được để trống", 400);
      }
      if (trimmed.length > 8000) {
        throw new HttpException("Nội dung quá dài", 400);
      }
      bodyToStore = trimmed;
    }

    return prismaTransaction(async (tx) => {
      const m = await tx.chatMessage.create({
        data: {
          conversationId,
          senderUserId,
          kind,
          body: bodyToStore,
          imageUrl,
        },
        include: {
          sender: { select: SENDER_SELECT },
        },
      });
      await tx.chatConversation.update({
        where: { id: conversationId },
        data: { lastMessageAt: m.createdAt },
      });
      return m;
    });
  },

  async deleteMessage(
    conversationId: number,
    messageId: number,
    userId: number,
  ) {
    await this.assertParticipant(conversationId, userId);
    const msg = await prisma.chatMessage.findFirst({
      where: { id: messageId, conversationId },
    });
    if (!msg) {
      throw new HttpException("Không tìm thấy tin nhắn", 404);
    }
    if (msg.senderUserId !== userId) {
      throw new HttpException("Chỉ xóa được tin của chính bạn", 403);
    }
    await prismaTransaction(async (tx) => {
      await tx.chatMessage.delete({ where: { id: messageId } });
      const last = await tx.chatMessage.findFirst({
        where: { conversationId },
        orderBy: { id: "desc" },
        select: { createdAt: true },
      });
      await tx.chatConversation.update({
        where: { id: conversationId },
        data: { lastMessageAt: last?.createdAt ?? null },
      });
    });
  },

  async deleteConversation(conversationId: number, userId: number) {
    await this.assertParticipant(conversationId, userId);
    await prisma.chatConversation.delete({ where: { id: conversationId } });
  },

  async assertParticipant(conversationId: number, userId: number) {
    const conv = await prisma.chatConversation.findUnique({
      where: { id: conversationId },
    });
    if (!conv) {
      throw new HttpException("Không tìm thấy cuộc trò chuyện", 404);
    }
    if (conv.employerUserId !== userId && conv.candidateUserId !== userId) {
      throw new HttpException("Forbidden", 403);
    }
    return conv;
  },

  getPeerUserId(
    conv: { employerUserId: number; candidateUserId: number },
    viewerUserId: number,
  ): number {
    return conv.employerUserId === viewerUserId
      ? conv.candidateUserId
      : conv.employerUserId;
  },

  async getPeerContext(
    conv: { employerUserId: number; candidateUserId: number },
    viewerUserId: number,
  ): Promise<ChatConversationPeerContext> {
    const peerUserId = this.getPeerUserId(conv, viewerUserId);
    const peerUser = await prisma.user.findUnique({
      where: { id: peerUserId },
      select: PEER_SELECT,
    });
    const employer = await prisma.employer.findUnique({
      where: { userId: peerUserId },
      include: {
        company: { select: { name: true, logo: true } },
      },
    });
    const username = peerUser?.username ?? "User";
    const avatar = peerUser?.avatar ?? null;
    if (employer) {
      return {
        peerUserId,
        username,
        avatar,
        role: "employer",
        companyName: employer.company?.name ?? null,
        companyLogo: employer.company?.logo ?? null,
      };
    }
    return {
      peerUserId,
      username,
      avatar,
      role: "candidate",
      companyName: null,
      companyLogo: null,
    };
  },

  async getPeerUserIdForConversation(
    conversationId: number,
    viewerUserId: number,
  ): Promise<number> {
    const conv = await this.assertParticipant(conversationId, viewerUserId);
    return this.getPeerUserId(conv, viewerUserId);
  },

  async markConversationRead(conversationId: number, userId: number) {
    const conv = await this.assertParticipant(conversationId, userId);
    const maxRow = await prisma.chatMessage.aggregate({
      where: { conversationId },
      _max: { id: true },
    });
    const maxId = maxRow._max.id;
    if (maxId == null) return conv;

    await prisma.chatConversation.update({
      where: { id: conversationId },
      data:
        conv.employerUserId === userId
          ? { employerLastReadMessageId: maxId }
          : { candidateLastReadMessageId: maxId },
    });
    return prisma.chatConversation.findUniqueOrThrow({
      where: { id: conversationId },
    });
  },
};
