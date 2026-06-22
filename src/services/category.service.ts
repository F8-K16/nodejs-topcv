import { HttpException } from "../utils/exception";
import { prisma } from "../utils/prisma";
import { invalidateAfterCategoryChange } from "../utils/cache";
import { enqueueDeleteJobIndex, enqueueUpsertJobIndex } from "../search/jobs.indexer";

type DuplicateCategoryCondition = { name: string } | { slug: string };

async function checkDuplicateCategoryParent(
  data: { name?: string; slug?: string },
  excludeId?: number,
) {
  const conditions: DuplicateCategoryCondition[] = [];
  if (data.name) conditions.push({ name: data.name });
  if (data.slug) conditions.push({ slug: data.slug });
  if (!conditions.length) return;

  const existed = await prisma.categoryParent.findFirst({
    where: {
      OR: conditions,
      ...(excludeId && { NOT: { id: excludeId } }),
    },
    select: { id: true, name: true, slug: true },
  });

  if (!existed) return;
  if (existed.slug === data.slug) throw new HttpException("Slug đã tồn tại", 400);
  if (existed.name === data.name) throw new HttpException("Tên đã tồn tại", 400);
}

async function checkDuplicateCategory(
  data: { name?: string; slug?: string },
  excludeId?: number,
) {
  const conditions: DuplicateCategoryCondition[] = [];
  if (data.name) conditions.push({ name: data.name });
  if (data.slug) conditions.push({ slug: data.slug });
  if (!conditions.length) return;

  const existed = await prisma.category.findFirst({
    where: {
      OR: conditions,
      ...(excludeId && { NOT: { id: excludeId } }),
    },
    select: { id: true, name: true, slug: true },
  });

  if (!existed) return;
  if (existed.slug === data.slug) throw new HttpException("Slug đã tồn tại", 400);
  if (existed.name === data.name) throw new HttpException("Tên đã tồn tại", 400);
}

export const categoryParentService = {
  async create(data: { name: string; slug: string }) {
    await checkDuplicateCategoryParent(data);
    const row = await prisma.categoryParent.create({ data });
    await invalidateAfterCategoryChange();
    return row;
  },

  async getAll(query: { page?: number; search?: string; all?: boolean }) {
    const take = 10;
    const page = query.page && query.page > 0 ? query.page : 1;
    const search = query.search?.trim();

    const where = {
      deletedAt: null,
      ...(search
        ? {
            OR: [{ name: { contains: search } }, { slug: { contains: search } }],
          }
        : {}),
    };

    if (query.all) {
      const categories = await prisma.categoryParent.findMany({
        where,
        orderBy: [{ name: "asc" }],
        include: {
          _count: { select: { categories: true, companies: true } },
        },
      });
      return { categories, pagination: null };
    }

    const skip = (page - 1) * take;
    const [categories, totalItems] = await Promise.all([
      prisma.categoryParent.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: "desc" },
        include: {
          _count: { select: { categories: true, companies: true } },
        },
      }),
      prisma.categoryParent.count({ where }),
    ]);

    return {
      categories,
      pagination: {
        page,
        totalPages: Math.ceil(totalItems / take),
        totalItems,
      },
    };
  },

  async findById(id: number) {
    if (isNaN(id)) throw new HttpException("Invalid ID", 400);
    const row = await prisma.categoryParent.findFirst({
      where: { id, deletedAt: null },
    });
    if (!row) throw new HttpException("Không tìm thấy danh mục cha", 400);
    return row;
  },

  async update(id: number, data: { name?: string; slug?: string }) {
    if (isNaN(id)) throw new HttpException("Invalid ID", 400);
    await this.findById(id);
    await checkDuplicateCategoryParent(data, id);

    const updated = await prisma.categoryParent.update({
      where: { id },
      data,
    });
    await invalidateAfterCategoryChange();
    return updated;
  },

  async delete(id: number) {
    if (isNaN(id)) throw new HttpException("Invalid ID", 400);
    await this.findById(id);

    const childCount = await prisma.category.count({
      where: { parentCategoryId: id, deletedAt: null },
    });
    if (childCount > 0) {
      throw new HttpException(
        "Không thể xóa danh mục cha đang có danh mục con",
        400,
      );
    }

    const row = await prisma.categoryParent.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    await invalidateAfterCategoryChange();
    return row;
  },

  async restore(id: number) {
    if (isNaN(id)) throw new HttpException("Invalid ID", 400);
    const row = await prisma.categoryParent.update({
      where: { id },
      data: { deletedAt: null },
    });
    await invalidateAfterCategoryChange();
    return row;
  },
};

