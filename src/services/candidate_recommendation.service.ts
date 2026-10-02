import { JobModerationStatus, Prisma } from "../generated/prisma/client";
import { prisma, prismaTransaction } from "../utils/prisma";
import { HttpException } from "../utils/exception";
import { locationService } from "./location.service";
import { env } from "../config/env";
import {
  CacheKeys,
  cacheGetJson,
  cacheSetJson,
  cacheDelAiCvSuggestForUser,
  cacheDelRecommendedJobsForUser,
  stableCacheHash,
} from "../utils/cache";
import type { RecommendationProfilePutBody } from "../schemas/candidate_recommendation.schema";
import {
  EXPERIENCE_OPTIONS,
  JOB_MODERATION_OPTIONS,
  JOB_TYPE_OPTIONS,
  SalaryRange,
  SalaryRangeOptions,
} from "../types/job.type";
import type { JobListPayload } from "./job.service";
import { aiService } from "./ai.service";
import { normalizeForSearch } from "../search/search_intent";

function resolvePool(limit: number) {
  const base = env.JOBS_RECOMMENDED_POOL_SIZE;
  const scaled = Math.max(base, Math.trunc(limit) * 6);
  return Math.min(300, Math.max(30, scaled));
}

const EXPERIENCE_RANK: Record<string, number> = {
  INTERN: 0,
  FRESHER: 1,
  JUNIOR: 2,
  MIDDLE: 3,
  SENIOR: 4,
  LEAD: 5,
};

const isLikelyRemote = (raw: string) => {
  const q = normalizeForSearch(raw);
  if (!q) return false;
  return (
    /\bremote\b/.test(q) ||
    /\bwfh\b/.test(q) ||
    /\bwork from home\b/.test(q) ||
    /\btu xa\b/.test(q) ||
    /\blam viec tu xa\b/.test(q) ||
    /\bonline\b/.test(q)
  );
};

const WEIGHTS = {
  locationDistrict: 25,
  locationProvince: 18,
  locationMismatch: -8,
  category: 12,
  categoryMiss: -2,
  experienceSame: 8,
  experienceNear: 3,
  experienceFar: -2,
  jobType: 3,
  jobTypeMismatch: -3,
  salary: 2,
  salaryMiss: -3,
  salaryOverlapBonus: 1,
  remote: 2,
  skillPerMatch: 4,
  skillCap: 16,
  skillMiss: -6,
  featured: 1,
  recencyMaxDays: 30,
  recencyBonus: 3,
  duplicateCompanyPenalty: -2,
  duplicateCategoryPenalty: -1,
} as const;

const jobListInclude = {
  company: {
    include: {
      province: true,
      district: true,
    },
  },
  employer: {
    include: {
      user: true,
    },
  },
  category: true,
  jobSkills: { include: { skill: true } },
  _count: {
    select: {
      applications: true,
    },
  },
} satisfies Prisma.JobInclude;

type JobWithScore = Prisma.JobGetPayload<{ include: typeof jobListInclude }> & {
  score: number;
};

type RecommendationContext = {
  pref: Prisma.CandidatePreferenceGetPayload<Record<string, never>> | null;
  prefProvinceId: number | null;
  prefDistrictId: number | null;
  skillSet: Set<number>;
  categorySet: Set<number>;
  now: Date;
};

function isRemoteJob(job: Prisma.JobGetPayload<{ include: typeof jobListInclude }>) {
  const wl = job.workLocation ?? "";
  return isLikelyRemote(wl) || isLikelyRemote(job.description);
}

