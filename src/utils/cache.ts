import { createHash, randomUUID } from "crypto";

import { env } from "../config/env";
import { initRedis } from "./redis";
import { logger } from "./logger";

const PREFIX = "jp:cache:";

export const PUBLIC_SURFACE_VERSION_KEY = `${PREFIX}v1:ver:public-surface`;

export const CacheKeys = {
  adminDashboardSummary: `${PREFIX}v1:admin:dashboard:summary`,
  siteSettings: `${PREFIX}v1:site:settings:1`,
  skillsSelect: `${PREFIX}v1:admin:skills:select`,
  skillsList: (hash: string) => `${PREFIX}v1:admin:skills:list:${hash}`,
  salaryInsights: (by: string) => `${PREFIX}v1:insights:salary:${by}`,
  jobsPublic: (surfaceVersion: string, hash: string) =>
    `${PREFIX}v1:jobs:public:${surfaceVersion}:${hash}`,
  publicMetadata: `${PREFIX}v1:public:metadata`,
  provinces: `${PREFIX}v1:location:provinces`,
  districts: (provinceId: number) =>
    `${PREFIX}v1:location:districts:${provinceId}`,
  companiesPublic: (surfaceVersion: string, hash: string) =>
    `${PREFIX}v1:companies:public:${surfaceVersion}:${hash}`,
  companyPublicDetail: (id: number) =>
    `${PREFIX}v2:companies:public:detail:${id}`,
  topHiring: (surfaceVersion: string, limit: number) =>
    `${PREFIX}v1:companies:top-hiring:${surfaceVersion}:${limit}`,
  jobPublicDetail: (surfaceVersion: string, id: number) =>
    `${PREFIX}v4:jobs:public:detail:${surfaceVersion}:${id}`,
  jobPublicDetailLegacy: (id: number) => `${PREFIX}v2:jobs:public:detail:${id}`,
  jobsRecommended: (userId: number, queryHash: string) =>
    `${PREFIX}v1:jobs:recommended:${userId}:${queryHash}`,
  cvTemplatesPublicList: `${PREFIX}v1:cv:templates:public:list`,
  cvTemplatesAdminList: `${PREFIX}v1:cv:templates:admin:list`,
  cvTemplatePublicDetail: (id: number) =>
    `${PREFIX}v1:cv:templates:public:${id}`,
  aiCvSuggest: (userId: number, hash: string) =>
    `${PREFIX}v1:ai:cv:suggest:${userId}:${hash}`,
  aiCoverLetter: (userId: number, hash: string) =>
    `${PREFIX}v1:ai:apply:cover-letter:${userId}:${hash}`,
  aiJobQuestions: (userId: number, hash: string) =>
    `${PREFIX}v1:ai:job:questions:${userId}:${hash}`,
  aiCvReviewJob: (userId: number, hash: string) =>
    `${PREFIX}v1:ai:cv:review-job:${userId}:${hash}`,
  aiCvMatchScore: (userId: number, hash: string) =>
    `${PREFIX}v1:ai:cv:match-score:${userId}:${hash}`,
  /** Trích text PDF (pdf-parse + OCR) theo ứng viên + resume + phiên bản file */
  resumePdfExtractedForAi: (
    candidateId: number,
    resumeId: number,
    versionHash: string,
  ) =>
    `${PREFIX}v1:ai:resume:pdf-extract:${candidateId}:${resumeId}:${versionHash}`,
  aiJobsRerank: (userId: number, hash: string) =>
    `${PREFIX}v1:ai:jobs:rerank:${userId}:${hash}`,
  blogPublicList: (hash: string) => `${PREFIX}v1:blog:public:list:${hash}`,
  blogPublicDetail: (slug: string) =>
    `${PREFIX}v1:blog:public:detail:${encodeURIComponent(slug)}`,
  blogAdminList: (hash: string) => `${PREFIX}v1:blog:admin:list:${hash}`,
  blogAdminDetail: (id: number) => `${PREFIX}v1:blog:admin:detail:${id}`,
  contactAdminList: (hash: string) => `${PREFIX}v1:contact:admin:list:${hash}`,
  candidateApplications: (userId: number) =>
    `${PREFIX}v1:candidate:${userId}:applications`,
  candidateAppliedJobIds: (userId: number) =>
    `${PREFIX}v1:candidate:${userId}:applied-job-ids`,
} as const;

