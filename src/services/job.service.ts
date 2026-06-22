import { prisma, prismaTransaction } from "../utils/prisma";
import { HttpException } from "../utils/exception";
import { env } from "../config/env";
import {
  CacheKeys,
  cacheDel,
  cacheGetJson,
  cacheGetOrSetJsonWithLock,
  cacheSetJson,
  fingerprintJobsPublicQuery,
  getPublicSurfaceVersion,
  invalidateAdminDashboard,
  invalidateJobCaches,
  isPublicJobFeaturedFilterActive,
} from "../utils/cache";
import { getOpenSearchClient, isOpenSearchEnabled } from "../utils/opensearch";
import { logger } from "../utils/logger";
import {
  enqueueDeleteJobIndex,
  enqueueUpsertJobIndex,
} from "../search/jobs.indexer";
import type { Search_Request } from "@opensearch-project/opensearch/api/_core/search";
import {
  normalizeForSearch,
  parseJobSearchIntent,
} from "../search/search_intent";
import {
  EXPERIENCE_OPTIONS,
  JOB_MODERATION_OPTIONS,
  JOB_TYPE_OPTIONS,
  JobDTO,
  SalaryRange,
  SalaryRangeOptions,
  SalaryRangeType,
} from "../types/job.type";
import {
  ExperienceLevel,
  JobModerationStatus,
  JobType,
  Prisma,
} from "../generated/prisma/client";
import { buildSalaryFilter, toNumberArray } from "../utils/helper";
import {
  NotificationType,
  notificationService,
  resolveEmployerUserIdsForJob,
} from "./notification.service";

export type JobListMode = "public" | "admin";

export type JobListQuery = {
  page?: number;
  limit?: number;
  search?: string;
  companyId?: number;
  provinceId?: number;
  districtId?: number | string;
  districtIds?: number[];
  parentCategoryId?: number;
  categoryId?: number;
  categoryIds?: number[];
  jobType?: string;
  experienceLevel?: string;
  salaryRange?: SalaryRangeType;
  fromDate?: string;
  toDate?: string;
  moderationStatus?: string;
  lifecycle?: string;
  isFeatured?: string;
};

function buildBaseWhere(query: JobListQuery): Prisma.JobWhereInput {
  const searchTerm =
    query.search != null && String(query.search).trim() !== ""
      ? String(query.search).trim()
      : "";
  const hasSearch = Boolean(searchTerm);
  return {
    deletedAt: null,
    ...(hasSearch && {
      OR: [
        { title: { contains: searchTerm } },
        { description: { contains: searchTerm } },
        { workLocation: { contains: searchTerm } },
        { company: { name: { contains: searchTerm } } },
        { company: { province: { name: { contains: searchTerm } } } },
        { company: { district: { name: { contains: searchTerm } } } },
        { category: { name: { contains: searchTerm } } },
        {
          jobSkills: {
            some: { skill: { name: { contains: searchTerm } } },
          },
        },
      ],
    }),

    ...(query.companyId && {
      companyId: Number(query.companyId),
    }),

    ...(query.categoryId && {
      categoryId: Number(query.categoryId),
    }),

    ...(query.jobType && { jobType: query.jobType as JobType }),

    ...(query.experienceLevel && {
      experienceLevel: query.experienceLevel as ExperienceLevel,
    }),

    ...((query.provinceId || query.districtIds?.length || query.districtId) && {
      company: {
        ...(query.provinceId && {
          provinceId: Number(query.provinceId),
        }),

        ...(query.districtIds?.length && {
          districtId: {
            in: query.districtIds.map(Number),
          },
        }),

        ...(!query.districtIds?.length &&
          query.districtId && {
            districtId: Number(query.districtId),
          }),
      },
    }),

    ...buildSalaryFilter(query.salaryRange),

    ...((query.fromDate || query.toDate) && {
      createdAt: {
        ...(query.fromDate && { gte: new Date(query.fromDate) }),
        ...(query.toDate && { lte: new Date(query.toDate) }),
      },
    }),
  };
}

function normalizeDeadline(
  value: Date | string | null | undefined,
): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return value instanceof Date ? value : new Date(value);
}