function computeRecommendationScore(
  job: Prisma.JobGetPayload<{ include: typeof jobListInclude }>,
  ctx: RecommendationContext,
): number {
  let score = 0;
  const { pref, prefProvinceId, prefDistrictId, skillSet, categorySet, now } = ctx;
  const company = job.company;
  const remoteJob = isRemoteJob(job);

  if (prefDistrictId != null && company.districtId === prefDistrictId) {
    score += WEIGHTS.locationDistrict;
  } else if (prefProvinceId != null && company.provinceId === prefProvinceId) {
    score += WEIGHTS.locationProvince;
  } else if (prefDistrictId != null || prefProvinceId != null) {
    if (!(pref?.isOpenToRemote && remoteJob)) {
      score += WEIGHTS.locationMismatch;
    }
  }

  if (pref?.jobType != null && job.jobType === pref.jobType) {
    score += WEIGHTS.jobType;
  } else if (pref?.jobType != null) {
    score += WEIGHTS.jobTypeMismatch;
  }

  if (pref?.experienceLevel != null) {
    const pr = EXPERIENCE_RANK[String(pref.experienceLevel)] ?? null;
    const jr = EXPERIENCE_RANK[String(job.experienceLevel)] ?? null;
    if (pr != null && jr != null) {
      const d = Math.abs(jr - pr);
      if (d === 0) score += WEIGHTS.experienceSame;
      else if (d === 1) score += WEIGHTS.experienceNear;
      else score += WEIGHTS.experienceFar;
    }
  }

  if (pref?.desiredMinSalary != null || pref?.desiredMaxSalary != null) {
    const cMin = pref?.desiredMinSalary ?? null;
    const cMax = pref?.desiredMaxSalary ?? null;
    const jMin = job.minSalary ?? null;
    const jMax = job.maxSalary ?? null;
    if (cMin != null) {
      if (jMax != null && jMax >= cMin) score += WEIGHTS.salary;
      else if (jMax == null && jMin != null && jMin >= cMin) score += 1;
    }
    if (cMax != null) {
      if (jMin != null && jMin <= cMax) score += 1;
      else if (jMin == null && jMax != null && jMax <= cMax) score += 1;
    }
    if (
      cMin != null &&
      cMax != null &&
      jMin != null &&
      jMax != null &&
      jMax >= cMin &&
      jMin <= cMax
    ) {
      score += WEIGHTS.salaryOverlapBonus;
    } else if (
      cMin != null &&
      cMax != null &&
      jMin != null &&
      jMax != null &&
      (jMax < cMin || jMin > cMax)
    ) {
      score += WEIGHTS.salaryMiss;
    }
  }

  if (pref?.isOpenToRemote && remoteJob) {
    score += WEIGHTS.remote;
  }

  if (skillSet.size > 0) {
    let m = 0;
    for (const js of job.jobSkills) {
      if (skillSet.has(js.skillId)) m += 1;
    }
    score += Math.min(WEIGHTS.skillCap, WEIGHTS.skillPerMatch * m);
    if (m === 0) score += WEIGHTS.skillMiss;
  }

  if (categorySet.size > 0 && categorySet.has(job.categoryId)) {
    score += WEIGHTS.category;
  } else if (categorySet.size > 0) {
    score += WEIGHTS.categoryMiss;
  }

  const ageDays = Math.max(
    0,
    Math.floor((now.getTime() - job.createdAt.getTime()) / 86_400_000),
  );
  const freshness = Math.max(
    0,
    (WEIGHTS.recencyMaxDays - ageDays) / WEIGHTS.recencyMaxDays,
  );
  score += freshness * WEIGHTS.recencyBonus;

  if (job.isFeatured) score += WEIGHTS.featured;
  return score;
}