const skillsListPattern = `${PREFIX}v1:admin:skills:list:*`;
const locationDistrictsPattern = `${PREFIX}v1:location:districts:*`;
const blogPublicListPattern = `${PREFIX}v1:blog:public:list:*`;
const blogAdminListPattern = `${PREFIX}v1:blog:admin:list:*`;
const contactAdminListPattern = `${PREFIX}v1:contact:admin:list:*`;

export function authUserCacheKey(userId: number): string {
  return `${PREFIX}v1:auth:user:${userId}`;
}

export async function getPublicSurfaceVersion(): Promise<string> {
  if (!env.CACHE_ENABLED) return "0";
  try {
    const r = await initRedis();
    const v = await r.get(PUBLIC_SURFACE_VERSION_KEY);
    return v ?? "0";
  } catch (e) {
    logger.warn("getPublicSurfaceVersion failed", { error: String(e) });
    return "0";
  }
}

export async function bumpPublicSurfaceVersion(): Promise<void> {
  if (!env.CACHE_ENABLED) return;
  try {
    const r = await initRedis();
    await r.incr(PUBLIC_SURFACE_VERSION_KEY);
  } catch (e) {
    logger.warn("bumpPublicSurfaceVersion failed", { error: String(e) });
  }
}

export type JobCacheInvalidation = {
  jobId?: number;
  companyId?: number;
};

function jsonReplacer(_key: string, value: unknown) {
  if (typeof value === "bigint") return value.toString();
  return value;
}

export function stableCacheHash(payload: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(payload, jsonReplacer))
    .digest("hex")
    .slice(0, 40);
}

function formatCacheLogKey(fullKey: string): string {
  if (!fullKey.startsWith(PREFIX)) return fullKey;
  const rest = fullKey.slice(PREFIX.length);
  return rest.replace(/:[a-f0-9]{40}\b/gi, ":*");
}

function truthyQueryFlag(value: unknown): boolean {
  if (value === true || value === 1) return true;
  if (typeof value === "string") {
    const s = value.trim().toLowerCase();
    return s === "true" || s === "1" || s === "yes";
  }
  return false;
}

export function isPublicJobFeaturedFilterActive(value: unknown): boolean {
  if (value === true) return true;
  if (value === "true") return true;
  if (typeof value === "string" && value.trim() === "true") return true;
  return false;
}

