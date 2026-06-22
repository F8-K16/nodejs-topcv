import {
  EXPERIENCE_OPTIONS,
  JOB_TYPE_OPTIONS,
  SalaryRange,
  SalaryRangeOptions,
} from "../types/job.type";
import { env } from "../config/env";
import {
  CacheKeys,
  cacheGetJson,
  cacheSetJsonPersistent,
} from "../utils/cache";
import { locationService } from "./location.service";
import {
  buildCategoryTree,
} from "../utils/category_hierarchy";
import { prisma } from "../utils/prisma";

export type PublicMetadataPayload = {
  categories: unknown;
  categoryTree: unknown;
  categoryParents: unknown;
  provinces: unknown;
  JOB_TYPE_OPTIONS: typeof JOB_TYPE_OPTIONS;
  EXPERIENCE_OPTIONS: typeof EXPERIENCE_OPTIONS;
  SalaryRange: typeof SalaryRange;
  SalaryRangeOptions: typeof SalaryRangeOptions;
};

type PublicMetadataCategoriesCache = Pick<
  PublicMetadataPayload,
  "categories" | "categoryTree" | "categoryParents"
>;

function getPublicMetadataStaticOptions(): Omit<
  PublicMetadataPayload,
  "categories" | "categoryTree" | "categoryParents" | "provinces"
> {
  return {
    JOB_TYPE_OPTIONS,
    EXPERIENCE_OPTIONS,
    SalaryRange,
    SalaryRangeOptions,
  };
}

export async function getPublicMetadata(): Promise<PublicMetadataPayload> {
  const key = CacheKeys.publicMetadata;
  const provinces = await locationService.getProvinces();
  const staticOpts = getPublicMetadataStaticOptions();

  if (env.CACHE_ENABLED) {
    const hit = await cacheGetJson<PublicMetadataCategoriesCache>(key);
    if (hit) {
      return { ...hit, ...staticOpts, provinces };
    }
  }

  const parents = await prisma.categoryParent.findMany({
    select: { id: true, name: true, slug: true },
    orderBy: { name: "asc" },
  });
  const children = await prisma.category.findMany({
    select: { id: true, name: true, slug: true, parentCategoryId: true },
    orderBy: [{ parentCategoryId: "asc" }, { name: "asc" }],
  });
  const flat = [
    ...parents.map((p) => ({
      id: -p.id,
      name: p.name,
      slug: p.slug,
      parentId: null as number | null,
    })),
    ...children.map((c) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      parentId: -c.parentCategoryId,
    })),
  ];
  const tree = buildCategoryTree(flat);

  const payload: PublicMetadataPayload = {
    ...staticOpts,
    categories: flat,
    categoryTree: tree,
    categoryParents: parents,
    provinces,
  };

  if (env.CACHE_ENABLED) {
    await cacheSetJsonPersistent(key, {
      categories: payload.categories,
      categoryTree: payload.categoryTree,
      categoryParents: payload.categoryParents,
    });
  }

  return payload;
}