function buildMatchReasons(
  job: Prisma.JobGetPayload<{ include: typeof jobListInclude }>,
  ctx: RecommendationContext,
): string[] {
  const reasons: string[] = [];
  const remoteJob = isRemoteJob(job);
  const company = job.company;

  if (ctx.prefDistrictId != null && company.districtId === ctx.prefDistrictId) {
    reasons.push("Đúng quận/huyện");
  } else if (
    ctx.prefProvinceId != null &&
    company.provinceId === ctx.prefProvinceId
  ) {
    reasons.push("Đúng tỉnh/thành");
  } else if (ctx.pref?.isOpenToRemote && remoteJob) {
    reasons.push("Làm từ xa");
  }

  if (ctx.categorySet.size > 0 && ctx.categorySet.has(job.categoryId)) {
    const name = job.category?.name?.trim();
    if (name) reasons.push(name);
  }

  if (ctx.skillSet.size > 0) {
    let matched = 0;
    for (const js of job.jobSkills) {
      if (ctx.skillSet.has(js.skillId)) matched += 1;
    }
    if (matched > 0) reasons.push(`${matched} kỹ năng khớp`);
  }

  if (
    ctx.pref?.experienceLevel != null &&
    String(job.experienceLevel) === String(ctx.pref.experienceLevel)
  ) {
    reasons.push("Đúng kinh nghiệm");
  }

  if (reasons.length === 0) reasons.push("Tin đang tuyển");
  return reasons.slice(0, 3);
}

function extractCvSkillNames(content: Prisma.JsonValue): string[] {
  if (!content || typeof content !== "object" || Array.isArray(content)) {
    return [];
  }
  const skills = (content as { skills?: unknown }).skills;
  if (!Array.isArray(skills)) return [];
  const names: string[] = [];
  for (const item of skills) {
    if (typeof item === "string") {
      const name = item.trim();
      if (name) names.push(name);
    } else if (item && typeof item === "object" && !Array.isArray(item)) {
      const name = (item as { name?: unknown }).name;
      if (typeof name === "string" && name.trim()) names.push(name.trim());
    }
    if (names.length >= 40) break;
  }
  return names;
}

async function skillIdsFromLatestCv(userId: number): Promise<number[]> {
  const cv = await prisma.cv.findFirst({
    where: { userId, deletedAt: null },
    orderBy: { updatedAt: "desc" },
    select: { content: true },
  });
  const names = extractCvSkillNames(cv?.content ?? null);
  if (!names.length) return [];
  const rows = await prisma.skill.findMany({
    where: { name: { in: names } },
    select: { id: true },
  });
  return rows.map((row) => row.id);
}

async function resolveRecommendationSkillIds(
  userId: number,
  preferenceSkillIds: number[],
): Promise<number[]> {
  if (preferenceSkillIds.length > 0) return preferenceSkillIds;
  return skillIdsFromLatestCv(userId);
}

function applyAiRank(
  rows: JobWithScore[],
  rankedIds: number[],
  headSize: number,
): JobWithScore[] {
  const head = rows.slice(0, headSize);
  const tail = rows.slice(headSize);
  const byId = new Map(head.map((job) => [job.id, job]));
  const used = new Set<number>();
  const reordered: JobWithScore[] = [];
  for (const id of rankedIds) {
    const job = byId.get(id);
    if (!job || used.has(id)) continue;
    used.add(id);
    reordered.push(job);
  }
  for (const job of head) {
    if (!used.has(job.id)) reordered.push(job);
  }
  return [...reordered, ...tail];
}

function diversifyByCompanyAndCategory(rows: JobWithScore[]): JobWithScore[] {
  const pending = [...rows].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return b.id - a.id;
  });
  const result: JobWithScore[] = [];
  const companyUsed = new Map<number, number>();
  const categoryUsed = new Map<number, number>();

  while (pending.length > 0) {
    let bestIdx = 0;
    let bestValue = -Infinity;

    for (let i = 0; i < pending.length; i += 1) {
      const item = pending[i];
      if (!item) continue;
      const companyCount = companyUsed.get(item.companyId) ?? 0;
      const categoryCount = categoryUsed.get(item.categoryId) ?? 0;
      const diversifiedScore =
        item.score +
        companyCount * WEIGHTS.duplicateCompanyPenalty +
        categoryCount * WEIGHTS.duplicateCategoryPenalty;
      if (diversifiedScore > bestValue) {
        bestValue = diversifiedScore;
        bestIdx = i;
      }
    }

    const [picked] = pending.splice(bestIdx, 1);
    if (!picked) break;
    result.push(picked);
    companyUsed.set(picked.companyId, (companyUsed.get(picked.companyId) ?? 0) + 1);
    categoryUsed.set(
      picked.categoryId,
      (categoryUsed.get(picked.categoryId) ?? 0) + 1,
    );
  }

  return result;
}

