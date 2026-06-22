import {
  EmployerStatus,
  JobModerationStatus,
  JobType,
} from "../generated/prisma/client";
import { env } from "../config/env";
import { prisma } from "../utils/prisma";
import { emailQueue } from "../queues/email.queue";
import { logger } from "../utils/logger";
import { candidateRecommendationService } from "./candidate_recommendation.service";

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_JOBS = 15;
const DIGEST_TZ = "Asia/Ho_Chi_Minh";
const DEFAULT_PUBLIC_SITE_URL = "https://nextcv.io.vn";

function siteOrigin(): string {
  const raw = String(env.FRONTEND_URL ?? "").trim();
  if (!raw) return DEFAULT_PUBLIC_SITE_URL;
  return raw.replace(/\/$/, "");
}

function formatDigestSalary(min?: number | null, max?: number | null): string {
  const m = min ?? undefined;
  const x = max ?? undefined;
  if (!m && !x) return "Thỏa thuận";
  const toTrieu = (v: number) => Math.round(v / 1_000_000);
  if (m && x) return `${toTrieu(m)} - ${toTrieu(x)} triệu`;
  if (m) return `Từ ${toTrieu(m)} triệu`;
  return `Đến ${toTrieu(x!)} triệu`;
}

const JOB_TYPE_VI: Record<JobType, string> = {
  FULL_TIME: "Toàn thời gian",
  PART_TIME: "Bán thời gian",
  FREELANCE: "Freelance",
};

function formatDigestJobType(t: string): string {
  const key = String(t ?? "").trim().toUpperCase() as JobType;
  return JOB_TYPE_VI[key] ?? t;
}

type DigestJobItem = {
  jobUrl: string;
  title: string;
  companyName: string;
  salaryLabel: string;
  categoryName: string;
  locationLabel: string;
  isFeatured: boolean;
  jobTypeLabel: string;
};

function digestSince(): Date {
  return new Date(Date.now() - DAY_MS);
}

