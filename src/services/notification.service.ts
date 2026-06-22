import { prisma } from "../utils/prisma";
import { env } from "../config/env";
import { emitNotificationToUser } from "../socket/chat.socket";

import { HttpException } from "../utils/exception";

export const NotificationType = {
  APPLICATION_NEW: "APPLICATION_NEW",
  APPLICATION_STATUS: "APPLICATION_STATUS",
  JOB_APPROVED: "JOB_APPROVED",
  JOB_PENDING_REVIEW: "JOB_PENDING_REVIEW",
  JOB_DEADLINE_WITHIN_24H: "JOB_DEADLINE_WITHIN_24H",
  EMPLOYER_REGISTRATION_PENDING: "EMPLOYER_REGISTRATION_PENDING",
  COMPANY_SUSPENDED: "COMPANY_SUSPENDED",
  COMPANY_NEW_JOB: "COMPANY_NEW_JOB",
  EMPLOYER_VIEWED_YOUR_PROFILE: "EMPLOYER_VIEWED_YOUR_PROFILE",
} as const;

export type NotificationTypeValue =
  (typeof NotificationType)[keyof typeof NotificationType];

type NotificationAppArea = "main" | "admin";

function detailPath(area: NotificationAppArea, id: number): string {
  return area === "admin"
    ? `/admin/notifications/${id}`
    : `/notifications/${id}`;
}

async function getAdminUserIds(): Promise<number[]> {
  const rows = await prisma.userRole.findMany({
    where: { role: { name: "ADMIN" } },

    select: { userId: true },
  });

  return Array.from(new Set<number>(rows.map((r) => Number(r.userId))));
}

export async function resolveEmployerUserIdsForJob(
  jobId: number,
): Promise<number[]> {
  const job = await prisma.job.findUnique({
    where: { id: jobId },

    select: { employerId: true, companyId: true },
  });

  if (!job) return [];

  if (job.employerId) {
    const e = await prisma.employer.findUnique({
      where: { id: job.employerId },

      select: { userId: true },
    });

    return e ? [e.userId] : [];
  }

  if (!job.companyId) return [];

  const employers = await prisma.employer.findMany({
    where: { companyId: job.companyId, status: "APPROVED" },

    select: { userId: true },

    take: 10,
  });

  return employers.map((x) => x.userId);
}

