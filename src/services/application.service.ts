import { Prisma } from "../generated/prisma/client";
import type { ApplicationStatus } from "../generated/prisma/client";
import { prisma } from "../utils/prisma";
import { env } from "../config/env";
import {
  CacheKeys,
  cacheDelRecommendedJobsForUser,
  cacheGetJson,
  cacheSetJson,
  invalidateAdminDashboard,
  invalidateCandidateApplicationCaches,
} from "../utils/cache";
import { HttpException } from "../utils/exception";
import { resolveResumePreviewForEmployer } from "../utils/application-resume-preview";
import {
  NotificationType,
  notificationService,
  resolveEmployerUserIdsForJob,
} from "./notification.service";
import { aiMatchQueue } from "../queues/ai_match.queue";
import { logger } from "../utils/logger";

const APPLICATION_STATUSES: ApplicationStatus[] = [
  "PENDING",
  "REVIEWED",
  "ACCEPTED",
  "REJECTED",
];

function parseStatus(value: unknown): ApplicationStatus | undefined {
  if (typeof value !== "string") return undefined;
  return APPLICATION_STATUSES.includes(value as ApplicationStatus)
    ? (value as ApplicationStatus)
    : undefined;
}

function firstString(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && typeof value[0] === "string") return value[0];
  return undefined;
}