function normalizeOptionalIntKey(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function normalizeDistrictIdsKey(value: unknown): string {
  if (value == null) return "";
  if (!Array.isArray(value)) return "";
  const nums = value
    .map((x) => Number(x))
    .filter((n) => Number.isFinite(n))
    .map((n) => Math.trunc(n));
  return [...new Set(nums)].sort((a, b) => a - b).join(",");
}

function normalizeCategoryIdsKey(value: unknown): string {
  if (value == null) return "";
  const raw = Array.isArray(value)
    ? value.flatMap((x) => (typeof x === "string" ? x.split(",") : [x]))
    : typeof value === "string"
      ? value.split(",")
      : [];
  const nums = raw
    .map((x) => Number(x))
    .filter((n) => Number.isFinite(n))
    .map((n) => Math.trunc(n));
  return [...new Set(nums)].sort((a, b) => a - b).join(",");
}

export function normalizeJobListQueryForFingerprint(query: {
  page?: unknown;
  limit?: unknown;
  search?: unknown;
  companyId?: unknown;
  provinceId?: unknown;
  districtId?: unknown;
  districtIds?: unknown;
  parentCategoryId?: unknown;
  categoryId?: unknown;
  categoryIds?: unknown;
  jobType?: unknown;
  experienceLevel?: unknown;
  salaryRange?: unknown;
  fromDate?: unknown;
  toDate?: unknown;
  isFeatured?: unknown;
}) {
  const page = Math.max(1, Math.floor(Number(query.page)) || 1);
  const limit = Math.max(1, Math.floor(Number(query.limit)) || 12);
  const search =
    query.search != null && query.search !== ""
      ? String(query.search).trim()
      : "";
  const isFeatured = isPublicJobFeaturedFilterActive(query.isFeatured)
    ? "true"
    : "";
  const categoryIds = normalizeCategoryIdsKey(query.categoryIds);
  return {
    mode: "public" as const,
    page,
    limit,
    search,
    companyId: normalizeOptionalIntKey(query.companyId),
    provinceId: normalizeOptionalIntKey(query.provinceId),
    districtIds: normalizeDistrictIdsKey(query.districtIds),
    districtId: normalizeOptionalIntKey(query.districtId),
    parentCategoryId: normalizeOptionalIntKey(query.parentCategoryId),
    categoryId: categoryIds ? null : normalizeOptionalIntKey(query.categoryId),
    categoryIds,
    jobType:
      query.jobType != null && String(query.jobType).trim() !== ""
        ? String(query.jobType).trim()
        : "",
    experienceLevel:
      query.experienceLevel != null &&
      String(query.experienceLevel).trim() !== ""
        ? String(query.experienceLevel).trim()
        : "",
    salaryRange:
      query.salaryRange != null && String(query.salaryRange).trim() !== ""
        ? String(query.salaryRange).trim()
        : "",
    fromDate:
      query.fromDate != null && String(query.fromDate).trim() !== ""
        ? String(query.fromDate).trim()
        : "",
    toDate:
      query.toDate != null && String(query.toDate).trim() !== ""
        ? String(query.toDate).trim()
        : "",
    isFeatured,
  };
}

export function fingerprintJobsPublicQuery(query: {
  page?: unknown;
  limit?: unknown;
  search?: unknown;
  companyId?: unknown;
  provinceId?: unknown;
  districtId?: unknown;
  districtIds?: unknown;
  parentCategoryId?: unknown;
  categoryId?: unknown;
  categoryIds?: unknown;
  jobType?: unknown;
  experienceLevel?: unknown;
  salaryRange?: unknown;
  fromDate?: unknown;
  toDate?: unknown;
  isFeatured?: unknown;
}): string {
  return stableCacheHash(normalizeJobListQueryForFingerprint(query));
}

export function normalizeCompaniesPublicQuery(query: Record<string, unknown>) {
  const page = Math.max(1, Math.floor(Number(query.page)) || 1);
  const limit = Math.max(1, Math.floor(Number(query.limit)) || 12);
  const search =
    query.search != null && query.search !== ""
      ? String(query.search).trim()
      : "";
  const statusRaw = query.status;
  const status =
    statusRaw === null || statusRaw === undefined || statusRaw === ""
      ? ""
      : truthyQueryFlag(statusRaw)
        ? "true"
        : "false";
  const allFlag = truthyQueryFlag(query.all);
  return {
    page,
    limit,
    search,
    status,
    provinceId: normalizeOptionalIntKey(query.provinceId),
    districtId: normalizeOptionalIntKey(query.districtId),
    categoryId: normalizeOptionalIntKey(query.categoryId),
    all: allFlag,
  };
}

export function fingerprintCompaniesPublicQuery(
  query: Record<string, unknown>,
): string {
  return stableCacheHash(normalizeCompaniesPublicQuery(query));
}

export async function cacheGetJson<T>(fullKey: string): Promise<T | null> {
  if (!env.CACHE_ENABLED) return null;
  try {
    const r = await initRedis();
    const raw = await r.get(fullKey);
    if (!raw) {
      if (env.CACHE_DEBUG) {
        logger.debug("cache.miss", { key: formatCacheLogKey(fullKey) });
      }
      return null;
    }
    if (env.CACHE_DEBUG) {
      logger.debug("cache.hit", { key: formatCacheLogKey(fullKey) });
    }
    return JSON.parse(raw) as T;
  } catch (e) {
    logger.warn("cache.get failed", { key: fullKey, error: String(e) });
    return null;
  }
}

export async function cacheSetJson(
  fullKey: string,
  value: unknown,
  ttlSec: number,
): Promise<void> {
  if (!env.CACHE_ENABLED) return;
  try {
    const r = await initRedis();
    await r.setEx(fullKey, ttlSec, JSON.stringify(value, jsonReplacer));
  } catch (e) {
    logger.warn("cache.set failed", { key: fullKey, error: String(e) });
  }
}

async function sleep(ms: number): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, ms));
}