function buildSoftPreferenceOr(
  pref: Prisma.CandidatePreferenceGetPayload<Record<string, never>> | null,
  prefSkillIds: number[],
  prefCategoryIds: number[],
): Prisma.JobWhereInput[] {
  const prefOr: Prisma.JobWhereInput[] = [];
  if (pref?.preferredDistrictId != null) {
    prefOr.push({ company: { districtId: pref.preferredDistrictId } });
  } else if (pref?.preferredProvinceId != null) {
    prefOr.push({ company: { provinceId: pref.preferredProvinceId } });
  }
  if (pref?.jobType != null) {
    prefOr.push({ jobType: pref.jobType });
  }
  if (pref?.experienceLevel != null) {
    prefOr.push({ experienceLevel: pref.experienceLevel });
  }
  if (prefSkillIds.length) {
    prefOr.push({ jobSkills: { some: { skillId: { in: prefSkillIds } } } });
  }
  if (prefCategoryIds.length) {
    prefOr.push({ categoryId: { in: prefCategoryIds.slice(0, 200) } });
  }
  return prefOr;
}

function buildRankedCandidateWheres(
  baseWhere: Prisma.JobWhereInput,
  pref: Prisma.CandidatePreferenceGetPayload<Record<string, never>> | null,
  prefSkillIds: number[],
  prefCategoryIds: number[],
): Prisma.JobWhereInput[] {
  const categoryFilter: Prisma.JobWhereInput | null = prefCategoryIds.length
    ? { categoryId: { in: prefCategoryIds.slice(0, 200) } }
    : null;
  const jobTypeFilter: Prisma.JobWhereInput | null =
    pref?.jobType != null ? { jobType: pref.jobType } : null;
  const districtFilter: Prisma.JobWhereInput | null =
    pref?.preferredDistrictId != null
      ? { company: { districtId: pref.preferredDistrictId } }
      : null;
  const provinceFilter: Prisma.JobWhereInput | null =
    pref?.preferredProvinceId != null
      ? { company: { provinceId: pref.preferredProvinceId } }
      : null;
  const expFilter: Prisma.JobWhereInput | null =
    pref?.experienceLevel != null ? { experienceLevel: pref.experienceLevel } : null;

  const tiers: Prisma.JobWhereInput[] = [];
  const withBase = (...conds: Array<Prisma.JobWhereInput | null>) => ({
    AND: [baseWhere, ...conds.filter((c): c is Prisma.JobWhereInput => c != null)],
  });

  // Tier 1: strictest - honor selected categories/job type/location/experience.
  tiers.push(withBase(categoryFilter, jobTypeFilter, districtFilter, expFilter));
  // Tier 2: relax district to province.
  if (districtFilter && provinceFilter) {
    tiers.push(withBase(categoryFilter, jobTypeFilter, provinceFilter, expFilter));
  }
  // Tier 3: still strict on category + job type, ignore exact location.
  tiers.push(withBase(categoryFilter, jobTypeFilter, expFilter));
  // Tier 4: keep category + job type, relax experience.
  tiers.push(withBase(categoryFilter, jobTypeFilter));
  // Tier 5: if needed, use soft preference matching but still keep hard category/job type.
  const prefOr = buildSoftPreferenceOr(pref, prefSkillIds, prefCategoryIds);
  if (prefOr.length > 0) {
    tiers.push(withBase(categoryFilter, jobTypeFilter, { OR: prefOr }));
  }
  // Tier 6: final fallback, but still do not break category/job type if user selected them.
  tiers.push(withBase(categoryFilter, jobTypeFilter));
  // Tier 7: absolute fallback only when user did not set category/job type.
  if (!categoryFilter && !jobTypeFilter) {
    tiers.push(baseWhere);
  }

  return tiers;
}