export const notificationService = {
  async notifyCompanyFollowersOfApprovedJob(params: {
    jobId: number;
    companyId: number;
    jobTitle: string;
    companyName: string;
  }) {
    const company = await prisma.company.findUnique({
      where: { id: params.companyId },

      select: { status: true },
    });

    if (!company?.status) return;

    const follows = await prisma.companyFollow.findMany({
      where: { companyId: params.companyId },

      include: {
        candidate: {
          include: {
            user: { select: { id: true, email: true, username: true } },
          },
        },
      },
    });

    const byUser = new Map<
      number,
      { userId: number; email: string; username: string }
    >();

    for (const f of follows) {
      const u = f.candidate.user;

      if (!u.email?.trim()) continue;

      if (!byUser.has(u.id)) {
        byUser.set(u.id, {
          userId: u.id,

          email: u.email.trim(),

          username: u.username,
        });
      }
    }

    const recipients = [...byUser.values()];

    if (!recipients.length) return;

    const title = "Công ty bạn theo dõi có tin tuyển dụng mới";

    const body = `${params.companyName} — "${params.jobTitle}".`;

    await notificationService.createForUsers(
      recipients.map((r) => r.userId),
      {
        type: NotificationType.COMPANY_NEW_JOB,
        title,
        body,
        appArea: "main",
      },
    );
  },

  async notifyCompanyEmployersSuspended(
    companyId: number,

    companyName: string,
  ) {
    const employers = await prisma.employer.findMany({
      where: { companyId },

      select: { userId: true },
    });

    const userIds = employers.map((e) => e.userId);

    return notificationService.createForUsers(userIds, {
      type: NotificationType.COMPANY_SUSPENDED,

      title: "Công ty đã ngừng hoạt động",

      body: `Hoạt động của "${companyName}" đã bị khóa bởi quản trị viên. Bạn tạm thời không thể cập nhật thông tin công ty hay đăng/sửa tin tuyển dụng. Liên hệ bộ phận hỗ trợ (email / hotline trên website) để được giải thích chi tiết.`,

      appArea: "main",
    });
  },

  async createOne(
    userId: number,

    input: {
      type: NotificationTypeValue;
      title: string;
      body?: string;
      appArea: NotificationAppArea;
    },
  ) {
    const created = await prisma.notification.create({
      data: {
        userId,
        type: input.type,
        title: input.title,
        body: input.body ?? null,
        link: null,
      },
    });

    const updated = await prisma.notification.update({
      where: { id: created.id },

      data: { link: detailPath(input.appArea, created.id) },
    });

    emitNotificationToUser(userId, updated);

    return updated;
  },

  async createForUsers(
    userIds: number[],

    input: {
      type: NotificationTypeValue;
      title: string;
      body?: string;
      appArea: NotificationAppArea;
    },
  ) {
    const unique = [...new Set(userIds.filter((id) => id > 0))];

    if (!unique.length) return { count: 0 };

    let count = 0;

    for (const uid of unique) {
      await notificationService.createOne(uid, input);
      count++;
    }

    return { count };
  },

  async notifyAdmins(input: {
    type: NotificationTypeValue;
    title: string;
    body?: string;
  }) {
    const ids = await getAdminUserIds();
    if (!ids.length) return { count: 0 };
    let count = 0;
    for (const userId of ids) {
      await notificationService.createOne(userId, {
        ...input,
        appArea: "admin",
      });
      count++;
    }

    return { count };
  },

  async listForUser(
    userId: number,

    query: { page?: number; limit?: number; unreadOnly?: boolean },
  ) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(Math.max(1, Number(query.limit) || 20), 50);
    const skip = (page - 1) * limit;

    const where = {
      userId,

      ...(query.unreadOnly ? { readAt: null } : {}),
    };

    const [items, total] = await Promise.all([
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),

      prisma.notification.count({ where }),
    ]);

    return {
      notifications: items,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 0,
      },
    };
  },

  async getByIdForUser(userId: number, id: number) {
    const row = await prisma.notification.findFirst({
      where: { id, userId },
    });

    if (!row) {
      throw new HttpException("Không tìm thấy thông báo", 404);
    }

    return row;
  },

  async unreadCount(userId: number) {
    return prisma.notification.count({
      where: { userId, readAt: null },
    });
  },

  async markRead(userId: number, notificationId: number) {
    const row = await prisma.notification.findFirst({
      where: { id: notificationId, userId },
    });

    if (!row) {
      throw new HttpException("Không tìm thấy thông báo", 404);
    }

    if (row.readAt) return row;

    return prisma.notification.update({
      where: { id: notificationId },
      data: { readAt: new Date() },
    });
  },

  async markAllRead(userId: number) {
    const res = await prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });

    return { updated: res.count };
  },

  async notifyCandidateEmployerViewedProfileFromSuggestions(params: {
    candidateUserId: number;
    companyName: string;
  }) {
    const title = `Công ty ${params.companyName} đã xem hồ sơ của bạn`;
    const windowMs = 30 * 60 * 1000;
    const recent = await prisma.notification.findFirst({
      where: {
        userId: params.candidateUserId,
        type: NotificationType.EMPLOYER_VIEWED_YOUR_PROFILE,
        title,
        createdAt: { gte: new Date(Date.now() - windowMs) },
      },
    });
    if (recent) return;

    await notificationService.createOne(params.candidateUserId, {
      type: NotificationType.EMPLOYER_VIEWED_YOUR_PROFILE,
      title,
      body: "Nhà tuyển dụng vừa mở xem hồ sơ của bạn từ mục gợi ý ứng viên.",
      appArea: "main",
    });
  },

  async purgeOldNotifications() {
    const now = new Date();

    const hardLine = new Date(now);
    hardLine.setDate(hardLine.getDate() - env.NOTIFICATION_DELETE_MAX_AGE_DAYS);

    const readLine = new Date(now);
    readLine.setDate(readLine.getDate() - env.NOTIFICATION_DELETE_READ_DAYS);

    const [ancient, oldRead] = await Promise.all([
      prisma.notification.deleteMany({
        where: { createdAt: { lt: hardLine } },
      }),
      prisma.notification.deleteMany({
        where: {
          readAt: { not: null },
          createdAt: { lt: readLine },
        },
      }),
    ]);

    return {
      deletedAncient: ancient.count,
      deletedOldRead: oldRead.count,
    };
  },
};