function buildSalaryFilterOpenSearch(range?: SalaryRangeType): unknown | null {
  if (!range) return null;
  switch (range) {
    case SalaryRange.UNDER_10:
      return { range: { maxSalary: { lt: 10000000 } } };
    case SalaryRange.FROM_10_15:
      return {
        bool: {
          must: [
            { range: { minSalary: { gte: 10000000 } } },
            { range: { maxSalary: { lte: 15000000 } } },
          ],
        },
      };
    case SalaryRange.FROM_15_20:
      return {
        bool: {
          must: [
            { range: { minSalary: { gte: 15000000 } } },
            { range: { maxSalary: { lte: 20000000 } } },
          ],
        },
      };
    case SalaryRange.FROM_20_25:
      return {
        bool: {
          must: [
            { range: { minSalary: { gte: 20000000 } } },
            { range: { maxSalary: { lte: 25000000 } } },
          ],
        },
      };
    case SalaryRange.FROM_25_30:
      return {
        bool: {
          must: [
            { range: { minSalary: { gte: 25000000 } } },
            { range: { maxSalary: { lte: 30000000 } } },
          ],
        },
      };
    case SalaryRange.FROM_30_50:
      return {
        bool: {
          must: [
            { range: { minSalary: { gte: 30000000 } } },
            { range: { maxSalary: { lte: 50000000 } } },
          ],
        },
      };
    case SalaryRange.OVER_50:
      return { range: { minSalary: { gt: 50000000 } } };
    case SalaryRange.NEGOTIABLE:
      return {
        bool: {
          should: [
            { bool: { must_not: { exists: { field: "minSalary" } } } },
            { bool: { must_not: { exists: { field: "maxSalary" } } } },
          ],
          minimum_should_match: 1,
        },
      };
    default:
      return null;
  }
}

async function searchPublicJobsOpenSearch(args: {
  query: JobListQuery;
  skip: number;
  limit: number;
  expandedCategoryIds?: number[];
}): Promise<{ ids: number[]; total: number } | null> {
  if (!isOpenSearchEnabled()) return null;
  const client = getOpenSearchClient();
  if (!client) return null;

  const searchTerm =
    args.query.search != null && String(args.query.search).trim() !== ""
      ? String(args.query.search).trim()
      : "";
  const intent = await parseJobSearchIntent(searchTerm);
  const effectiveSearchTerm = intent.cleanedQuery;
  const nowIso = new Date().toISOString();

  const filters: unknown[] = [
    { term: { moderationStatus: JobModerationStatus.APPROVED } },
    { term: { companyStatus: true } },
    {
      bool: {
        should: [
          { bool: { must_not: { exists: { field: "deadline" } } } },
          { range: { deadline: { gte: nowIso } } },
        ],
        minimum_should_match: 1,
      },
    },
  ];

  if (args.expandedCategoryIds?.length) {
    filters.push({ terms: { categoryId: args.expandedCategoryIds } });
  }

  if (args.query.companyId) {
    filters.push({ term: { companyId: Number(args.query.companyId) } });
  }

  if (args.query.jobType) {
    filters.push({ term: { jobType: args.query.jobType } });
  }

  if (args.query.experienceLevel) {
    filters.push({ term: { experienceLevel: args.query.experienceLevel } });
  }

  if (args.query.provinceId) {
    filters.push({ term: { provinceId: Number(args.query.provinceId) } });
  } else if (intent.provinceId) {
    filters.push({ term: { provinceId: intent.provinceId } });
  }

  if (args.query.districtIds?.length) {
    filters.push({ terms: { districtId: args.query.districtIds.map(Number) } });
  } else if (args.query.districtId) {
    filters.push({ term: { districtId: Number(args.query.districtId) } });
  }

  const salary = buildSalaryFilterOpenSearch(args.query.salaryRange);
  if (salary) filters.push(salary);

  if (isPublicJobFeaturedFilterActive(args.query.isFeatured)) {
    filters.push({ term: { isFeatured: true } });
  }

  if (intent.workMode) {
    filters.push({ term: { workMode: intent.workMode } });
  }

  const hasSearch = effectiveSearchTerm.length > 0;
  const allowFuzzy =
    effectiveSearchTerm.replace(/\s+/g, " ").trim().length >= 4;

  const textQuery: unknown = hasSearch
    ? {
        bool: {
          should: [
            {
              multi_match: {
                query: effectiveSearchTerm,
                type: "best_fields",
                fields: [
                  "title^6",
                  "title.ac^4",
                  "skillNames^5",
                  "companyName^4",
                  "companyName.ac^3",
                  "categoryName^2",
                  "provinceName^1",
                  "districtName^1",
                  "workLocation^1",
                  "workLocation.ac^1",
                  "description^0.5",
                ],
                ...(allowFuzzy ? { fuzziness: "AUTO" } : {}),
              },
            },
          ],
          minimum_should_match: 1,
        },
      }
    : { match_all: {} };

  const query: unknown = {
    function_score: {
      query: {
        bool: {
          must: [textQuery],
          filter: filters,
        },
      },
      score_mode: "sum",
      boost_mode: "sum",
      functions: [
        { filter: { term: { isFeatured: true } }, weight: 1.5 },
        {
          gauss: {
            createdAt: {
              origin: nowIso,
              scale: "14d",
              offset: "2d",
              decay: 0.6,
            },
          },
          weight: 1,
        },
        {
          field_value_factor: {
            field: "viewCount",
            modifier: "log1p",
            missing: 0,
          },
          weight: 0.15,
        },
      ],
    },
  };

  try {
    type OpenSearchTotal = number | { value?: number };
    type OpenSearchHit = { _id?: string };
    type OpenSearchSearchBody = {
      hits?: { hits?: OpenSearchHit[]; total?: OpenSearchTotal };
    };

    const resp = (await client.search({
      index: env.OPENSEARCH_JOBS_INDEX,
      body: {
        from: args.skip,
        size: args.limit,
        track_total_hits: true,
        _source: false,
        query,
        sort: [{ _score: "desc" }, { createdAt: "desc" }],
      },
    } as unknown as Search_Request)) as unknown as {
      body?: OpenSearchSearchBody;
    };

    const hits = resp.body?.hits?.hits ?? [];
    const totalRaw = resp.body?.hits?.total;
    const total =
      typeof totalRaw === "number"
        ? totalRaw
        : typeof totalRaw?.value === "number"
          ? totalRaw.value
          : 0;

    const ids = hits
      .map((h) => Number(h._id))
      .filter((n: number) => Number.isFinite(n) && n > 0)
      .map((n: number) => Math.trunc(n));

    return { ids, total };
  } catch (err) {
    logger.error("OpenSearch search failed, falling back to Prisma", {
      error: err,
    });
    return null;
  }
}

