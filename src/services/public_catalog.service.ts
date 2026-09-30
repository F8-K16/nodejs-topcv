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
  cacheSetJson,
} from "../utils/cache";
import { locationService } from "./location.service";
import {
  buildCategoryTree,
} from "../utils/category_hierarchy";
import { prisma } from "../utils/prisma";
import {
  resolvePublicFeatures,
  type PublicFeatures,
} from "../utils/feature-flags";

export type PublicMetadataPayload = {
  categories: unknown;
  categoryTree: unknown;
  categoryParents: unknown;
  provinces: unknown;
  JOB_TYPE_OPTIONS: typeof JOB_TYPE_OPTIONS;
  EXPERIENCE_OPTIONS: typeof EXPERIENCE_OPTIONS;
  SalaryRange: typeof SalaryRange;
  SalaryRangeOptions: typeof SalaryRangeOptions;
  features: PublicFeatures;
};

type PublicMetadataCategoriesCache = Pick<
  PublicMetadataPayload,
  "categories" | "categoryTree" | "categoryParents"
>;

function currentPublicFeatures(): PublicFeatures {
  return resolvePublicFeatures({
    aiEnabled: env.AI_ENABLED,
    geminiApiKey: env.GEMINI_API_KEY,
    opensearchEnabled: env.OPENSEARCH_ENABLED,
    opensearchNode: env.OPENSEARCH_NODE,
  });
}

function getPublicMetadataStaticOptions(): Omit<
  PublicMetadataPayload,
  "categories" | "categoryTree" | "categoryParents" | "provinces" | "features"
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
      return {
        ...hit,
        ...staticOpts,
        provinces,
        features: currentPublicFeatures(),
      };
    }
  }

  const parents = await prisma.categoryParent.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true, slug: true },
    orderBy: { name: "asc" },
  });
  const children = await prisma.category.findMany({
    where: { deletedAt: null },
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
    features: currentPublicFeatures(),
  };

  if (env.CACHE_ENABLED) {
    await cacheSetJson(
      key,
      {
        categories: payload.categories,
        categoryTree: payload.categoryTree,
        categoryParents: payload.categoryParents,
      },
      env.CACHE_TTL_METADATA_SEC,
    );
  }

  return { ...payload, features: currentPublicFeatures() };
}