async function fetchRankedPoolRows(
  pool: number,
  whereTiers: Prisma.JobWhereInput[],
): Promise<Prisma.JobGetPayload<{ include: typeof jobListInclude }>[]> {
  const rows: Prisma.JobGetPayload<{ include: typeof jobListInclude }>[] = [];
  const seen = new Set<number>();

  for (const tierWhere of whereTiers) {
    if (rows.length >= pool) break;
    const missing = pool - rows.length;
    const where: Prisma.JobWhereInput =
      seen.size > 0
        ? { AND: [tierWhere, { id: { notIn: [...seen] } }] }
        : tierWhere;

    const chunk = await prisma.job.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: missing,
      include: jobListInclude,
    });

    for (const item of chunk) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      rows.push(item);
    }
  }

  return rows;
}

export const candidateRecommendationService = {
  async getRecommendationProfile(userId: number) {
    const candidate = await prisma.candidate.findUnique({
      where: { userId },
      include: {
        preference: {
          include: {
            preferredProvince: true,
            preferredDistrict: true,
          },
        },
        candidateSkills: { select: { skillId: true } },
        candidateCategories: { select: { categoryId: true } },
      },
    });

    if (!candidate) {
      throw new HttpException(
        "Chỉ ứng viên mới dùng được",
        403,
        "RECOMMENDATION_CANDIDATE_ONLY",
      );
    }

    return {
      preference: candidate.preference,
      skillIds: candidate.candidateSkills.map((r) => r.skillId),
      categoryIds: candidate.candidateCategories.map((r) => r.categoryId),
    };
  },

  async putRecommendationProfile(
    userId: number,
    body: RecommendationProfilePutBody,
  ) {
    const candidate = await prisma.candidate.findUnique({
      where: { userId },
    });

    if (!candidate) {
      throw new HttpException(
        "Chỉ ứng viên mới dùng được",
        403,
        "RECOMMENDATION_CANDIDATE_ONLY",
      );
    }

    const existing = await prisma.candidatePreference.findUnique({
      where: { candidateId: candidate.id },
    });

    const merged = {
      desiredMinSalary:
        body.desiredMinSalary !== undefined
          ? body.desiredMinSalary
          : (existing?.desiredMinSalary ?? null),
      desiredMaxSalary:
        body.desiredMaxSalary !== undefined
          ? body.desiredMaxSalary
          : (existing?.desiredMaxSalary ?? null),
      jobType:
        body.jobType !== undefined ? body.jobType : (existing?.jobType ?? null),
      experienceLevel:
        body.experienceLevel !== undefined
          ? body.experienceLevel
          : (existing?.experienceLevel ?? null),
      preferredProvinceId:
        body.preferredProvinceId !== undefined
          ? body.preferredProvinceId
          : (existing?.preferredProvinceId ?? null),
      preferredDistrictId:
        body.preferredDistrictId !== undefined
          ? body.preferredDistrictId
          : (existing?.preferredDistrictId ?? null),
      isOpenToRemote:
        body.isOpenToRemote !== undefined
          ? body.isOpenToRemote
          : (existing?.isOpenToRemote ?? false),
    };

    const min = merged.desiredMinSalary;
    const max = merged.desiredMaxSalary;
    if (
      min != null &&
      max != null &&
      typeof min === "number" &&
      typeof max === "number" &&
      min > max
    ) {
      throw new HttpException(
        "Mức lương tối thiểu không được lớn hơn tối đa",
        400,
        "RECOMMENDATION_SALARY_RANGE",
      );
    }

    if (
      merged.preferredDistrictId != null &&
      merged.preferredProvinceId == null
    ) {
      throw new HttpException(
        "Cần chọn tỉnh/thành khi chọn quận/huyện",
        400,
        "RECOMMENDATION_LOCATION",
      );
    }

    if (
      merged.preferredProvinceId != null &&
      merged.preferredDistrictId != null
    ) {
      await locationService.validateProvinceDistrict(
        merged.preferredProvinceId,
        merged.preferredDistrictId,
      );
    }

    const skillIds =
      body.skillIds !== undefined ? [...new Set(body.skillIds)] : undefined;
    const categoryIds =
      body.categoryIds !== undefined
        ? [...new Set(body.categoryIds)]
        : undefined;

    if (skillIds?.length) {
      const cnt = await prisma.skill.count({
        where: { id: { in: skillIds } },
      });
      if (cnt !== skillIds.length) {
        throw new HttpException(
          "Một số kỹ năng không tồn tại",
          400,
          "RECOMMENDATION_SKILL_INVALID",
        );
      }
    }

    if (categoryIds?.length) {
      const cnt = await prisma.category.count({
        where: { id: { in: categoryIds } },
      });
      if (cnt !== categoryIds.length) {
        throw new HttpException(
          "Một số danh mục không tồn tại",
          400,
          "RECOMMENDATION_CATEGORY_INVALID",
        );
      }
    }

    await prismaTransaction(async (tx) => {
      await tx.candidatePreference.upsert({
        where: { candidateId: candidate.id },
        create: {
          candidateId: candidate.id,
          desiredMinSalary: merged.desiredMinSalary,
          desiredMaxSalary: merged.desiredMaxSalary,
          jobType: merged.jobType,
          experienceLevel: merged.experienceLevel,
          preferredProvinceId: merged.preferredProvinceId,
          preferredDistrictId: merged.preferredDistrictId,
          isOpenToRemote: merged.isOpenToRemote,
        },
        update: {
          desiredMinSalary: merged.desiredMinSalary,
          desiredMaxSalary: merged.desiredMaxSalary,
          jobType: merged.jobType,
          experienceLevel: merged.experienceLevel,
          preferredProvinceId: merged.preferredProvinceId,
          preferredDistrictId: merged.preferredDistrictId,
          isOpenToRemote: merged.isOpenToRemote,
        },
      });

      if (skillIds !== undefined) {
        await tx.candidateSkill.deleteMany({
          where: { candidateId: candidate.id },
        });
        if (skillIds.length) {
          await tx.candidateSkill.createMany({
            data: skillIds.map((skillId) => ({
              candidateId: candidate.id,
              skillId,
            })),
            skipDuplicates: true,
          });
        }
      }

      if (categoryIds !== undefined) {
        await tx.candidateCategory.deleteMany({
          where: { candidateId: candidate.id },
        });
        if (categoryIds.length) {
          await tx.candidateCategory.createMany({
            data: categoryIds.map((categoryId) => ({
              candidateId: candidate.id,
              categoryId,
            })),
            skipDuplicates: true,
          });
        }
      }
    });

    await Promise.all([
      cacheDelRecommendedJobsForUser(userId),
      cacheDelAiCvSuggestForUser(userId),
    ]);

    return await candidateRecommendationService.getRecommendationProfile(
      userId,
    );
  },

  async getRecommendedJobs(
    userId: number,
    query: { page?: number; limit?: number },
  ): Promise<JobListPayload> {
    const candidate = await prisma.candidate.findUnique({
      where: { userId },
      include: {
        preference: true,
        candidateSkills: { select: { skillId: true } },
        candidateCategories: { select: { categoryId: true } },
      },
    });

    if (!candidate) {
      throw new HttpException(
        "Chỉ ứng viên mới dùng được",
        403,
        "RECOMMENDATION_CANDIDATE_ONLY",
      );
    }

    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(Math.max(1, Number(query.limit) || 12), 50);
    const pool = resolvePool(limit);
    const queryHash = stableCacheHash({ page, limit });
    const cacheKey = CacheKeys.jobsRecommended(userId, queryHash);

    if (env.CACHE_ENABLED) {
      const hit = await cacheGetJson<JobListPayload>(cacheKey);
      if (hit) return hit;
    }

    const appliedRows = await prisma.application.findMany({
      where: { candidateId: candidate.id },
      select: { jobId: true },
    });
    const appliedIds = appliedRows.map((a) => a.jobId);

    const now = new Date();

    const where: Prisma.JobWhereInput = {
      moderationStatus: JobModerationStatus.APPROVED,
      OR: [{ deadline: null }, { deadline: { gte: now } }],
      company: { status: true },
      ...(appliedIds.length ? { id: { notIn: appliedIds } } : {}),
    };

    const pref = candidate.preference;
    const prefSkillIds = await resolveRecommendationSkillIds(
      userId,
      candidate.candidateSkills.map((r) => Number(r.skillId)),
    );
    const prefCategoryIds: number[] = candidate.candidateCategories.map((r) =>
      Number(r.categoryId),
    );
    const prefProvinceId = pref?.preferredProvinceId ?? null;
    const prefDistrictId = pref?.preferredDistrictId ?? null;

    const skillSet = new Set<number>(prefSkillIds);
    const categorySet = new Set<number>(prefCategoryIds);
    const scoreCtx: RecommendationContext = {
      pref,
      prefProvinceId,
      prefDistrictId,
      skillSet,
      categorySet,
      now,
    };

    const whereTiers = buildRankedCandidateWheres(
      where,
      pref,
      prefSkillIds,
      prefCategoryIds,
    );
    const rows = await fetchRankedPoolRows(pool, whereTiers);

    const scored: JobWithScore[] = rows.map((job) => ({
      ...job,
      score: computeRecommendationScore(job, scoreCtx),
    }));

    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return b.id - a.id;
    });

    let diversified = diversifyByCompanyAndCategory(scored);

    if (page === 1 && prefCategoryIds.length + prefSkillIds.length > 0) {
      try {
        const [prefSkills, prefCats] = await Promise.all([
          prefSkillIds.length
            ? prisma.skill.findMany({
                where: { id: { in: prefSkillIds } },
                select: { name: true },
              })
            : Promise.resolve([] as Array<{ name: string }>),
          prefCategoryIds.length
            ? prisma.category.findMany({
                where: { id: { in: prefCategoryIds } },
                select: { name: true },
              })
            : Promise.resolve([] as Array<{ name: string }>),
        ]);

        const head = diversified.slice(0, 24);
        const rerankJobs = head.map((j) => ({
          id: j.id,
          title: j.title,
          category: j.category?.name ?? "",
          location:
            (j.workLocation && j.workLocation.trim()) ||
            j.company.province?.name ||
            "",
          minSalary: j.minSalary ?? null,
          maxSalary: j.maxSalary ?? null,
          jobType: String(j.jobType),
          experienceLevel: String(j.experienceLevel),
          skills: j.jobSkills.map((x) => x.skill?.name ?? "").filter(Boolean).slice(0, 15),
          isFeatured: Boolean(j.isFeatured),
        }));

        const rankedIds = await aiService.rerankRecommendedJobsFromPreferences(
          userId,
          {
            candidate: {
              desiredMinSalary: pref?.desiredMinSalary ?? null,
              desiredMaxSalary: pref?.desiredMaxSalary ?? null,
              jobType: pref?.jobType != null ? String(pref.jobType) : null,
              experienceLevel:
                pref?.experienceLevel != null ? String(pref.experienceLevel) : null,
              preferredProvinceId: prefProvinceId,
              preferredDistrictId: prefDistrictId,
              isOpenToRemote: pref?.isOpenToRemote ?? false,
              skills: prefSkills.map((s) => s.name).filter(Boolean).slice(0, 50),
              categories: prefCats.map((c) => c.name).filter(Boolean).slice(0, 50),
            },
            jobs: rerankJobs,
          },
        );

        if (rankedIds.length) {
          diversified = applyAiRank(diversified, rankedIds, head.length);
        }
      } catch (e) {
        void e;
      }
    }

    const total = diversified.length;
    const totalPages = Math.ceil(total / limit) || 1;
    const skip = (page - 1) * limit;
    const jobs = diversified.slice(skip, skip + limit).map((row) => {
      const copy = { ...row } as JobWithScore & { matchReasons?: string[] };
      delete (copy as { score?: number }).score;
      copy.matchReasons = buildMatchReasons(row, scoreCtx);
      return copy as Omit<JobWithScore, "score"> & { matchReasons: string[] };
    });

    const payload: JobListPayload = {
      jobs,
      pagination: {
        total,
        page,
        limit,
        totalPages,
      },
      JOB_TYPE_OPTIONS,
      EXPERIENCE_OPTIONS,
      SalaryRange,
      SalaryRangeOptions,
      JOB_MODERATION_OPTIONS,
    };

    if (env.CACHE_ENABLED) {
      await cacheSetJson(cacheKey, payload, env.CACHE_TTL_JOBS_RECOMMENDED_SEC);
    }

    return payload;
  },

  async getTopRecommendedJobsForDigest(
    userId: number,
    take: number,
  ): Promise<
    Array<{
      id: number;
      slug: string;
      title: string;
      companyName: string;
      minSalary: number | null;
      maxSalary: number | null;
      isFeatured: boolean;
      categoryName: string;
      locationLabel: string;
      jobType: string;
    }>
  > {
    const candidate = await prisma.candidate.findUnique({
      where: { userId },
      include: {
        preference: true,
        candidateSkills: { select: { skillId: true } },
        candidateCategories: { select: { categoryId: true } },
      },
    });

    if (!candidate) {
      return [];
    }

    const limit = Math.min(Math.max(1, take), 50);
    const pool = resolvePool(limit);

    const appliedRows = await prisma.application.findMany({
      where: { candidateId: candidate.id },
      select: { jobId: true },
    });
    const appliedIds = appliedRows.map((a) => a.jobId);

    const now = new Date();

    const where: Prisma.JobWhereInput = {
      moderationStatus: JobModerationStatus.APPROVED,
      OR: [{ deadline: null }, { deadline: { gte: now } }],
      company: { status: true },
      ...(appliedIds.length ? { id: { notIn: appliedIds } } : {}),
    };

    const pref = candidate.preference;
    const prefSkillIds = await resolveRecommendationSkillIds(
      userId,
      candidate.candidateSkills.map((r) => Number(r.skillId)),
    );
    const prefCategoryIds: number[] = candidate.candidateCategories.map((r) =>
      Number(r.categoryId),
    );
    const prefProvinceId = pref?.preferredProvinceId ?? null;
    const prefDistrictId = pref?.preferredDistrictId ?? null;

    const skillSet = new Set<number>(prefSkillIds);
    const categorySet = new Set<number>(prefCategoryIds);

    const whereTiers = buildRankedCandidateWheres(
      where,
      pref,
      prefSkillIds,
      prefCategoryIds,
    );
    const rows = await fetchRankedPoolRows(pool, whereTiers);

    const scored: JobWithScore[] = rows.map((job) => ({
      ...job,
      score: computeRecommendationScore(job, {
        pref,
        prefProvinceId,
        prefDistrictId,
        skillSet,
        categorySet,
        now,
      }),
    }));

    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return b.id - a.id;
    });

    const diversified = diversifyByCompanyAndCategory(scored);
    return diversified.slice(0, limit).map((job) => {
      const loc =
        (job.workLocation && job.workLocation.trim()) ||
        job.company.province?.name ||
        "—";
      return {
        id: job.id,
        slug: job.slug,
        title: job.title,
        companyName: job.company.name,
        minSalary: job.minSalary,
        maxSalary: job.maxSalary,
        isFeatured: job.isFeatured,
        categoryName: job.category?.name ?? "",
        locationLabel: loc,
        jobType: job.jobType,
      };
    });
  },
};
