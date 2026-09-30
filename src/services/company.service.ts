import type { PrismaClient } from "../generated/prisma/client";
import type { PrismaTransactionClient } from "../utils/prisma";
import { CompanyDTO } from "../types/company.type";
import { HttpException } from "../utils/exception";
import { normalizeUrl } from "../utils/helper";
import { prisma, prismaTransaction } from "../utils/prisma";
import { env } from "../config/env";
import {
  CacheKeys,
  cacheGetJson,
  cacheGetOrSetJsonWithLock,
  cacheSetJson,
  getPublicSurfaceVersion,
  invalidateAdminDashboard,
  invalidateJobCaches,
  normalizeCompaniesPublicQuery,
  stableCacheHash,
} from "../utils/cache";
import { JobModerationStatus, Prisma } from "../generated/prisma/client";
import { locationService } from "./location.service";
import { notificationService } from "./notification.service";
import { enqueueDeleteJobIndex, enqueueUpsertJobIndex } from "../search/jobs.indexer";
import { slugify } from "../utils/slug";

type DBClient = PrismaClient | PrismaTransactionClient;

async function mapCompaniesWithOpenJobCount<
  T extends { id: number; categories?: unknown[] },
>(companies: T[]): Promise<(T & { openJobCount: number })[]> {
  if (companies.length === 0) return [];
  const now = new Date();
  const ids = companies.map((c) => c.id);
  const grouped = await prisma.job.groupBy({
    by: ["companyId"],
    where: {
      companyId: { in: ids },
      moderationStatus: JobModerationStatus.APPROVED,
      deletedAt: null,
      OR: [{ deadline: null }, { deadline: { gte: now } }],
      company: { status: true, deletedAt: null },
    },
    _count: { id: true },
  });
  type GroupRow = (typeof grouped)[number];
  const countFor = (g: GroupRow) =>
    typeof g._count === "object" && g._count != null && "id" in g._count
      ? Number(g._count.id)
      : 0;
  const countMap = new Map<number, number>(
    grouped.map((g) => [Number(g.companyId), countFor(g)]),
  );
  return companies.map((c) => ({
    ...c,
    openJobCount: countMap.get(c.id) ?? 0,
  }));
}

async function allocateCompanySlug(
  name: string,
  excludeId?: number,
  tx: DBClient = prisma,
) {
  const base = slugify(name);
  let candidate = base;
  let n = 2;
  while (n < 500) {
    const found = await tx.company.findFirst({
      where: {
        slug: candidate,
        ...(excludeId ? { NOT: { id: excludeId } } : {}),
      },
      select: { id: true },
    });
    if (!found) return candidate;
    const suffix = `-${n}`;
    candidate = `${base.slice(0, 180 - suffix.length)}${suffix}`;
    n += 1;
  }
  throw new HttpException("Không tạo được đường dẫn công ty", 500);
}

async function fetchCompanyPublic(where: Prisma.CompanyWhereInput) {
  const now = new Date();
  const row = await prisma.company.findFirst({
    where: { ...where, status: true, deletedAt: null },
    include: {
      province: true,
      district: true,
      categories: {
        include: { parentCategory: true },
      },
      jobs: {
        where: {
          moderationStatus: JobModerationStatus.APPROVED,
          deletedAt: null,
          OR: [{ deadline: null }, { deadline: { gte: now } }],
          category: { deletedAt: null },
        },
        orderBy: { updatedAt: "desc" },
        take: 50,
        include: {
          category: true,
          jobSkills: { include: { skill: true } },
          _count: { select: { applications: true } },
        },
      },
      _count: { select: { jobs: true, employers: true } },
    },
  });
  if (!row) return null;
  const unique = new Map<number, { id: number; name: string; slug: string }>();
  for (const rel of row.categories ?? []) {
    const p = rel.parentCategory;
    if (!p) continue;
    unique.set(p.id, { id: p.id, name: p.name, slug: p.slug });
  }
  const normalized = [...unique.values()].map((c) => ({ category: c }));
  return { ...row, categories: normalized };
}