async function acquireLock(
  fullKey: string,
  ttlSec: number,
): Promise<string | null> {
  if (!env.CACHE_ENABLED) return null;
  try {
    const r = await initRedis();
    const token = randomUUID();
    const ok = await r.set(fullKey, token, { NX: true, EX: ttlSec });
    return ok ? token : null;
  } catch (e) {
    logger.warn("cache.lock acquire failed", {
      key: fullKey,
      error: String(e),
    });
    return null;
  }
}

async function releaseLock(fullKey: string, token: string): Promise<void> {
  if (!env.CACHE_ENABLED) return;
  try {
    const r = await initRedis();
    const script =
      "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end";
    await r.eval(script, { keys: [fullKey], arguments: [token] });
  } catch (e) {
    logger.warn("cache.lock release failed", {
      key: fullKey,
      error: String(e),
    });
  }
}

export async function cacheGetOrSetJsonWithLock<T>(
  fullKey: string,
  ttlSec: number,
  loader: () => Promise<T>,
  opts?: {
    lockTtlSec?: number;
    waitMs?: number;
    waitTries?: number;
  },
): Promise<T> {
  if (!env.CACHE_ENABLED) {
    return loader();
  }

  const hit = await cacheGetJson<T>(fullKey);
  if (hit != null) return hit;

  const lockKey = `${fullKey}:lock`;
  const lockTtlSec = Math.max(1, Math.floor(opts?.lockTtlSec ?? 8));
  const token = await acquireLock(lockKey, lockTtlSec);

  if (!token) {
    const tries = Math.max(0, Math.floor(opts?.waitTries ?? 5));
    const waitMs = Math.max(0, Math.floor(opts?.waitMs ?? 120));
    for (let i = 0; i < tries; i += 1) {
      const jitter = Math.floor(Math.random() * Math.max(1, waitMs / 4));
      await sleep(waitMs + jitter);
      const after = await cacheGetJson<T>(fullKey);
      if (after != null) return after;
    }
    return loader();
  }

  try {
    const afterLock = await cacheGetJson<T>(fullKey);
    if (afterLock != null) return afterLock;
    const value = await loader();
    await cacheSetJson(fullKey, value, ttlSec);
    return value;
  } finally {
    await releaseLock(lockKey, token);
  }
}

export async function cacheSetJsonPersistent(
  fullKey: string,
  value: unknown,
): Promise<void> {
  if (!env.CACHE_ENABLED) return;
  try {
    const r = await initRedis();
    await r.set(fullKey, JSON.stringify(value, jsonReplacer));
  } catch (e) {
    logger.warn("cache.set persistent failed", {
      key: fullKey,
      error: String(e),
    });
  }
}

export async function cacheDel(fullKey: string): Promise<void> {
  if (!env.CACHE_ENABLED) return;
  try {
    const r = await initRedis();
    await r.del(fullKey);
  } catch (e) {
    logger.warn("cache.del failed", { key: fullKey, error: String(e) });
  }
}

export async function cacheDelPattern(match: string): Promise<void> {
  if (!env.CACHE_ENABLED) return;
  try {
    const r = await initRedis();
    for await (const key of r.scanIterator({ MATCH: match, COUNT: 128 })) {
      await r.del(key);
    }
  } catch (e) {
    logger.warn("cache.delPattern failed", { match, error: String(e) });
  }
}

const applicationCacheScanPattern = `${PREFIX}*`;

/**
 * Xóa mọi key HTTP/API cache của ứng dụng (`jp:cache:*`).
 * Không xóa session, JWT refresh, BullMQ hay key ngoài tiền tố này.
 */
export async function clearApplicationHttpCache(): Promise<number> {
  let deleted = 0;
  const r = await initRedis();
  for await (const key of r.scanIterator({
    MATCH: applicationCacheScanPattern,
    COUNT: 256,
  })) {
    await r.del(key);
    deleted += 1;
  }
  return deleted;
}

export async function cacheDelRecommendedJobsForUser(
  userId: number,
): Promise<void> {
  await cacheDelPattern(`${PREFIX}v1:jobs:recommended:${userId}:*`);
}

export async function cacheDelAiCvSuggestForUser(userId: number): Promise<void> {
  await cacheDelPattern(`${PREFIX}v1:ai:cv:suggest:${userId}:*`);
}

/** @deprecated — use bumpPublicSurfaceVersion */
export async function cacheDelJobsPublicListEntries(): Promise<void> {
  await bumpPublicSurfaceVersion();
}

