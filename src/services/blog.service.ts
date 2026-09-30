import { Prisma } from "../generated/prisma/client";
import { HttpException } from "../utils/exception";
import { prisma } from "../utils/prisma";
import { slugify } from "../utils/slug";
import {
  CacheKeys,
  cacheGetJson,
  cacheSetJson,
  invalidateBlogCaches,
  stableCacheHash,
} from "../utils/cache";

const publicWhere: Prisma.BlogPostWhereInput = {
  deletedAt: null,
  publishedAt: { lte: new Date() },
};

function normalizeCover(url?: string) {
  const value = url?.trim() ?? "";
  if (!value) return null;
  if (!/^https?:\/\//i.test(value)) {
    throw new HttpException("Ảnh bìa phải là URL http(s)", 400);
  }
  return value;
}

async function uniqueBlogSlug(title: string, excludeId?: number) {
  const base = slugify(title).replace(/^cong-ty$/, "bai-viet") || "bai-viet";
  let candidate = base.slice(0, 180);
  let n = 2;
  for (;;) {
    const existing = await prisma.blogPost.findFirst({
      where: {
        slug: candidate,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true },
    });
    if (!existing) return candidate;
    const suffix = `-${n}`;
    candidate = `${base.slice(0, 180 - suffix.length)}${suffix}`;
    n += 1;
  }
}

function serialize(post: {
  id: number;
  slug: string;
  title: string;
  excerpt: string;
  content: string;
  coverUrl: string | null;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  author?: { id: number; username: string } | null;
}) {
  return {
    id: post.id,
    slug: post.slug,
    title: post.title,
    excerpt: post.excerpt,
    content: post.content,
    coverUrl: post.coverUrl,
    publishedAt: post.publishedAt,
    createdAt: post.createdAt,
    updatedAt: post.updatedAt,
    author: post.author
      ? { id: post.author.id, username: post.author.username }
      : null,
  };
}

