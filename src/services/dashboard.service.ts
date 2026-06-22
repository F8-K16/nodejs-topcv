import { prisma } from "../utils/prisma";
import { JobModerationStatus } from "../generated/prisma/enums";
import { env } from "../config/env";
import { CacheKeys, cacheGetJson, cacheSetJson } from "../utils/cache";

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function lastNMonthKeys(n: number): string[] {
  const keys: string[] = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    keys.push(monthKey(d));
  }
  return keys;
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function lastNDayKeys(n: number): string[] {
  const keys: string[] = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    d.setHours(0, 0, 0, 0);
    keys.push(dayKey(d));
  }
  return keys;
}

function countByMonth(
  rows: { createdAt: Date | null }[],
  keys: string[],
): number[] {
  const map = new Map<string, number>();
  for (const k of keys) map.set(k, 0);
  for (const r of rows) {
    if (!r.createdAt) continue;
    const k = monthKey(r.createdAt);
    if (map.has(k)) map.set(k, (map.get(k) ?? 0) + 1);
  }
  return keys.map((k) => map.get(k) ?? 0);
}

function countByDay(
  rows: { createdAt: Date | null }[],
  keys: string[],
): number[] {
  const map = new Map<string, number>();
  for (const k of keys) map.set(k, 0);
  for (const r of rows) {
    if (!r.createdAt) continue;
    const k = dayKey(r.createdAt);
    if (map.has(k)) map.set(k, (map.get(k) ?? 0) + 1);
  }
  return keys.map((k) => map.get(k) ?? 0);
}

async function computeDashboardSummary() {
  const now = new Date();

  const [
    userCount,
    companyCount,
    jobCount,
    applicationCount,
    resumeCount,
    savedJobCount,
    pendingEmployerCount,
    categoryCount,
    employerApprovedCount,
    candidateCount,
    skillCount,
    jobsActive,
    jobsExpired,
    pendingJobs,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.company.count(),
    prisma.job.count(),
    prisma.application.count(),
    prisma.resume.count(),
    prisma.savedJob.count(),
    prisma.employer.count({ where: { status: "PENDING" } }),
    prisma.category.count(),
    prisma.employer.count({ where: { status: "APPROVED" } }),
    prisma.candidate.count(),
    prisma.skill.count(),
    prisma.job.count({
      where: {
        moderationStatus: JobModerationStatus.APPROVED,
        OR: [{ deadline: null }, { deadline: { gte: now } }],
      },
    }),
    prisma.job.count({
      where: {
        moderationStatus: JobModerationStatus.APPROVED,
        deadline: { lt: now },
      },
    }),
    prisma.job.count({
      where: { moderationStatus: JobModerationStatus.PENDING },
    }),
  ]);

  const chartKeys = lastNMonthKeys(6);
  const since = new Date(chartKeys[0] + "-01T00:00:00.000Z");

  const [userRows, jobRows, applicationRows] = await Promise.all([
    prisma.user.findMany({
      where: { createdAt: { gte: since } },
      select: { createdAt: true },
    }),
    prisma.job.findMany({
      where: { createdAt: { gte: since } },
      select: { createdAt: true },
    }),
    prisma.application.findMany({
      where: { createdAt: { gte: since } },
      select: { createdAt: true },
    }),
  ]);

  const dayKeys = lastNDayKeys(30);
  const sinceDaily = new Date();
  sinceDaily.setDate(sinceDaily.getDate() - 29);
  sinceDaily.setHours(0, 0, 0, 0);

  const [userRowsDaily, jobRowsDaily, applicationRowsDaily, appsByCategory] =
    await Promise.all([
      prisma.user.findMany({
        where: { createdAt: { gte: sinceDaily } },
        select: { createdAt: true },
      }),
      prisma.job.findMany({
        where: { createdAt: { gte: sinceDaily } },
        select: { createdAt: true },
      }),
      prisma.application.findMany({
        where: { createdAt: { gte: sinceDaily } },
        select: { createdAt: true },
      }),
      prisma.application.findMany({
        where: {
          createdAt: { gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) },
        },
        select: {
          id: true,
          job: {
            select: { category: { select: { id: true, name: true } } },
          },
        },
      }),
    ]);

  const categoryAgg = new Map<number, { name: string; applicationCount: number }>();
  for (const a of appsByCategory) {
    const c = a.job?.category;
    if (!c) continue;
    const cur = categoryAgg.get(c.id);
    if (cur) {
      cur.applicationCount += 1;
    } else {
      categoryAgg.set(c.id, { name: c.name, applicationCount: 1 });
    }
  }
  const topHotJobCategories = [...categoryAgg.entries()]
    .map(([id, v]) => ({ id, name: v.name, applicationCount: v.applicationCount }))
    .sort((a, b) => b.applicationCount - a.applicationCount)
    .slice(0, 10);

  const [topCompanies, recentJobs, recentUsers] = await Promise.all([
    prisma.company.findMany({
      take: 8,
      orderBy: { jobs: { _count: "desc" } },
      select: {
        id: true,
        name: true,
        logo: true,
        location: true,
        _count: { select: { jobs: true } },
      },
    }),
    prisma.job.findMany({
      take: 8,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        title: true,
        createdAt: true,
        deadline: true,
        moderationStatus: true,
        isFeatured: true,
        workLocation: true,
        minSalary: true,
        maxSalary: true,
        company: {
          select: { id: true, name: true, logo: true, location: true },
        },
      },
    }),
    prisma.user.findMany({
      take: 8,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        email: true,
        username: true,
        avatar: true,
        createdAt: true,
        isVerified: true,
        isBlocked: true,
        userRoles: { include: { role: { select: { name: true } } } },
      },
    }),
  ]);

  return {
    userCount,
    companyCount,
    jobCount,
    applicationCount,
    resumeCount,
    savedJobCount,
    pendingEmployerCount,
    categoryCount,
    employerApprovedCount,
    candidateCount,
    skillCount,
    jobsActive,
    jobsExpired,
    pendingJobs,
    revenueVnd: null as number | null,
    chart: {
      months: chartKeys,
      users: countByMonth(userRows, chartKeys),
      jobs: countByMonth(jobRows, chartKeys),
      applications: countByMonth(applicationRows, chartKeys),
    },
    chartDaily: {
      days: dayKeys,
      users: countByDay(userRowsDaily, dayKeys),
      jobs: countByDay(jobRowsDaily, dayKeys),
      applications: countByDay(applicationRowsDaily, dayKeys),
    },
    topHotJobCategories,
    topCompanies,
    recentJobs,
    recentUsers,
  };
}

export type DashboardSummaryPayload = Awaited<
  ReturnType<typeof computeDashboardSummary>
>;

export const dashboardService = {
  async getSummary(): Promise<DashboardSummaryPayload> {
    const cached = await cacheGetJson<DashboardSummaryPayload>(
      CacheKeys.adminDashboardSummary,
    );
    if (cached) return cached;

    const fresh = await computeDashboardSummary();
    await cacheSetJson(
      CacheKeys.adminDashboardSummary,
      fresh,
      env.CACHE_TTL_DASHBOARD_SEC,
    );
    return fresh;
  },
};