export async function invalidatePublicMetadataCache(): Promise<void> {
  await cacheDel(CacheKeys.publicMetadata);
}

export async function invalidateLocationCaches(): Promise<void> {
  await Promise.all([
    cacheDel(CacheKeys.provinces),
    cacheDelPattern(locationDistrictsPattern),
  ]);
}

export async function invalidateLocationCachesForProvince(
  provinceId: number,
): Promise<void> {
  if (!Number.isFinite(provinceId) || provinceId <= 0) return;
  await Promise.all([
    cacheDel(CacheKeys.provinces),
    cacheDel(CacheKeys.districts(Math.trunc(provinceId))),
  ]);
}

export async function invalidateUserAuthDataCache(
  userId: number,
): Promise<void> {
  try {
    const r = await initRedis();
    await r.del(authUserCacheKey(userId));
    await r.del(`user_permissions:${userId}`);
    await r.del(`jp:auth:v1:perm:${userId}`);
  } catch (e) {
    logger.warn("invalidateUserAuthDataCache failed", {
      userId,
      error: String(e),
    });
  }
}

export async function invalidateJobCaches(
  opts?: JobCacheInvalidation,
): Promise<void> {
  const tasks: Promise<void>[] = [
    cacheDel(CacheKeys.adminDashboardSummary),
    bumpPublicSurfaceVersion(),
  ];
  if (opts?.jobId != null) {
    tasks.push(cacheDel(CacheKeys.jobPublicDetailLegacy(opts.jobId)));
  }
  if (opts?.companyId != null) {
    tasks.push(cacheDel(CacheKeys.companyPublicDetail(opts.companyId)));
  }
  await Promise.all(tasks);
}

export async function invalidateSkillCaches(): Promise<void> {
  await Promise.all([
    cacheDelPattern(skillsListPattern),
    cacheDel(CacheKeys.skillsSelect),
    cacheDel(CacheKeys.adminDashboardSummary),
    bumpPublicSurfaceVersion(),
  ]);
}

export async function invalidateBlogCaches(opts?: {
  slugs?: string[];
  postId?: number;
}): Promise<void> {
  const tasks: Promise<void>[] = [
    cacheDelPattern(blogPublicListPattern),
    cacheDelPattern(blogAdminListPattern),
  ];
  for (const slug of opts?.slugs ?? []) {
    const trimmed = slug.trim();
    if (trimmed) tasks.push(cacheDel(CacheKeys.blogPublicDetail(trimmed)));
  }
  if (opts?.postId != null && Number.isFinite(opts.postId)) {
    tasks.push(cacheDel(CacheKeys.blogAdminDetail(Math.trunc(opts.postId))));
  }
  await Promise.all(tasks);
}

export async function invalidateContactAdminCaches(): Promise<void> {
  await cacheDelPattern(contactAdminListPattern);
}

export async function invalidateCandidateApplicationCaches(
  userId: number,
): Promise<void> {
  if (!Number.isFinite(userId) || userId <= 0) return;
  const id = Math.trunc(userId);
  await Promise.all([
    cacheDel(CacheKeys.candidateApplications(id)),
    cacheDel(CacheKeys.candidateAppliedJobIds(id)),
  ]);
}

export async function invalidateSiteSettingsCache(): Promise<void> {
  await cacheDel(CacheKeys.siteSettings);
}

export async function invalidateAdminDashboard(): Promise<void> {
  await cacheDel(CacheKeys.adminDashboardSummary);
}

export async function invalidateAfterCategoryChange(): Promise<void> {
  await Promise.all([invalidatePublicMetadataCache(), invalidateJobCaches()]);
}

export async function invalidateCvTemplateCaches(
  templateId?: number,
): Promise<void> {
  const tasks: Promise<void>[] = [
    cacheDel(CacheKeys.cvTemplatesPublicList),
    cacheDel(CacheKeys.cvTemplatesAdminList),
  ];
  if (templateId != null && Number.isFinite(templateId)) {
    tasks.push(
      cacheDel(CacheKeys.cvTemplatePublicDetail(Math.trunc(templateId))),
    );
  } else {
    tasks.push(cacheDelPattern(`${PREFIX}v1:cv:templates:public:*`));
  }
  await Promise.all(tasks);
}
