import { prisma } from "../utils/prisma";

export type WorkMode = "REMOTE" | "HYBRID" | "ONSITE";

export const normalizeForSearch = (input: string) => {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
};

type ProvinceIntentRow = { id: number; norm: string };

let provinceCachePromise: Promise<ProvinceIntentRow[]> | null = null;

const loadProvincesForIntent = async (): Promise<ProvinceIntentRow[]> => {
  if (!provinceCachePromise) {
    provinceCachePromise = prisma.province
      .findMany({ select: { id: true, name: true } })
      .then((rows) =>
        rows.map((p) => ({ id: p.id, norm: normalizeForSearch(p.name) })),
      );
  }
  return provinceCachePromise!;
};

const findProvinceIdFromQuery = async (raw: string): Promise<number | null> => {
  const q = normalizeForSearch(raw);
  if (!q) return null;

  const aliasToNorm: Array<[RegExp, string]> = [
    [/\b(tp\s*)?hcm\b/g, "ho chi minh"],
    [/\bsg\b/g, "ho chi minh"],
    [/\bsaigon\b/g, "ho chi minh"],
    [/\bhcmc\b/g, "ho chi minh"],
    [/\bhn\b/g, "ha noi"],
    [/\bhanoi\b/g, "ha noi"],
  ];

  let expanded = q;
  for (const [re, to] of aliasToNorm) {
    expanded = expanded.replace(re, to);
  }

  const provinces = await loadProvincesForIntent();

  for (const p of provinces) {
    if (!p.norm) continue;
    if (expanded.includes(p.norm)) return p.id;
  }

  return null;
};

const detectWorkMode = (raw: string): WorkMode | null => {
  const q = normalizeForSearch(raw);
  if (!q) return null;

  const isHybrid = /\bhybrid\b/.test(q) || /\bket hop\b/.test(q);
  const isRemote =
    /\bremote\b/.test(q) ||
    /\bwfh\b/.test(q) ||
    /\bwork from home\b/.test(q) ||
    /\btu xa\b/.test(q) ||
    /\blam viec tu xa\b/.test(q) ||
    /\bonline\b/.test(q);
  const isOnsite =
    /\bonsite\b/.test(q) ||
    /\bon site\b/.test(q) ||
    /\btai van phong\b/.test(q) ||
    /\bvan phong\b/.test(q) ||
    /\boffice\b/.test(q);

  if (isHybrid) return "HYBRID";
  if (isRemote) return "REMOTE";
  if (isOnsite) return "ONSITE";
  return null;
};

const stripIntentTokens = (raw: string) => {
  let s = raw;

  const patterns: RegExp[] = [
    /\b(tp\s*)?hcm\b/gi,
    /\bhcmc\b/gi,
    /\bsg\b/gi,
    /\bsaigon\b/gi,
    /\bhn\b/gi,
    /\bhanoi\b/gi,
    /\bremote\b/gi,
    /\bwfh\b/gi,
    /\bwork from home\b/gi,
    /\bhybrid\b/gi,
    /\bonsite\b/gi,
    /\bon-site\b/gi,
    /\bon site\b/gi,
    /\boffice\b/gi,
  ];

  for (const re of patterns) {
    s = s.replace(re, " ");
  }

  return s.replace(/\s+/g, " ").trim();
};

export const parseJobSearchIntent = async (raw: string) => {
  const cleanedQuery = stripIntentTokens(raw);
  const provinceId = await findProvinceIdFromQuery(raw);
  const workMode = detectWorkMode(raw);
  return { cleanedQuery, provinceId, workMode };
};
