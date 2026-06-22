import { createHash, randomBytes } from "node:crypto";

import { prisma } from "../utils/prisma";
import { HttpException } from "../utils/exception";
import { env } from "../config/env";
import { emailQueue } from "../queues/email.queue";
import { logger } from "../utils/logger";
import { setEmployerInviteRedis } from "../utils/employer_invite_redis";

const DEFAULT_PUBLIC_SITE_URL = "https://nextcv.io.vn";

export function hashEmployerInviteToken(raw: string): string {
  return createHash("sha256").update(raw, "utf8").digest("hex");
}

export function normalizeEmployerInviteEmail(email: string): string {
  return email.trim().toLowerCase();
}

export const employerInviteService = {
  async createInvite(userId: number, data: { email: string }) {
    const employer = await prisma.employer.findUnique({
      where: { userId },
      include: {
        company: true,
        user: { select: { username: true } },
      },
    });
    if (!employer?.companyId) {
      throw new HttpException(
        "Tài khoản chưa gắn với công ty. Không thể tạo lời mời.",
        400,
      );
    }
    if (employer.status !== "APPROVED") {
      throw new HttpException(
        "Chỉ nhà tuyển dụng đã được duyệt mới tạo lời mời.",
        403,
      );
    }

    const rawToken = randomBytes(32).toString("hex");
    const tokenHash = hashEmployerInviteToken(rawToken);
    const emailNorm = normalizeEmployerInviteEmail(data.email);
    const inviteeLocal = emailNorm.includes("@")
      ? emailNorm.slice(0, emailNorm.indexOf("@")).trim()
      : emailNorm;

    await setEmployerInviteRedis(tokenHash, {
      companyId: employer.companyId,
      email: emailNorm,
      createdByEmployerId: employer.id,
    });

    const rawBase = String(env.FRONTEND_URL ?? "").trim();
    const base = (rawBase || DEFAULT_PUBLIC_SITE_URL).replace(/\/$/, "");
    const inviteUrl = `${base}/auth/sign-up?invite=${rawToken}`;

    let emailSent = false;
    try {
      await emailQueue.add("send-email-notification", {
        to: emailNorm,
        subject: `Lời mời tham gia nhà tuyển dụng — ${employer.company?.name ?? "Công ty"}`,
        template: "employer-invite",
        options: {
          inviteeName: inviteeLocal || undefined,
          inviterName: employer.user.username,
          companyName: employer.company?.name ?? "Công ty",
          inviteUrl,
          inviteCode: rawToken,
          appName: "TopCV",
        },
      });
      emailSent = true;
    } catch (e) {
      logger.warn("employer invite email queue failed", {
        error: String(e),
        companyId: employer.companyId,
      });
    }

    return { inviteUrl, token: rawToken, emailSent };
  },
};
