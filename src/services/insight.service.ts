import { JobModerationStatus } from "../generated/prisma/client";
import { prisma } from "../utils/prisma";
import {
  CacheKeys,
  cacheGetJson,
  cacheSetJson,
} from "../utils/cache";
import { env } from "../config/env";

export type SalaryInsightRow = {
  id: number;
  label: string;
  avgSalary: number;
  minSalary: number;
  maxSalary: number;
  jobCount: number;
};

function midSalary(min: number | null, max: number | null): number | null {
  const hasMin = min != null && min > 0;
  const hasMax = max != null && max > 0;
  if (hasMin && hasMax) return Math.round((min! + max!) / 2);
  if (hasMin) return min!;
  if (hasMax) return max!;
  return null;
}

async function aggregateSalary(
  by: "category" | "province",
): Promise<SalaryInsightRow[]> {
  const now = new Date();
  const jobs = await prisma.job.findMany({
    where: {
      deletedAt: null,
      moderationStatus: JobModerationStatus.APPROVED,
      company: { status: true, deletedAt: null },
      category: { deletedAt: null },
      OR: [{ deadline: null }, { deadline: { gte: now } }],
      AND: [
        {
          OR: [{ minSalary: { gt: 0 } }, { maxSalary: { gt: 0 } }],
        },
      ],
    },
    select: {
      minSalary: true,
      maxSalary: true,
      category: { select: { id: true, name: true } },
      company: {
        select: { province: { select: { id: true, name: true } } },
      },
    },
    take: 8000,
  });

  type Acc = {
    id: number;
    label: string;
    sum: number;
    min: number;
    max: number;
    count: number;
  };
  const map = new Map<number, Acc>();

  for (const job of jobs) {
    const mid = midSalary(job.minSalary, job.maxSalary);
    if (mid == null) continue;
    const dim = by === "category" ? job.category : job.company.province;
    if (!dim) continue;
    const cur = map.get(dim.id) ?? {
      id: dim.id,
      label: dim.name,
      sum: 0,
      min: mid,
      max: mid,
      count: 0,
    };
    cur.sum += mid;
    cur.min = Math.min(cur.min, mid);
    cur.max = Math.max(cur.max, mid);
    cur.count += 1;
    map.set(dim.id, cur);
  }

  return Array.from(map.values())
    .filter((row) => row.count >= 2)
    .map((row) => ({
      id: row.id,
      label: row.label,
      avgSalary: Math.round(row.sum / row.count),
      minSalary: row.min,
      maxSalary: row.max,
      jobCount: row.count,
    }))
    .sort((a, b) => b.avgSalary - a.avgSalary)
    .slice(0, 12);
}

export const insightService = {
  async salaryBenchmark(by: "category" | "province" = "category") {
    const groupBy = by === "province" ? "province" : "category";
    const cacheKey = CacheKeys.salaryInsights(groupBy);

    if (env.CACHE_ENABLED) {
      const hit = await cacheGetJson<{
        by: string;
        items: SalaryInsightRow[];
        generatedAt: string;
      }>(cacheKey);
      if (hit) return hit;
    }

    const items = await aggregateSalary(groupBy);
    const payload = {
      by: groupBy,
      items,
      generatedAt: new Date().toISOString(),
    };

    if (env.CACHE_ENABLED) {
      await cacheSetJson(cacheKey, payload, 60 * 30);
    }
    return payload;
  },
};