export const emailDigestService = {
  digestTimezone: DIGEST_TZ,

  async runFollowedCompaniesJobsDigest() {
    if (!env.DIGEST_EMAIL_ENABLED) return;

    const since = digestSince();
    const now = new Date();
    const origin = siteOrigin();
    let queued = 0;

    const candidates = await prisma.candidate.findMany({
      where: {
        companyFollows: { some: {} },
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            username: true,
            receiveEmailNotifications: true,
          },
        },
        companyFollows: { select: { companyId: true } },
      },
    });

    for (const c of candidates) {
      const email = c.user.email?.trim();
      if (!email) continue;
      if (c.user.receiveEmailNotifications === false) continue;

      const companyIds: number[] = Array.from(
        new Set<number>(c.companyFollows.map((f) => Number(f.companyId))),
      );
      if (!companyIds.length) continue;

      try {
        const jobs = await prisma.job.findMany({
          where: {
            companyId: { in: companyIds },
            moderationStatus: JobModerationStatus.APPROVED,
            company: { status: true },
            OR: [{ deadline: null }, { deadline: { gte: now } }],
            updatedAt: { gte: since },
          },
          orderBy: { updatedAt: "desc" },
          take: MAX_JOBS,
          include: {
            category: { select: { name: true } },
            company: {
              select: {
                name: true,
                province: { select: { name: true } },
              },
            },
          },
        });

        if (!jobs.length) continue;

        const items: DigestJobItem[] = jobs.map((j) => {
          const loc =
            (j.workLocation && j.workLocation.trim()) ||
            j.company.province?.name ||
            "—";
          return {
            title: j.title,
            companyName: j.company.name,
            jobUrl: `${origin}/jobs/${j.id}`,
            salaryLabel: formatDigestSalary(j.minSalary, j.maxSalary),
            categoryName: j.category?.name ?? "",
            locationLabel: loc,
            isFeatured: j.isFeatured,
            jobTypeLabel: formatDigestJobType(j.jobType),
          };
        });

        await emailQueue.add("send-email-notification", {
          to: email,
          subject: `[TopCV] Việc làm mới từ công ty bạn theo dõi (${jobs.length})`,
          template: "digest-followed-jobs",
          options: {
            username: c.user.username,
            jobs: items,
            moreUrl: `${origin}/followed-companies`,
            appName: "TopCV",
          },
        });
        queued += 1;
      } catch (err) {
        logger.error("digest-followed-jobs: candidate failed", {
          userId: c.user.id,
          error: err,
        });
      }
    }

    logger.info("digest-followed-jobs completed", {
      candidates: candidates.length,
      emailsQueued: queued,
    });
  },

  async runRecommendedJobsDigest() {
    if (!env.DIGEST_EMAIL_ENABLED) return;

    const origin = siteOrigin();
    let queued = 0;

    const candidates = await prisma.candidate.findMany({
      include: {
        user: {
          select: {
            id: true,
            email: true,
            username: true,
            receiveEmailNotifications: true,
          },
        },
      },
    });

    for (const c of candidates) {
      const email = c.user.email?.trim();
      if (!email) continue;
      if (c.user.receiveEmailNotifications === false) continue;

      try {
        const rows = await candidateRecommendationService.getTopRecommendedJobsForDigest(
          c.user.id,
          MAX_JOBS,
        );
        if (!rows.length) continue;

        const items: DigestJobItem[] = rows.map((r) => ({
          title: r.title,
          companyName: r.companyName,
          jobUrl: `${origin}/jobs/${r.id}`,
          salaryLabel: formatDigestSalary(r.minSalary, r.maxSalary),
          categoryName: r.categoryName,
          locationLabel: r.locationLabel,
          isFeatured: r.isFeatured,
          jobTypeLabel: formatDigestJobType(r.jobType),
        }));

        await emailQueue.add("send-email-notification", {
          to: email,
          subject: `[TopCV] Gợi ý việc làm phù hợp hôm nay (${rows.length})`,
          template: "digest-recommended-jobs",
          options: {
            username: c.user.username,
            jobs: items,
            moreUrl: `${origin}/jobs`,
            appName: "TopCV",
          },
        });
        queued += 1;
      } catch (err) {
        logger.error("digest-recommended-jobs: candidate failed", {
          userId: c.user.id,
          error: err,
        });
      }
    }

    logger.info("digest-recommended-jobs completed", {
      candidates: candidates.length,
      emailsQueued: queued,
    });
  },

  async runEmployerNewApplicationsDigest() {
    if (!env.DIGEST_EMAIL_ENABLED) return;

    const since = digestSince();
    const origin = siteOrigin();
    let queued = 0;

    const applications = await prisma.application.findMany({
      where: { createdAt: { gte: since } },
      select: {
        job: { select: { companyId: true } },
      },
    });

    const byCompany = new Map<number, number>();
    for (const a of applications) {
      const cid = a.job.companyId;
      byCompany.set(cid, (byCompany.get(cid) ?? 0) + 1);
    }

    if (byCompany.size === 0) {
      logger.info("digest-employer-applications: no new applications");
      return;
    }

    const employers = await prisma.employer.findMany({
      where: {
        status: EmployerStatus.APPROVED,
        companyId: { in: [...byCompany.keys()] },
      },
      include: {
        user: {
          select: {
            email: true,
            username: true,
            receiveEmailNotifications: true,
          },
        },
        company: { select: { name: true, id: true } },
      },
    });

    for (const e of employers) {
      if (e.companyId == null) continue;
      const count = byCompany.get(e.companyId) ?? 0;
      if (count === 0) continue;
      const to = e.user.email?.trim();
      if (!to) continue;
      if (e.user.receiveEmailNotifications === false) continue;

      try {
        await emailQueue.add("send-email-notification", {
          to,
          subject: `[TopCV] ${count} đơn ứng tuyển mới — ${e.company?.name ?? "Công ty"}`,
          template: "digest-employer-applications",
          options: {
            username: e.user.username,
            companyName: e.company?.name ?? "",
            newApplicationsCount: count,
            applicationsUrl: `${origin}/employer/applications`,
            appName: "TopCV",
          },
        });
        queued += 1;
      } catch (err) {
        logger.error("digest-employer-applications: employer failed", {
          userId: e.userId,
          error: err,
        });
      }
    }

    logger.info("digest-employer-applications completed", {
      employers: employers.length,
      emailsQueued: queued,
    });
  },
};