export const blogService = {
  async listPublic(query: { page?: number; limit?: number }) {
    const page = Math.max(Number(query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(query.limit) || 12, 1), 50);
    const cacheKey = CacheKeys.blogPublicList(stableCacheHash({ page, limit }));
    const hit = await cacheGetJson<{
      posts: Awaited<ReturnType<typeof prisma.blogPost.findMany>>;
      pagination: {
        total: number;
        page: number;
        limit: number;
        totalPages: number;
      };
    }>(cacheKey);
    if (hit) return hit;

    const skip = (page - 1) * limit;
    const where = {
      deletedAt: null,
      publishedAt: { lte: new Date() },
    } satisfies Prisma.BlogPostWhereInput;

    const [rows, total] = await Promise.all([
      prisma.blogPost.findMany({
        where,
        skip,
        take: limit,
        orderBy: { publishedAt: "desc" },
        select: {
          id: true,
          slug: true,
          title: true,
          excerpt: true,
          coverUrl: true,
          publishedAt: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      prisma.blogPost.count({ where }),
    ]);

    const payload = {
      posts: rows,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
    await cacheSetJson(cacheKey, payload, 86400);
    return payload;
  },

  async getPublicBySlug(slug: string) {
    const trimmed = slug.trim();
    if (!trimmed) throw new HttpException("Không tìm thấy bài viết", 404);
    const cacheKey = CacheKeys.blogPublicDetail(trimmed);
    const hit = await cacheGetJson<ReturnType<typeof serialize>>(cacheKey);
    if (hit) return hit;

    const row = await prisma.blogPost.findFirst({
      where: { ...publicWhere, slug: trimmed },
      include: { author: { select: { id: true, username: true } } },
    });
    if (!row) throw new HttpException("Không tìm thấy bài viết", 404);
    const payload = serialize(row);
    await cacheSetJson(cacheKey, payload, 86400);
    return payload;
  },

  async listAdmin(query: { page?: number; limit?: number; search?: string }) {
    const page = Math.max(Number(query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 100);
    const search = String(query.search ?? "").trim();
    const cacheKey = CacheKeys.blogAdminList(
      stableCacheHash({ page, limit, search }),
    );
    const hit = await cacheGetJson<{
      posts: ReturnType<typeof serialize>[];
      pagination: {
        total: number;
        page: number;
        limit: number;
        totalPages: number;
      };
    }>(cacheKey);
    if (hit) return hit;

    const skip = (page - 1) * limit;
    const where: Prisma.BlogPostWhereInput = {
      deletedAt: null,
      ...(search
        ? {
            OR: [
              { title: { contains: search } },
              { excerpt: { contains: search } },
              { slug: { contains: search } },
            ],
          }
        : {}),
    };

    const [rows, total] = await Promise.all([
      prisma.blogPost.findMany({
        where,
        skip,
        take: limit,
        orderBy: { updatedAt: "desc" },
        include: { author: { select: { id: true, username: true } } },
      }),
      prisma.blogPost.count({ where }),
    ]);

    const payload = {
      posts: rows.map(serialize),
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
    await cacheSetJson(cacheKey, payload, 86400);
    return payload;
  },

  async getAdminById(id: number) {
    const cacheKey = CacheKeys.blogAdminDetail(id);
    const hit = await cacheGetJson<ReturnType<typeof serialize>>(cacheKey);
    if (hit) return hit;
    const row = await prisma.blogPost.findFirst({
      where: { id, deletedAt: null },
      include: { author: { select: { id: true, username: true } } },
    });
    if (!row) throw new HttpException("Không tìm thấy bài viết", 404);
    const payload = serialize(row);
    await cacheSetJson(cacheKey, payload, 86400);
    return payload;
  },

  async create(
    userId: number,
    input: {
      title: string;
      excerpt: string;
      content: string;
      coverUrl?: string;
      slug?: string;
      published?: boolean;
    },
  ) {
    const slug = input.slug?.trim()
      ? await uniqueBlogSlug(input.slug.trim(), undefined)
      : await uniqueBlogSlug(input.title);
    const published = input.published !== false;
    const row = await prisma.blogPost.create({
      data: {
        title: input.title.trim(),
        excerpt: input.excerpt.trim(),
        content: input.content.trim(),
        coverUrl: normalizeCover(input.coverUrl),
        slug,
        publishedAt: published ? new Date() : null,
        authorId: userId,
      },
      include: { author: { select: { id: true, username: true } } },
    });
    await invalidateBlogCaches({ slugs: [row.slug], postId: row.id });
    return serialize(row);
  },

  async update(
    id: number,
    input: {
      title: string;
      excerpt: string;
      content: string;
      coverUrl?: string;
      slug?: string;
      published?: boolean;
    },
  ) {
    const existing = await prisma.blogPost.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) throw new HttpException("Không tìm thấy bài viết", 404);

    const slug = input.slug?.trim()
      ? await uniqueBlogSlug(input.slug.trim(), id)
      : existing.slug;

    let publishedAt = existing.publishedAt;
    if (input.published === true) {
      publishedAt = existing.publishedAt ?? new Date();
    } else if (input.published === false) {
      publishedAt = null;
    }

    const row = await prisma.blogPost.update({
      where: { id },
      data: {
        title: input.title.trim(),
        excerpt: input.excerpt.trim(),
        content: input.content.trim(),
        coverUrl: normalizeCover(input.coverUrl),
        slug,
        publishedAt,
      },
      include: { author: { select: { id: true, username: true } } },
    });
    await invalidateBlogCaches({
      slugs: [...new Set([existing.slug, row.slug])],
      postId: id,
    });
    return serialize(row);
  },

  async remove(id: number) {
    const existing = await prisma.blogPost.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, slug: true },
    });
    if (!existing) throw new HttpException("Không tìm thấy bài viết", 404);
    await prisma.blogPost.update({
      where: { id },
      data: { deletedAt: new Date(), publishedAt: null },
    });
    await invalidateBlogCaches({ slugs: [existing.slug], postId: id });
  },
};