async function fetchJobsList(query: JobListQuery, mode: JobListMode) {
  const page = Number(query.page) || 1;
  const limit = Number(query.limit) || 12;
  const skip = (page - 1) * limit;

  const base = buildBaseWhere(query);
  const selectedCategoryIds = new Set<number>(
    [
      ...(Array.isArray(query.categoryIds) ? query.categoryIds : []),
      ...(query.categoryId ? [Number(query.categoryId)] : []),
    ]
      .map((x) => Number(x))
      .filter((n) => Number.isFinite(n) && n > 0)
      .map((n) => Math.trunc(n)),
  );

  const parentCategoryId = Number(query.parentCategoryId);
  if (Number.isFinite(parentCategoryId) && parentCategoryId > 0) {
    const children = await prisma.category.findMany({
      where: { parentCategoryId: Math.trunc(parentCategoryId), deletedAt: null },
      select: { id: true },
    });
    for (const child of children) {
      selectedCategoryIds.add(child.id);
    }
  }

  let expandedCategoryIds: number[] | undefined = undefined;
  if (selectedCategoryIds.size) {
    const ids = [...selectedCategoryIds];
    expandedCategoryIds = ids;
    (base as Prisma.JobWhereInput).categoryId = { in: ids };
  }
  const now = new Date();
  const filters: Prisma.JobWhereInput[] = [base];

  if (mode === "public") {
    filters.push({ moderationStatus: JobModerationStatus.APPROVED });
    filters.push({
      OR: [{ deadline: null }, { deadline: { gte: now } }],
    });
    filters.push({ company: { status: true, deletedAt: null } });
    filters.push({ category: { deletedAt: null } });
    if (isPublicJobFeaturedFilterActive(query.isFeatured)) {
      filters.push({ isFeatured: true });
    }
  } else {
    if (
      query.moderationStatus &&
      Object.values(JobModerationStatus).includes(
        query.moderationStatus as JobModerationStatus,
      )
    ) {
      filters.push({
        moderationStatus: query.moderationStatus as JobModerationStatus,
      });
    }
    if (query.lifecycle === "active") {
      filters.push({ moderationStatus: JobModerationStatus.APPROVED });
      filters.push({
        OR: [{ deadline: null }, { deadline: { gte: now } }],
      });
    }
    if (query.lifecycle === "expired") {
      filters.push({
        deadline: { lt: now },
      });
    }
    if (isPublicJobFeaturedFilterActive(query.isFeatured)) {
      filters.push({ isFeatured: true });
    }
  }

  const where: Prisma.JobWhereInput =
    filters.length === 1 ? filters[0]! : { AND: filters };

  if (mode === "public") {
    const r = await searchPublicJobsOpenSearch(
      expandedCategoryIds?.length
        ? { query, skip, limit, expandedCategoryIds }
        : { query, skip, limit },
    );
    if (r) {
      const ids = r.ids;
      if (!ids.length) {
        return {
          jobs: [],
          pagination: {
            total: r.total,
            page,
            limit,
            totalPages: Math.ceil(r.total / limit),
          },
          JOB_TYPE_OPTIONS,
          EXPERIENCE_OPTIONS,
          SalaryRange,
          SalaryRangeOptions,
          JOB_MODERATION_OPTIONS,
        };
      }

      const dbJobs = await prisma.job.findMany({
        where: {
          id: { in: ids },
          deletedAt: null,
          moderationStatus: JobModerationStatus.APPROVED,
          company: { status: true, deletedAt: null },
          category: { deletedAt: null },
          OR: [{ deadline: null }, { deadline: { gte: now } }],
        },
        include: {
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
        },
      });

      const byId = new Map(dbJobs.map((j) => [j.id, j]));
      const jobs = ids
        .map((id) => byId.get(id))
        .filter(Boolean) as typeof dbJobs;

      return {
        jobs,
        pagination: {
          total: r.total,
          page,
          limit,
          totalPages: Math.ceil(r.total / limit),
        },
        JOB_TYPE_OPTIONS,
        EXPERIENCE_OPTIONS,
        SalaryRange,
        SalaryRangeOptions,
        JOB_MODERATION_OPTIONS,
      };
    }
  }

  const [jobs, total] = await Promise.all([
    prisma.job.findMany({
      where,
      skip,
      take: limit,
      orderBy: { id: "desc" },
      include: {
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
      },
    }),
    prisma.job.count({ where }),
  ]);

  return {
    jobs,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
    JOB_TYPE_OPTIONS,
    EXPERIENCE_OPTIONS,
    SalaryRange,
    SalaryRangeOptions,
    JOB_MODERATION_OPTIONS,
  };
}