export const companyService = {
  async checkCompanyNameExists(name: string, excludeId?: number) {
    const company = await prisma.company.findFirst({
      where: {
        name,
        ...(excludeId && {
          id: { not: excludeId },
        }),
      },
    });

    if (company) {
      throw new HttpException("Tên công ty đã tồn tại", 400);
    }
  },

  async checkCompanyWebsiteExists(website?: string, excludeId?: number) {
    if (!website) return;

    const company = await prisma.company.findFirst({
      where: {
        website,
        ...(excludeId && {
          id: { not: excludeId },
        }),
      },
    });

    if (company) {
      throw new HttpException("Website đã tồn tại", 400);
    }
  },

  async getAll(query: {
    page?: number;
    limit?: number;
    search?: string;
    status?: string;
    provinceId?: number;
    districtId?: number;
    categoryId?: number;
    all?: boolean;
  }) {
    const qNorm = normalizeCompaniesPublicQuery(
      query as unknown as Record<string, unknown>,
    );
    const page = qNorm.page;
    const limit = qNorm.limit;
    const skip = (page - 1) * limit;

    const searchTerm = qNorm.search;
    const provinceIdFilter = qNorm.provinceId;
    const districtIdFilter = qNorm.districtId;
    const categoryIdFilter = qNorm.categoryId;
    const statusFilter =
      qNorm.status === "" ? null : qNorm.status === "true";

    const parentCategoryIdFilter: number | null =
      categoryIdFilter != null
        ? await (async () => {
            const id = Number(categoryIdFilter);
            if (!Number.isFinite(id) || id === 0) return null;
            const parentKey = Math.abs(Math.trunc(id));
            const parent = await prisma.categoryParent.findFirst({
              where: { id: parentKey, deletedAt: null },
              select: { id: true },
            });
            if (parent) return parent.id;
            const child = await prisma.category.findFirst({
              where: { id: parentKey, deletedAt: null },
              select: { parentCategoryId: true },
            });
            return child?.parentCategoryId ?? null;
          })()
        : null;

    const where: Prisma.CompanyWhereInput = {
      deletedAt: null,
      ...(searchTerm && {
        OR: [
          { name: { contains: searchTerm } },
          { location: { contains: searchTerm } },
          { website: { contains: searchTerm } },
        ],
      }),

      ...(statusFilter != null && {
        status: statusFilter,
      }),

      ...(provinceIdFilter != null && {
        provinceId: provinceIdFilter,
      }),

      ...(districtIdFilter != null && {
        districtId: districtIdFilter,
      }),

      ...(parentCategoryIdFilter != null && {
        categories: {
          some: {
            parentCategoryId: parentCategoryIdFilter,
          },
        },
      }),
    };

    const include = {
      province: true,
      district: true,
      categories: {
        include: {
          parentCategory: true,
        },
      },
      employers: {
        select: { status: true },
      },
      _count: {
        select: {
          jobs: true,
        },
      },
    };

    if (qNorm.all) {
      const companies = await prisma.company.findMany({
        where,
        orderBy: { id: "desc" },
        include,
      });

      return {
        companies: (await mapCompaniesWithOpenJobCount(companies)).map((c) => ({
          ...c,
          categories: (c.categories ?? [])
            .map((rel) => {
              const x = rel as unknown as {
                parentCategory?: { id: number; name: string; slug: string } | null;
                category?: { id: number; name: string; slug: string } | null;
              };
              const cat = x.parentCategory ?? x.category ?? null;
              return cat ? { category: cat } : null;
            })
            .filter(Boolean),
        })),
        pagination: null,
      };
    }

    const surfaceVer = env.CACHE_ENABLED
      ? await getPublicSurfaceVersion()
      : null;
    const listKey =
      surfaceVer != null
        ? CacheKeys.companiesPublic(surfaceVer, stableCacheHash(qNorm))
        : null;

    const load = async () => {
      const [companies, total] = await Promise.all([
        prisma.company.findMany({
          where,
          skip,
          take: limit,
          orderBy: { id: "desc" },
          include,
        }),

        prisma.company.count({ where }),
      ]);

      return {
        companies: (await mapCompaniesWithOpenJobCount(companies)).map((c) => ({
          ...c,
          categories: (c.categories ?? [])
            .map((rel) => {
              const x = rel as unknown as {
                parentCategory?: { id: number; name: string; slug: string } | null;
                category?: { id: number; name: string; slug: string } | null;
              };
              const cat = x.parentCategory ?? x.category ?? null;
              return cat ? { category: cat } : null;
            })
            .filter(Boolean),
        })),
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      };
    };

    if (env.CACHE_ENABLED && listKey) {
      return cacheGetOrSetJsonWithLock(
        listKey,
        env.CACHE_TTL_COMPANIES_PUBLIC_SEC,
        load,
        { lockTtlSec: 12, waitMs: 140, waitTries: 8 },
      );
    }

    const payload = await load();
    return payload;
  },

  async getCompanyById(id: number) {
    if (isNaN(id)) {
      throw new HttpException("Invalid ID", 400);
    }
    const row = await prisma.company.findFirst({
      where: { id, deletedAt: null },
      include: {
        province: true,
        district: true,

        categories: {
          include: {
            parentCategory: true,
          },
        },

        employers: {
          include: {
            user: true,
          },
        },

        jobs: {
          where: { deletedAt: null },
          orderBy: { id: "desc" },
          take: 80,
          select: {
            id: true,
            title: true,
            moderationStatus: true,
            deadline: true,
            createdAt: true,
            isFeatured: true,
            _count: { select: { applications: true } },
          },
        },

        _count: {
          select: {
            jobs: true,
            employers: true,
          },
        },
      },
    });
    if (!row) return null;
    const unique = new Map<number, { id: number; name: string; slug: string }>();
    for (const rel of row.categories ?? []) {
      const p = rel.parentCategory;
      if (!p) continue;
      unique.set(p.id, { id: p.id, name: p.name, slug: p.slug });
    }
    const normalized = [...unique.values()].map((c) => ({ category: c }));
    return { ...row, categories: normalized };
  },

  async getPublicByKey(key: string) {
    const trimmed = key.trim();
    if (!trimmed) return null;
    if (/^\d+$/.test(trimmed)) {
      return this.getPublicById(Number(trimmed));
    }
    const found = await prisma.company.findFirst({
      where: { slug: trimmed, status: true, deletedAt: null },
      select: { id: true },
    });
    if (!found) return null;
    return this.getPublicById(found.id);
  },

  async getPublicById(id: number) {
    if (isNaN(id)) return null;
    if (env.CACHE_ENABLED) {
      const hit = await cacheGetJson<unknown>(CacheKeys.companyPublicDetail(id));
      if (hit) return hit as Awaited<ReturnType<typeof fetchCompanyPublic>>;
    }
    const row = await fetchCompanyPublic({ id });
    if (row && env.CACHE_ENABLED) {
      await cacheSetJson(
        CacheKeys.companyPublicDetail(id),
        row,
        env.CACHE_TTL_COMPANY_PUBLIC_DETAIL_SEC,
      );
    }
    return row;
  },

  async getTopHiring(limit = 8) {
    const take = Math.min(Math.max(Number(limit) || 8, 1), 24);
    const topKeyVer = env.CACHE_ENABLED
      ? await getPublicSurfaceVersion()
      : null;
    const topKey =
      topKeyVer != null ? CacheKeys.topHiring(topKeyVer, take) : null;

    const load = async () => {
      const now = new Date();
      const openJobWhere: Prisma.JobWhereInput = {
        moderationStatus: JobModerationStatus.APPROVED,
        deletedAt: null,
        OR: [{ deadline: null }, { deadline: { gte: now } }],
        company: { status: true, deletedAt: null },
        category: { deletedAt: null },
      };

      const grouped = await prisma.job.groupBy({
        by: ["companyId"],
        where: openJobWhere,
        _count: { id: true },
      });

      type GroupRow = (typeof grouped)[number];
      const countFor = (g: GroupRow) =>
        typeof g._count === "object" && g._count != null && "id" in g._count
          ? Number(g._count.id)
          : 0;

      const sorted = [...grouped].sort((a, b) => countFor(b) - countFor(a));
      const top = sorted.slice(0, take);

      const ids = top.map((g) => g.companyId);
      const countByCompany = new Map(
        top.map((g) => [g.companyId, countFor(g)]),
      );

      if (!ids.length) {
        return {
          companies: [],
          pagination: { total: 0, page: 1, limit: take, totalPages: 0 },
          provinces: [],
          categories: [],
          query: {},
        };
      }

      const companiesRaw = await prisma.company.findMany({
        where: { id: { in: ids }, status: true, deletedAt: null },
        include: {
          province: true,
          district: true,
          categories: { include: { parentCategory: true } },
        },
      });

      const order = new Map(ids.map((id, i) => [id, i]));
      companiesRaw.sort((a, b) => (order.get(a.id)! - order.get(b.id)!));

      const companies = companiesRaw.map((c) => ({
        ...c,
        openJobCount: countByCompany.get(c.id) ?? 0,
        categories: (c.categories ?? [])
          .map((rel) => {
            const x = rel as unknown as {
              parentCategory?: { id: number; name: string; slug: string } | null;
              category?: { id: number; name: string; slug: string } | null;
            };
            const cat = x.parentCategory ?? x.category ?? null;
            return cat ? { category: cat } : null;
          })
          .filter(Boolean),
      }));

      return {
        companies,
        pagination: {
          total: companies.length,
          page: 1,
          limit: take,
          totalPages: 1,
        },
        provinces: [],
        categories: [],
        query: {},
      };
    };

    if (env.CACHE_ENABLED && topKey) {
      return cacheGetOrSetJsonWithLock(
        topKey,
        env.CACHE_TTL_TOP_HIRING_SEC,
        load,
        { lockTtlSec: 12, waitMs: 140, waitTries: 8 },
      );
    }

    const payload = await load();
    return payload;
  },

  async createCompany(data: CompanyDTO, tx: DBClient = prisma) {
    const { provinceId, districtId, categoryIds, ...companyData } = data;

    if (!provinceId || !districtId) {
      throw new HttpException("Thiếu tỉnh/thành hoặc quận/huyện", 400);
    }

    await this.checkCompanyNameExists(companyData.name);
    await this.checkCompanyWebsiteExists(normalizeUrl(companyData.website));
    await locationService.validateProvinceDistrict(provinceId, districtId);

    const slug = await allocateCompanySlug(companyData.name, undefined, tx);

    const company = await tx.company.create({
      data: {
        ...companyData,
        slug,
        status: companyData.status ?? true,

        ...(provinceId && {
          province: {
            connect: { id: provinceId },
          },
        }),

        ...(districtId && {
          district: {
            connect: { id: districtId },
          },
        }),
      },
    });

    if (categoryIds && categoryIds.length > 0) {
      const rawIds = [...new Set(categoryIds.map((x) => Math.trunc(Number(x))))].filter(
        (x) => Number.isFinite(x) && x > 0,
      );
      const cnt = await tx.categoryParent.count({ where: { id: { in: rawIds } } });
      if (cnt !== rawIds.length) throw new HttpException("Danh mục không tồn tại", 400);
      await tx.companyCategory.createMany({
        data: rawIds.map((parentCategoryId) => ({
          companyId: company.id,
          parentCategoryId,
        })),
      });
    }
    if (tx === prisma) {
      await Promise.all([
        invalidateJobCaches({ companyId: company.id }),
        invalidateAdminDashboard(),
      ]);
    }
    return company;
  },
  async updateCompany(
    id: number,
    data: {
      name?: string;
      description?: string;
      location?: string;
      website?: string;
      logo?: string;
      status?: boolean;
      provinceId?: number;
      districtId?: number;
      categoryIds?: number[];
    },
  ) {
    if (isNaN(id)) {
      throw new HttpException("Invalid ID", 400);
    }

    const previous = await prisma.company.findUnique({
      where: { id },
      select: { status: true, name: true },
    });

    const { provinceId, districtId, categoryIds, ...companyData } = data;

    if ((provinceId && !districtId) || (!provinceId && districtId)) {
      throw new HttpException("Province và District phải có dữ liệu", 400);
    }

    if (companyData.name) {
      await this.checkCompanyNameExists(companyData.name, id);
    }

    if (companyData.website) {
      const normalizedWebsite = normalizeUrl(companyData.website);
      await this.checkCompanyWebsiteExists(normalizedWebsite, id);
      companyData.website = normalizedWebsite!;
    }

    if (provinceId && districtId) {
      await locationService.validateProvinceDistrict(provinceId, districtId);
    }

    const slug = companyData.name
      ? await allocateCompanySlug(companyData.name, id)
      : undefined;

    const company = await prisma.company.update({
      where: { id },
      data: {
        ...companyData,
        ...(slug ? { slug } : {}),

        ...(provinceId && {
          province: {
            connect: { id: provinceId },
          },
        }),

        ...(districtId && {
          district: {
            connect: { id: districtId },
          },
        }),
      },
    });

    if (categoryIds) {
      const rawIds = [...new Set(categoryIds.map((x) => Math.trunc(Number(x))))].filter(
        (x) => Number.isFinite(x) && x > 0,
      );
      const cnt = await prisma.categoryParent.count({ where: { id: { in: rawIds } } });
      if (cnt !== rawIds.length) throw new HttpException("Danh mục không tồn tại", 400);
      const current = await prisma.companyCategory.findMany({
        where: { companyId: id },
        select: { parentCategoryId: true },
      });

      const currentIds = current.map((c) => c.parentCategoryId);

      const toAdd = rawIds.filter((cid) => !currentIds.includes(cid));
      const toRemove = currentIds.filter((cid) => !rawIds.includes(cid));

      if (toRemove.length > 0) {
        await prisma.companyCategory.deleteMany({
          where: {
            companyId: id,
            parentCategoryId: { in: toRemove },
          },
        });
      }

      if (toAdd.length > 0) {
        await prisma.companyCategory.createMany({
          data: toAdd.map((parentCategoryId) => ({
            companyId: id,
            parentCategoryId,
          })),
        });
      }
    }

    await Promise.all([
      invalidateJobCaches({ companyId: id }),
      invalidateAdminDashboard(),
    ]);

    if (previous?.status === true && company.status === false) {
      await notificationService.notifyCompanyEmployersSuspended(id, company.name);
    }

    return company;
  },
  async updateCompanyStatus(
    companyId: number,
    status: boolean,
    tx: DBClient = prisma,
  ) {
    if (isNaN(companyId)) {
      throw new HttpException("Invalid company ID", 400);
    }

    const previous = await tx.company.findUnique({
      where: { id: companyId },
      select: { status: true, name: true },
    });

    const row = await tx.company.update({
      where: { id: companyId },
      data: { status },
    });
    if (tx === prisma) {
      await invalidateJobCaches({ companyId });
      if (previous?.status === true && !status) {
        await notificationService.notifyCompanyEmployersSuspended(
          companyId,
          row.name,
        );
      }
    }
    return row;
  },
  async deleteCompany(id: number) {
    if (isNaN(id)) {
      throw new HttpException("Invalid ID", 400);
    }

    const removed = await prismaTransaction(async (tx) => {
      const deletedAt = new Date();
      const jobs = await tx.job.findMany({
        where: { companyId: id, deletedAt: null },
        select: { id: true },
      });

      const jobIds = jobs.map((job) => job.id);

      if (jobIds.length > 0) {
        await tx.job.updateMany({
          where: { id: { in: jobIds } },
          data: { deletedAt },
        });
      }

      return await tx.company.update({
        where: { id },
        data: {
          deletedAt,
          status: false,
        },
      });
    });
    await Promise.all([invalidateJobCaches(), invalidateAdminDashboard()]);
    const hiddenJobs = await prisma.job.findMany({
      where: { companyId: id, deletedAt: { not: null } },
      select: { id: true },
    });
    await Promise.all(hiddenJobs.map((job) => enqueueDeleteJobIndex(job.id)));
    return removed;
  },

  async restoreCompany(id: number) {
    if (isNaN(id)) {
      throw new HttpException("Invalid ID", 400);
    }
    const company = await prisma.company.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!company) throw new HttpException("Không tìm thấy công ty", 404);

    const restored = await prisma.company.update({
      where: { id },
      data: { deletedAt: null, status: true },
    });
    const jobs = await prisma.job.findMany({
      where: {
        companyId: id,
        deletedAt: { not: null },
        category: { deletedAt: null },
      },
      select: { id: true },
    });
    await prisma.job.updateMany({
      where: { id: { in: jobs.map((job) => job.id) } },
      data: { deletedAt: null },
    });
    await Promise.all([invalidateJobCaches(), invalidateAdminDashboard()]);
    await Promise.all(jobs.map((job) => enqueueUpsertJobIndex(job.id)));
    return restored;
  },
};