export const categoryService = {
  async create(data: { name: string; slug: string; parentCategoryId: number }) {
    await checkDuplicateCategory(data);
    const parent = await prisma.categoryParent.findFirst({
      where: { id: data.parentCategoryId, deletedAt: null },
      select: { id: true },
    });
    if (!parent) {
      throw new HttpException("Danh mục cha không tồn tại", 400);
    }
    const row = await prisma.category.create({ data });
    await invalidateAfterCategoryChange();
    return row;
  },

  async getAll(query: {
    page?: number;
    search?: string;
    all?: boolean;
    parentCategoryId?: number;
  }) {
    const take = 10;
    const page = query.page && query.page > 0 ? query.page : 1;
    const search = query.search?.trim();

    const whereBase = {
      deletedAt: null,
      ...(search
        ? {
            OR: [{ name: { contains: search } }, { slug: { contains: search } }],
          }
        : {}),
    };

    const where =
      query.parentCategoryId !== undefined
        ? { ...whereBase, parentCategoryId: query.parentCategoryId }
        : whereBase;

    if (query.all) {
      const categories = await prisma.category.findMany({
        where,
        orderBy: [{ parentCategoryId: "asc" }, { name: "asc" }],
        include: {
          _count: { select: { jobs: true } },
          parentCategory: { select: { id: true, name: true, slug: true } },
        },
      });
      return { categories, pagination: null };
    }

    const skip = (page - 1) * take;
    const [categories, totalItems] = await Promise.all([
      prisma.category.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: "desc" },
        include: {
          _count: { select: { jobs: true } },
          parentCategory: { select: { id: true, name: true, slug: true } },
        },
      }),
      prisma.category.count({ where }),
    ]);

    return {
      categories,
      pagination: {
        page,
        totalPages: Math.ceil(totalItems / take),
        totalItems,
      },
    };
  },

  async findById(id: number) {
    if (isNaN(id)) throw new HttpException("Invalid ID", 400);
    const category = await prisma.category.findFirst({
      where: { id, deletedAt: null },
      include: { parentCategory: true },
    });
    if (!category) {
      throw new HttpException("Không tìm thấy danh mục công việc", 400);
    }
    return category;
  },

  async update(
    id: number,
    data: { name?: string; slug?: string; parentCategoryId?: number },
  ) {
    if (isNaN(id)) throw new HttpException("Invalid ID", 400);
    await this.findById(id);
    await checkDuplicateCategory(data, id);

    if (data.parentCategoryId !== undefined) {
      const parent = await prisma.categoryParent.findFirst({
        where: { id: data.parentCategoryId, deletedAt: null },
        select: { id: true },
      });
      if (!parent) throw new HttpException("Danh mục cha không tồn tại", 400);
    }

    const updated = await prisma.category.update({
      where: { id },
      data,
    });
    await invalidateAfterCategoryChange();
    return updated;
  },

  async getCategoriesByCompany(companyId: number) {
    if (isNaN(companyId)) throw new HttpException("Invalid ID", 400);
    const rows = await prisma.companyCategory.findMany({
      where: { companyId },
      select: { parentCategoryId: true },
    });
    const selectedIds = rows.map((r) => r.parentCategoryId);
    if (!selectedIds.length) return [];

    return prisma.category.findMany({
      where: { parentCategoryId: { in: selectedIds }, deletedAt: null },
      orderBy: [{ parentCategoryId: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        slug: true,
        parentCategoryId: true,
      },
    });
  },

  async delete(id: number) {
    if (isNaN(id)) throw new HttpException("Invalid ID", 400);
    await this.findById(id);

    const row = await prisma.category.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    await invalidateAfterCategoryChange();
    const jobs = await prisma.job.findMany({
      where: { categoryId: id, deletedAt: null },
      select: { id: true },
    });
    await Promise.all(jobs.map((job) => enqueueDeleteJobIndex(job.id)));
    return row;
  },

  async restore(id: number) {
    if (isNaN(id)) throw new HttpException("Invalid ID", 400);
    const category = await prisma.category.findUnique({
      where: { id },
      include: { parentCategory: true },
    });
    if (!category) throw new HttpException("Không tìm thấy danh mục công việc", 404);
    if (category.parentCategory.deletedAt) {
      throw new HttpException("Không thể khôi phục khi danh mục cha đã bị xóa", 400);
    }
    const row = await prisma.category.update({
      where: { id },
      data: { deletedAt: null },
    });
    await invalidateAfterCategoryChange();
    const jobs = await prisma.job.findMany({
      where: {
        categoryId: id,
        deletedAt: null,
        company: { deletedAt: null, status: true },
      },
      select: { id: true },
    });
    await Promise.all(jobs.map((job) => enqueueUpsertJobIndex(job.id)));
    return row;
  },
};
