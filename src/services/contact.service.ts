import { emailQueue } from "../queues/email.queue";
import { env } from "../config/env";
import { HttpException } from "../utils/exception";
import { prisma } from "../utils/prisma";
import {
  CacheKeys,
  cacheGetJson,
  cacheSetJson,
  invalidateContactAdminCaches,
  stableCacheHash,
} from "../utils/cache";

function inboxEmail() {
  const explicit = env.CONTACT_INBOX_EMAIL.trim();
  return explicit || env.SMTP_FROM;
}

export const contactService = {
  async submit(input: {
    name: string;
    email: string;
    subject: string;
    message: string;
    website?: string;
  }) {
    if (input.website?.trim()) {
      return { ok: true as const };
    }

    const row = await prisma.contactMessage.create({
      data: {
        name: input.name.trim(),
        email: input.email.trim().toLowerCase(),
        subject: input.subject.trim(),
        message: input.message.trim(),
      },
    });

    const to = inboxEmail();
    if (!to) {
      throw new HttpException("Chưa cấu hình hộp thư liên hệ", 500);
    }

    await emailQueue.add("send-email-notification", {
      to,
      subject: `[Liên hệ] ${row.subject}`,
      template: "contact-inquiry",
      options: {
        senderName: row.name,
        senderEmail: row.email,
        topic: row.subject,
        body: row.message,
      },
    });

    await emailQueue.add("send-email-notification", {
      to: row.email,
      subject: `Đã nhận liên hệ: ${row.subject}`,
      template: "contact-receipt",
      options: {
        username: row.name,
        topic: row.subject,
      },
    });

    await invalidateContactAdminCaches();
    return { ok: true as const, id: row.id };
  },

  async listAdmin(query: { page?: number; limit?: number }) {
    const page = Math.max(Number(query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 100);
    const cacheKey = CacheKeys.contactAdminList(
      stableCacheHash({ page, limit }),
    );
    const hit = await cacheGetJson<{
      messages: Awaited<ReturnType<typeof prisma.contactMessage.findMany>>;
      pagination: {
        total: number;
        page: number;
        limit: number;
        totalPages: number;
      };
    }>(cacheKey);
    if (hit) return hit;

    const skip = (page - 1) * limit;
    const [messages, total] = await Promise.all([
      prisma.contactMessage.findMany({
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
      }),
      prisma.contactMessage.count(),
    ]);
    const payload = {
      messages,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
    await cacheSetJson(cacheKey, payload, 3600);
    return payload;
  },
};