export type JobListPayload = Awaited<ReturnType<typeof fetchJobsList>>;

type JobListVariableCache = Pick<JobListPayload, "jobs" | "pagination">;

type JobListConstantsCache = Pick<
  JobListPayload,
  | "JOB_TYPE_OPTIONS"
  | "EXPERIENCE_OPTIONS"
  | "SalaryRange"
  | "SalaryRangeOptions"
  | "JOB_MODERATION_OPTIONS"
>;

function getJobListConstantsPayload(): JobListConstantsCache {
  return {
    JOB_TYPE_OPTIONS,
    EXPERIENCE_OPTIONS,
    SalaryRange,
    SalaryRangeOptions,
    JOB_MODERATION_OPTIONS,
  };
}

function isLegacyFullJobListCache(hit: unknown): hit is JobListPayload {
  return (
    typeof hit === "object" &&
    hit !== null &&
    "JOB_TYPE_OPTIONS" in hit &&
    "jobs" in hit &&
    "pagination" in hit
  );
}

export const jobService = {
  async createJob(data: JobDTO) {
    const company = await prisma.company.findUnique({
      where: { id: data.companyId },
    });

    if (!company) {
      throw new HttpException("Công ty không tồn tại", 400);
    }

    const category = await prisma.category.findUnique({
      where: { id: data.categoryId },
      select: { id: true, parentCategoryId: true },
    });
    if (!category) {
      throw new HttpException("Danh mục không tồn tại", 400);
    }
    const activeCategory = await prisma.category.findFirst({
      where: { id: data.categoryId, deletedAt: null },
      select: { id: true },
    });
    if (!activeCategory) {
      throw new HttpException("Danh mục không tồn tại", 400);
    }
    const companyCategory = await prisma.companyCategory.findFirst({
      where: {
        companyId: data.companyId,
        parentCategoryId: category.parentCategoryId,
      },
      select: { companyId: true },
    });
    if (!companyCategory) {
      throw new HttpException("Danh mục không thuộc công ty này", 400);
    }

    if (data.employerId) {
      const employer = await prisma.employer.findUnique({
        where: { id: data.employerId },
      });

      if (!employer) {
        throw new HttpException("Nhà tuyển dụng không tồn tại", 400);
      }

      if (employer.companyId !== data.companyId) {
        throw new HttpException("Nhà tuyển dụng không thuộc công ty này", 400);
      }
    }

    const { skillIds, deadline, ...rest } = data;

    const result = await prismaTransaction(async (tx) => {
      const job = await tx.job.create({
        data: {
          ...rest,
          deadline: normalizeDeadline(deadline) ?? null,
        },
      });

      if (skillIds?.length) {
        const skills = await tx.skill.findMany({
          where: { id: { in: skillIds } },
          select: { id: true },
        });
        const valid = skills.map((s) => s.id);
        if (valid.length) {
          await tx.jobSkill.createMany({
            data: valid.map((skillId) => ({ jobId: job.id, skillId })),
            skipDuplicates: true,
          });
        }
      }

      return tx.job.findUnique({
        where: { id: job.id },
        include: {
          company: {
            include: { province: true, district: true },
          },
          employer: { include: { user: true } },
          category: true,
          jobSkills: { include: { skill: true } },
          _count: { select: { applications: true } },
        },
      });
    });
    await Promise.all([
      invalidateJobCaches({
        jobId: result!.id,
        companyId: result!.companyId,
      }),
      invalidateAdminDashboard(),
    ]);
    await enqueueUpsertJobIndex(result!.id);

    if (
      result &&
      result.moderationStatus === JobModerationStatus.APPROVED &&
      result.company
    ) {
      await notificationService.notifyCompanyFollowersOfApprovedJob({
        jobId: result.id,
        companyId: result.companyId,
        jobTitle: result.title,
        companyName: result.company.name,
      });
    }

    return result;
  },

  async getJobs(query: JobListQuery, mode: JobListMode = "public") {
    const districtIds = toNumberArray(
      (query as unknown as Record<string, unknown>).districtIds,
    );
    const categoryIds = toNumberArray(
      (query as unknown as Record<string, unknown>).categoryIds,
    );
    const normalizedQuery: JobListQuery = {
      ...query,
      ...(districtIds !== undefined && { districtIds }),
      ...(categoryIds !== undefined && { categoryIds }),
      ...(query.parentCategoryId !== undefined &&
        query.parentCategoryId !== null &&
        String(query.parentCategoryId).trim() !== "" && {
          parentCategoryId: Number(query.parentCategoryId),
        }),
    };

    const publicFp =
      mode === "public" ? fingerprintJobsPublicQuery(normalizedQuery) : null;
    const surfaceVer =
      mode === "public" && env.CACHE_ENABLED && publicFp != null
        ? await getPublicSurfaceVersion()
        : null;
    if (
      mode === "public" &&
      env.CACHE_ENABLED &&
      publicFp != null &&
      surfaceVer != null
    ) {
      const ck = CacheKeys.jobsPublic(surfaceVer, publicFp);
      const hit = await cacheGetOrSetJsonWithLock<
        JobListPayload | JobListVariableCache
      >(
        ck,
        env.CACHE_TTL_JOBS_PUBLIC_SEC,
        async () => {
          const payload = await fetchJobsList(normalizedQuery, mode);
          const variable: JobListVariableCache = {
            jobs: payload.jobs,
            pagination: payload.pagination,
          };
          return variable;
        },
        { lockTtlSec: 12, waitMs: 140, waitTries: 8 },
      );

      if (isLegacyFullJobListCache(hit)) {
        return hit;
      }
      return {
        ...hit,
        ...getJobListConstantsPayload(),
      };
    }

    return fetchJobsList(normalizedQuery, mode);
  },

  async suggestPublicJobs(raw: unknown) {
    const q = raw != null ? String(raw).trim() : "";
    type SuggestionKind = "job" | "company" | "category" | "skill";
    type Suggestion = { kind: SuggestionKind; text: string };
    if (q.length < 2) return { suggestions: [] as Suggestion[] };

    const intent = await parseJobSearchIntent(q);
    const effectiveQ = intent.cleanedQuery;
    const normNeedle = normalizeForSearch(q);
    const needle = (effectiveQ || q).trim();

    if (isOpenSearchEnabled()) {
      const client = getOpenSearchClient();
      if (client) {
        try {
          type OpenSearchHitSource = {
            title?: string;
            companyName?: string;
            categoryName?: string;
            skillNames?: string[];
          };
          type OpenSearchHit = { _source?: OpenSearchHitSource };
          type OpenSearchTotal = number | { value?: number };
          type OpenSearchSearchBody = {
            hits?: { hits?: OpenSearchHit[]; total?: OpenSearchTotal };
          };

          const isShort = needle.length < 3;
          const fields = isShort
            ? [
                "title.ac^6",
                "companyName.ac^4",
                "categoryName.ac^3",
                "skillNames.ac^3",
                "workLocation.ac^1",
              ]
            : [
                "title^6",
                "title.ac^4",
                "skillNames^5",
                "skillNames.ac^3",
                "companyName^4",
                "companyName.ac^3",
                "categoryName^2",
                "categoryName.ac^2",
              ];

          const resp = (await client.search({
            index: env.OPENSEARCH_JOBS_INDEX,
            body: {
              size: 20,
              track_total_hits: false,
              _source: ["title", "companyName", "categoryName", "skillNames"],
              query: {
                bool: {
                  filter: [
                    {
                      term: { moderationStatus: JobModerationStatus.APPROVED },
                    },
                    { term: { companyStatus: true } },
                  ],
                  must: [
                    isShort
                      ? {
                          multi_match: {
                            query: needle,
                            type: "bool_prefix",
                            fields,
                          },
                        }
                      : {
                          multi_match: {
                            query: needle,
                            type: "best_fields",
                            fields,
                            fuzziness: "AUTO",
                          },
                        },
                  ],
                },
              },
            },
          } as unknown as Search_Request)) as unknown as {
            body?: OpenSearchSearchBody;
          };

          const hits = resp.body?.hits?.hits ?? [];
          const out: Suggestion[] = [];
          const seen = new Set<string>();
          const push = (
            kind: SuggestionKind,
            text: string | undefined | null,
          ) => {
            const t = String(text ?? "").trim();
            if (!t) return;
            const norm = normalizeForSearch(t);
            if (!normNeedle || !norm.includes(normNeedle)) return;
            const key = `${kind}:${norm}`;
            if (seen.has(key)) return;
            seen.add(key);
            out.push({ kind, text: t });
          };

          for (const h of hits) {
            const src = h._source;
            if (!src) continue;
            push("job", src.title);
            push("company", src.companyName);
            push("category", src.categoryName);
            for (const s of src.skillNames ?? []) {
              push("skill", s);
              if (out.length >= 12) break;
            }
            if (out.length >= 12) break;
          }

          return { suggestions: out.slice(0, 12) };
        } catch (err) {
          logger.error("OpenSearch suggest failed, falling back to Prisma", {
            error: err,
          });
        }
      }
    }

    const now = new Date();
    const needleContains = effectiveQ || q;

    const [skills, companies, categories, jobs] = await Promise.all([
      prisma.skill.findMany({
        where: { deletedAt: null, name: { contains: needleContains } },
        take: 8,
        orderBy: { id: "desc" },
        select: { name: true },
      }),
      prisma.company.findMany({
        where: { deletedAt: null, status: true, name: { contains: needleContains } },
        take: 6,
        orderBy: { id: "desc" },
        select: { name: true },
      }),
      prisma.category.findMany({
        where: { deletedAt: null, name: { contains: needleContains } },
        take: 6,
        orderBy: { id: "desc" },
        select: { name: true },
      }),
      prisma.job.findMany({
        where: {
          moderationStatus: JobModerationStatus.APPROVED,
          deletedAt: null,
          company: { status: true, deletedAt: null },
          category: { deletedAt: null },
          AND: [
            { OR: [{ deadline: null }, { deadline: { gte: now } }] },
            { title: { contains: needleContains } },
          ],
        },
        take: 6,
        orderBy: { id: "desc" },
        select: { title: true },
      }),
    ]);

    const out: Suggestion[] = [];
    const seen = new Set<string>();
    const push = (kind: SuggestionKind, text: string | undefined | null) => {
      const t = String(text ?? "").trim();
      if (!t) return;
      const norm = normalizeForSearch(t);
      const key = `${kind}:${norm}`;
      if (seen.has(key)) return;
      seen.add(key);
      out.push({ kind, text: t });
    };

    for (const r of skills) push("skill", r.name);
    for (const r of companies) push("company", r.name);
    for (const r of categories) push("category", r.name);
    for (const r of jobs) push("job", r.title);

    return { suggestions: out.slice(0, 12) };
  },

  async getJobById(id: number, mode: JobListMode = "public") {
    if (isNaN(id)) throw new HttpException("Invalid ID", 400);

    if (mode === "public" && env.CACHE_ENABLED) {
      const surfaceVer = await getPublicSurfaceVersion();
      const cached = await cacheGetJson(
        CacheKeys.jobPublicDetail(surfaceVer, id),
      );
      if (cached) return cached;
    }

    const job = await prisma.job.findFirst({
      where: { id, deletedAt: null },
      include: {
        company: {
          include: {
            province: true,
            district: true,
            categories: {
              include: {
                parentCategory: true,
              },
            },
          },
        },
        employer: {
          include: {
            user: { select: { id: true, username: true } },
          },
        },
        category: true,
        jobSkills: { include: { skill: true } },
      },
    });
    if (!job) return null;
    {
      const unique = new Map<
        number,
        { id: number; name: string; slug: string }
      >();
      for (const rel of job.company.categories ?? []) {
        const p = (rel as unknown as { parentCategory?: unknown })
          .parentCategory as
          | { id: number; name: string; slug: string }
          | undefined;
        if (!p) continue;
        unique.set(p.id, { id: p.id, name: p.name, slug: p.slug });
      }
      (
        job.company as unknown as { categories: Array<{ category: unknown }> }
      ).categories = [...unique.values()].map((c) => ({ category: c }));
    }
    if (mode === "public") {
      if (job.moderationStatus !== JobModerationStatus.APPROVED) return null;
      if (job.deadline && job.deadline < new Date()) return null;
      if (!job.company.status) return null;
      if (env.CACHE_ENABLED) {
        const surfaceVer = await getPublicSurfaceVersion();
        await cacheSetJson(
          CacheKeys.jobPublicDetail(surfaceVer, id),
          job,
          env.CACHE_TTL_JOB_DETAIL_PUBLIC_SEC,
        );
      }
    }
    return job;
  },

  async incrementPublicJobView(id: number): Promise<number | null> {
    if (isNaN(id)) return null;
    const now = new Date();
    const exists = await prisma.job.findFirst({
      where: {
        id,
        deletedAt: null,
        moderationStatus: JobModerationStatus.APPROVED,
        company: { status: true, deletedAt: null },
        category: { deletedAt: null },
        OR: [{ deadline: null }, { deadline: { gte: now } }],
      },
      select: { id: true },
    });
    if (!exists) return null;
    const u = await prisma.job.update({
      where: { id },
      data: { viewCount: { increment: 1 } },
      select: { viewCount: true },
    });
    if (env.CACHE_ENABLED) {
      const surfaceVer = await getPublicSurfaceVersion();
      await Promise.all([
        cacheDel(CacheKeys.jobPublicDetail(surfaceVer, id)),
        cacheDel(CacheKeys.jobPublicDetailLegacy(id)),
      ]);
    }
    return u.viewCount;
  },

  async updateJob(id: number, data: Partial<JobDTO>) {
    if (isNaN(id)) throw new HttpException("Invalid ID", 400);
    const job = await prisma.job.findFirst({
      where: { id, deletedAt: null },
    });

    if (!job) {
      throw new HttpException("Việc làm không tồn tại", 404);
    }

    const {
      skillIds,
      deadline,
      employerId: incomingEmployerId,
      categoryId: incomingCategoryId,
      companyId: incomingCompanyId,
      ...rest
    } = data;

    const companyId = incomingCompanyId ?? job.companyId;
    const categoryId = incomingCategoryId ?? job.categoryId;

    const category = await prisma.category.findFirst({
      where: { id: categoryId, deletedAt: null },
      select: { id: true, parentCategoryId: true },
    });
    if (!category) {
      throw new HttpException("Danh mục không tồn tại", 400);
    }
    const companyCategory = await prisma.companyCategory.findFirst({
      where: {
        companyId,
        parentCategoryId: category.parentCategoryId,
      },
      select: { companyId: true },
    });
    if (!companyCategory) {
      throw new HttpException("Danh mục không thuộc công ty này", 400);
    }

    const employerId =
      incomingEmployerId !== undefined ? incomingEmployerId : job.employerId;

    if (employerId) {
      const employer = await prisma.employer.findUnique({
        where: { id: employerId },
      });

      if (!employer) {
        throw new HttpException("Nhà tuyển dụng không tồn tại", 400);
      }

      if (employer.companyId !== companyId) {
        throw new HttpException("Nhà tuyển dụng không thuộc công ty này", 400);
      }
    }

    const updatePayload: Prisma.JobUpdateInput = {
      ...rest,
      category: { connect: { id: categoryId } },
      company: { connect: { id: companyId } },
    };

    const resolvedEmployerId =
      incomingEmployerId !== undefined ? incomingEmployerId : job.employerId;

    updatePayload.employer = resolvedEmployerId
      ? { connect: { id: resolvedEmployerId } }
      : { disconnect: true };

    if (deadline !== undefined) {
      const d = normalizeDeadline(deadline);
      updatePayload.deadline = d === undefined ? null : d;
    }

    const updated = await prismaTransaction(async (tx) => {
      await tx.job.update({
        where: { id },
        data: updatePayload,
      });

      if (skillIds !== undefined) {
        await tx.jobSkill.deleteMany({ where: { jobId: id } });
        if (skillIds.length) {
          const skills = await tx.skill.findMany({
            where: { id: { in: skillIds } },
            select: { id: true },
          });
          const valid = skills.map((s) => s.id);
          if (valid.length) {
            await tx.jobSkill.createMany({
              data: valid.map((skillId) => ({ jobId: id, skillId })),
              skipDuplicates: true,
            });
          }
        }
      }

      return tx.job.findUnique({
        where: { id },
        include: {
          company: {
            include: { province: true, district: true },
          },
          category: true,
          jobSkills: { include: { skill: true } },
          _count: { select: { applications: true } },
        },
      });
    });
    await Promise.all([
      invalidateJobCaches({ jobId: id, companyId: job.companyId }),
      invalidateAdminDashboard(),
    ]);
    await enqueueUpsertJobIndex(id);

    if (
      updated &&
      updated.moderationStatus === JobModerationStatus.APPROVED &&
      job.moderationStatus !== JobModerationStatus.APPROVED &&
      updated.company
    ) {
      await notificationService.notifyCompanyFollowersOfApprovedJob({
        jobId: id,
        companyId: updated.companyId,
        jobTitle: updated.title,
        companyName: updated.company.name,
      });
    }

    return updated;
  },

  async deleteJob(id: number) {
    if (isNaN(id)) {
      throw new HttpException("Invalid ID", 400);
    }

    const existing = await prisma.job.findFirst({
      where: { id, deletedAt: null },
      select: { companyId: true },
    });
    if (!existing) throw new HttpException("Việc làm không tồn tại", 404);

    const deleted = await prismaTransaction(async (tx) => {
      return tx.job.update({
        where: { id },
        data: { deletedAt: new Date() },
      });
    });
    await Promise.all([
      invalidateJobCaches({
        jobId: id,
        ...(existing?.companyId != null
          ? { companyId: existing.companyId }
          : {}),
      }),
      invalidateAdminDashboard(),
    ]);
    await enqueueDeleteJobIndex(id);
    return deleted;
  },

  async restoreJob(id: number) {
    if (isNaN(id)) {
      throw new HttpException("Invalid ID", 400);
    }
    const job = await prisma.job.findUnique({
      where: { id },
      include: {
        company: { select: { id: true, deletedAt: true, status: true } },
        category: { select: { id: true, deletedAt: true } },
      },
    });
    if (!job) throw new HttpException("Việc làm không tồn tại", 404);
    if (job.company?.deletedAt || job.category?.deletedAt) {
      throw new HttpException(
        "Không thể khôi phục việc làm khi công ty hoặc danh mục đã bị xóa",
        400,
      );
    }
    const restored = await prisma.job.update({
      where: { id },
      data: { deletedAt: null },
    });
    await Promise.all([
      invalidateJobCaches({ jobId: id, companyId: job.companyId }),
      invalidateAdminDashboard(),
    ]);
    await enqueueUpsertJobIndex(id);
    return restored;
  },

  async setModeration(
    id: number,
    status: JobModerationStatus,
    opts?: { skipCacheInvalidate?: boolean },
  ) {
    if (isNaN(id)) throw new HttpException("Invalid ID", 400);
    const job = await prisma.job.findFirst({ where: { id, deletedAt: null } });
    if (!job) throw new HttpException("Việc làm không tồn tại", 404);
    const row = await prisma.job.update({
      where: { id },
      data: { moderationStatus: status },
      include: {
        company: true,
        category: true,
        jobSkills: { include: { skill: true } },
      },
    });
    if (!opts?.skipCacheInvalidate) {
      await Promise.all([
        invalidateJobCaches({ jobId: id, companyId: job.companyId }),
        invalidateAdminDashboard(),
      ]);
    }
    await enqueueUpsertJobIndex(id);

    if (
      status === JobModerationStatus.APPROVED &&
      job.moderationStatus !== JobModerationStatus.APPROVED
    ) {
      const targets = await resolveEmployerUserIdsForJob(id);
      if (targets.length) {
        await notificationService.createForUsers(targets, {
          type: NotificationType.JOB_APPROVED,
          title: "Tin tuyển dụng đã được duyệt",
          body: `"${row.title}" đã hiển thị công khai.`,
          appArea: "main",
        });
      }

      await notificationService.notifyCompanyFollowersOfApprovedJob({
        jobId: id,
        companyId: row.companyId,
        jobTitle: row.title,
        companyName: row.company.name,
      });
    }

    return row;
  },

  async approveAllPendingJobs(): Promise<{
    approved: number;
    totalPending: number;
  }> {
    const pending = await prisma.job.findMany({
      where: { moderationStatus: JobModerationStatus.PENDING },
      select: { id: true },
      orderBy: { id: "asc" },
    });
    const totalPending = pending.length;
    if (!totalPending) {
      return { approved: 0, totalPending: 0 };
    }
    let approved = 0;
    for (const { id } of pending) {
      try {
        await jobService.setModeration(id, JobModerationStatus.APPROVED, {
          skipCacheInvalidate: true,
        });
        approved += 1;
      } catch (error) {
        logger.warn("approveAllPendingJobs skipped failed item", {
          jobId: id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    if (approved > 0) {
      await Promise.all([invalidateJobCaches(), invalidateAdminDashboard()]);
    }
    return { approved, totalPending };
  },

  async setFeatured(id: number, isFeatured: boolean) {
    if (isNaN(id)) throw new HttpException("Invalid ID", 400);
    const job = await prisma.job.findFirst({ where: { id, deletedAt: null } });
    if (!job) throw new HttpException("Việc làm không tồn tại", 404);
    const row = await prisma.job.update({
      where: { id },
      data: { isFeatured },
      include: {
        company: true,
        category: true,
      },
    });
    await Promise.all([
      invalidateJobCaches({ jobId: id, companyId: job.companyId }),
      invalidateAdminDashboard(),
    ]);
    await enqueueUpsertJobIndex(id);
    return row;
  },

  async purgeExpiredJobs(): Promise<{ deleted: number }> {
    const now = new Date();
    const targets = await prisma.job.findMany({
      where: {
        deadline: { not: null, lt: now },
        deletedAt: null,
      },
      select: { id: true },
    });
    const ids = targets.map((t) => t.id);
    if (!ids.length) return { deleted: 0 };

    await prismaTransaction(async (tx) => {
      await tx.job.updateMany({
        where: { id: { in: ids } },
        data: { deletedAt: now },
      });
    });

    await Promise.all([invalidateJobCaches(), invalidateAdminDashboard()]);
    await Promise.all(ids.map((id) => enqueueDeleteJobIndex(id)));
    return { deleted: ids.length };
  },
};
