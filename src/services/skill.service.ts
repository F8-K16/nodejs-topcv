import { prisma, prismaTransaction } from "../utils/prisma";
import { HttpException } from "../utils/exception";
import { Prisma } from "../generated/prisma/client";
import {
  CacheKeys,
  cacheGetJson,
  cacheSetJsonPersistent,
  invalidateSkillCaches,
  stableCacheHash,
} from "../utils/cache";
import { enqueueUpsertJobIndex } from "../search/jobs.indexer";

export const skillService = {
  async list(query: { page?: number; limit?: number; search?: string }) {
    const page = Number(query.page) || 1;
    const limit = Math.min(Number(query.limit) || 20, 100);
    const search = query.search?.trim() ?? "";

    const cacheKey = CacheKeys.skillsList(
      stableCacheHash({ page, limit, search }),
    );
    type ListPayload = {
      skills: Awaited<ReturnType<typeof prisma.skill.findMany>>;
      pagination: {
        total: number;
        page: number;
        limit: number;
        totalPages: number;
      };
    };

    const hit = await cacheGetJson<ListPayload>(cacheKey);
    if (hit) return hit;

    const skip = (page - 1) * limit;

    const where: Prisma.SkillWhereInput = {
      deletedAt: null,
      ...(search && {
        name: { contains: search },
      }),
    };

    const [skills, total] = await Promise.all([
      prisma.skill.findMany({
        where,
        skip,
        take: limit,
        orderBy: { name: "asc" },
        include: {
          _count: { select: { jobSkills: true } },
        },
      }),
      prisma.skill.count({ where }),
    ]);

    const payload: ListPayload = {
      skills,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };

    await cacheSetJsonPersistent(cacheKey, payload);
    return payload;
  },

  async create(name: string) {
    const existing = await prisma.skill.findFirst({
      where: { name, deletedAt: null },
    });
    if (existing) {
      throw new HttpException("Kỹ năng đã tồn tại", 400);
    }
    const row = await prisma.skill.create({ data: { name } });
    await invalidateSkillCaches();
    return row;
  },

  async update(id: number, name: string) {
    if (isNaN(id)) throw new HttpException("Invalid ID", 400);
    const skill = await prisma.skill.findFirst({ where: { id, deletedAt: null } });
    if (!skill) throw new HttpException("Không tìm thấy", 404);

    const dup = await prisma.skill.findFirst({
      where: { name, deletedAt: null, NOT: { id } },
    });
    if (dup) throw new HttpException("Tên kỹ năng đã được dùng", 400);

    const row = await prisma.skill.update({
      where: { id },
      data: { name },
    });
    await invalidateSkillCaches();
    return row;
  },

  async delete(id: number) {
    if (isNaN(id)) throw new HttpException("Invalid ID", 400);
    const skill = await prisma.skill.findFirst({ where: { id, deletedAt: null } });
    if (!skill) throw new HttpException("Không tìm thấy", 404);
    await prismaTransaction(async (tx) => {
      await tx.skill.update({
        where: { id },
        data: { deletedAt: new Date() },
      });
    });
    const jobs = await prisma.job.findMany({
      where: {
        deletedAt: null,
        company: { deletedAt: null, status: true },
        category: { deletedAt: null },
        jobSkills: { some: { skillId: id } },
      },
      select: { id: true },
    });
    await invalidateSkillCaches();
    await Promise.all(jobs.map((job) => enqueueUpsertJobIndex(job.id)));
    return { success: true };
  },

  async restore(id: number) {
    if (isNaN(id)) throw new HttpException("Invalid ID", 400);
    const skill = await prisma.skill.update({
      where: { id },
      data: { deletedAt: null },
    });
    const jobs = await prisma.job.findMany({
      where: {
        deletedAt: null,
        company: { deletedAt: null, status: true },
        category: { deletedAt: null },
        jobSkills: { some: { skillId: id } },
      },
      select: { id: true },
    });
    await invalidateSkillCaches();
    await Promise.all(jobs.map((job) => enqueueUpsertJobIndex(job.id)));
    return skill;
  },

  async listAllForSelect() {
    const hit = await cacheGetJson<
      { id: number; name: string }[]
    >(CacheKeys.skillsSelect);
    if (hit) return hit;

    const rows = await prisma.skill.findMany({
      where: { deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    });
    await cacheSetJsonPersistent(CacheKeys.skillsSelect, rows);
    return rows;
  },
};