export const applicationService = {
  async listForAdmin(query: Record<string, unknown>) {
    const page = Math.max(1, Number(firstString(query.page)) || 1);
    const limit = Math.min(
      Math.max(1, Number(firstString(query.limit)) || 20),
      100,
    );
    const skip = (page - 1) * limit;

    const status = parseStatus(firstString(query.status));
    const jobIdRaw = firstString(query.jobId);
    const search = firstString(query.search)?.trim();

    const where: Prisma.ApplicationWhereInput = {
      ...(status ? { status } : {}),
      ...(jobIdRaw != null && jobIdRaw !== "" && !Number.isNaN(Number(jobIdRaw))
        ? { jobId: Number(jobIdRaw) }
        : {}),
      ...(search
        ? {
            OR: [
              {
                candidate: {
                  user: {
                    email: { contains: search },
                  },
                },
              },
              {
                candidate: {
                  user: {
                    username: { contains: search },
                  },
                },
              },
              { job: { title: { contains: search } } },
            ],
          }
        : {}),
    };

    const [applications, total] = await Promise.all([
      prisma.application.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          candidate: {
            include: {
              user: {
                select: { id: true, email: true, username: true },
              },
              province: true,
              district: true,
            },
          },
          job: {
            include: {
              company: { select: { id: true, name: true } },
              category: { select: { id: true, name: true } },
            },
          },
          resume: { select: { id: true, title: true, fileUrl: true } },
        },
      }),
      prisma.application.count({ where }),
    ]);

    return {
      applications,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  },

  async getApplicationPreviewForAdmin(applicationId: number) {
    if (!Number.isFinite(applicationId) || applicationId < 1) {
      throw new HttpException("ID không hợp lệ", 400);
    }

    const application = await prisma.application.findUnique({
      where: { id: applicationId },
      include: {
        job: {
          select: {
            id: true,
            title: true,
            company: { select: { id: true, name: true } },
          },
        },
        candidate: {
          include: {
            user: { select: { id: true, username: true, email: true } },
            province: { select: { name: true } },
            district: { select: { name: true } },
          },
        },
        resume: { select: { id: true, title: true, fileUrl: true } },
      },
    });

    if (!application) {
      throw new HttpException(
        "Không tìm thấy hồ sơ ứng tuyển",
        404,
        "APPLICATION_NOT_FOUND",
      );
    }

    const coverLetter = application.coverLetter?.trim() || null;

    let resume:
      | { kind: "none" }
      | { kind: "upload"; title: string; fileUrl: string }
      | { kind: "template"; title: string; cv: unknown };

    if (!application.resume) {
      resume = { kind: "none" };
    } else {
      const resolved = await resolveResumePreviewForEmployer(
        application.resume.fileUrl,
        application.candidate.userId,
      );
      if (resolved.kind === "upload") {
        resume = {
          kind: "upload",
          title: application.resume.title,
          fileUrl: resolved.fileUrl,
        };
      } else {
        resume = {
          kind: "template",
          title: application.resume.title,
          cv: resolved.cv,
        };
      }
    }

    return {
      applicationId: application.id,
      coverLetter,
      job: {
        id: application.job.id,
        title: application.job.title,
        company: application.job.company,
      },
      candidate: {
        user: application.candidate.user,
        province: application.candidate.province,
        district: application.candidate.district,
      },
      resume,
    };
  },

  async updateStatus(id: number, status: ApplicationStatus) {
    if (Number.isNaN(id)) {
      throw new HttpException("ID không hợp lệ", 400, "INVALID_ID");
    }

    const existing = await prisma.application.findUnique({ where: { id } });
    if (!existing) {
      throw new HttpException(
        "Không tìm thấy hồ sơ ứng tuyển",
        404,
        "APPLICATION_NOT_FOUND",
      );
    }

    const row = await prisma.application.update({
      where: { id },
      data: { status },
      include: {
        candidate: {
          include: {
            user: { select: { id: true, email: true, username: true } },
            province: true,
            district: true,
          },
        },
        job: {
          include: {
            company: { select: { id: true, name: true } },
            category: { select: { id: true, name: true } },
          },
        },
        resume: { select: { id: true, title: true, fileUrl: true } },
      },
    });
    await invalidateAdminDashboard();

    const candidateUserId = row.candidate.user.id;
    await invalidateCandidateApplicationCaches(candidateUserId);
    await notificationService.createForUsers([candidateUserId], {
      type: NotificationType.APPLICATION_STATUS,
      title: "Cập nhật trạng thái đơn ứng tuyển",
      body: `Đơn tại "${row.job.title}" — trạng thái: ${status}.`,
      appArea: "main",
    });

    return row;
  },

  async applyAsCandidate(
    userId: number,
    payload: { jobId: number; resumeId: number; coverLetter?: string },
  ) {
    const candidate = await prisma.candidate.findUnique({
      where: { userId },
    });
    if (!candidate) {
      throw new HttpException(
        "Chỉ tài khoản ứng viên mới có thể nộp đơn ứng tuyển",
        403,
        "APPLY_NOT_CANDIDATE",
      );
    }

    const job = await prisma.job.findFirst({
      where: {
        id: payload.jobId,
        deletedAt: null,
        company: { deletedAt: null, status: true },
        category: { deletedAt: null },
      },
      select: {
        id: true,
        title: true,
        moderationStatus: true,
        deadline: true,
      },
    });
    if (!job) {
      throw new HttpException(
        "Không tìm thấy tin tuyển dụng",
        404,
        "JOB_NOT_FOUND",
      );
    }
    if (job.moderationStatus !== "APPROVED") {
      throw new HttpException(
        "Tin tuyển dụng không khả dụng",
        400,
        "JOB_NOT_AVAILABLE",
      );
    }
    if (job.deadline && job.deadline < new Date()) {
      throw new HttpException(
        "Tin tuyển dụng đã hết hạn nhận hồ sơ",
        400,
        "JOB_DEADLINE_PASSED",
      );
    }

    const resume = await prisma.resume.findFirst({
      where: {
        id: payload.resumeId,
        candidateId: candidate.id,
        deletedAt: null,
      },
    });
    if (!resume) {
      throw new HttpException(
        "CV không thuộc tài khoản của bạn",
        400,
        "RESUME_INVALID",
      );
    }

    const existing = await prisma.application.findUnique({
      where: {
        candidateId_jobId: {
          candidateId: candidate.id,
          jobId: payload.jobId,
        },
      },
    });
    if (existing) {
      throw new HttpException(
        "Bạn đã ứng tuyển tin này rồi",
        409,
        "APPLICATION_DUPLICATE",
      );
    }

    const application = await prisma.application.create({
      data: {
        candidateId: candidate.id,
        jobId: payload.jobId,
        resumeId: payload.resumeId,
        status: "PENDING",
        ...(payload.coverLetter ? { coverLetter: payload.coverLetter } : {}),
      },
    });

    try {
      await aiMatchQueue.add("score-application", {
        applicationId: application.id,
      }, {
        attempts: 3,
        backoff: { type: "exponential", delay: 2000 },
      });
    } catch (e) {
      logger.warn("aiMatchQueue enqueue failed", { error: String(e) });
    }
    await invalidateAdminDashboard();
    await cacheDelRecommendedJobsForUser(userId);
    await invalidateCandidateApplicationCaches(userId);

    const jobInfo = await prisma.job.findUnique({
      where: { id: payload.jobId },
      select: { title: true },
    });
    const candidateUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { username: true },
    });
    const employerUserIds = await resolveEmployerUserIdsForJob(payload.jobId);
    if (employerUserIds.length) {
      await notificationService.createForUsers(employerUserIds, {
        type: NotificationType.APPLICATION_NEW,
        title: "Ứng viên mới đã nộp đơn",
        body: `${candidateUser?.username ?? "Ứng viên"} — ${jobInfo?.title ?? "Tin tuyển dụng"}.`,
        appArea: "main",
      });
    }

    return application;
  },

  async getAppliedJobIds(userId: number): Promise<number[]> {
    const cacheKey = CacheKeys.candidateAppliedJobIds(userId);
    const hit = await cacheGetJson<number[]>(cacheKey);
    if (hit) return hit;
    const candidate = await prisma.candidate.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!candidate) return [];
    const rows = await prisma.application.findMany({
      where: { candidateId: candidate.id },
      select: { jobId: true },
    });
    const jobIds = rows.map((r) => r.jobId);
    await cacheSetJson(
      cacheKey,
      jobIds,
      env.CACHE_TTL_CANDIDATE_APPLICATIONS_SEC,
    );
    return jobIds;
  },

  async listForCandidate(userId: number) {
    const cacheKey = CacheKeys.candidateApplications(userId);
    const hit = await cacheGetJson<unknown>(cacheKey);
    if (Array.isArray(hit)) return hit as Awaited<ReturnType<typeof prisma.application.findMany>>;
    const candidate = await prisma.candidate.findUnique({
      where: { userId },
    });
    if (!candidate) {
      return [];
    }
    const rows = await prisma.application.findMany({
      where: { candidateId: candidate.id },
      orderBy: { createdAt: "desc" },
      include: {
        job: {
          include: {
            company: {
              select: { id: true, name: true, logo: true, location: true },
            },
            category: { select: { id: true, name: true } },
          },
        },
        resume: { select: { id: true, title: true, fileUrl: true } },
      },
    });
    await cacheSetJson(
      cacheKey,
      rows,
      env.CACHE_TTL_CANDIDATE_APPLICATIONS_SEC,
    );
    return rows;
  },

  async getForCandidate(userId: number, applicationId: number) {
    if (!Number.isFinite(applicationId) || applicationId <= 0) {
      throw new HttpException("Invalid id", 400);
    }
    const candidate = await prisma.candidate.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!candidate) {
      throw new HttpException("Not found", 404);
    }
    const row = await prisma.application.findFirst({
      where: { id: Math.trunc(applicationId), candidateId: candidate.id },
      include: {
        job: {
          include: {
            company: {
              select: { id: true, name: true, logo: true, location: true },
            },
            category: { select: { id: true, name: true } },
          },
        },
        resume: { select: { id: true, title: true, fileUrl: true } },
      },
    });
    if (!row) {
      throw new HttpException("Not found", 404);
    }
    return row;
  },

  async withdrawManyAsCandidate(userId: number, ids: number[]) {
    const uniqueIds = [...new Set(ids.map((id) => Math.trunc(id)))].filter(
      (id) => Number.isFinite(id) && id > 0,
    );
    if (uniqueIds.length === 0) {
      throw new HttpException("Danh sách đơn không hợp lệ", 400);
    }

    const candidate = await prisma.candidate.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!candidate) {
      throw new HttpException(
        "Chỉ tài khoản ứng viên mới có thể rút đơn",
        403,
        "APPLY_NOT_CANDIDATE",
      );
    }

    const owned = await prisma.application.findMany({
      where: { id: { in: uniqueIds }, candidateId: candidate.id },
      select: { id: true, status: true },
    });
    const ownedIds = new Set(owned.map((row) => row.id));
    const missing = uniqueIds.filter((id) => !ownedIds.has(id));
    if (missing.length > 0) {
      throw new HttpException("Một số đơn không tồn tại", 404);
    }

    const pendingIds = owned
      .filter((row) => row.status === "PENDING")
      .map((row) => row.id);
    if (pendingIds.length > 0) {
      await prisma.application.deleteMany({
        where: { id: { in: pendingIds }, candidateId: candidate.id },
      });
      await invalidateCandidateApplicationCaches(userId);
    }

    return {
      withdrawn: pendingIds.length,
      skipped: owned.length - pendingIds.length,
    };
  },
};
