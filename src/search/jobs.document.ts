import { Prisma, JobModerationStatus } from "../generated/prisma/client";

import type { WorkMode } from "./search_intent";

export type JobWithIndexRelations = Prisma.JobGetPayload<{
  include: {
    company: { include: { province: true; district: true } };
    category: true;
    jobSkills: { include: { skill: true } };
  };
}>;

export type JobSearchDocument = {
  id: number;
  title: string;
  description: string;
  workLocation: string | null;
  workMode: WorkMode | null;
  minSalary: number | null;
  maxSalary: number | null;
  jobType: string;
  experienceLevel: string;
  moderationStatus: string;
  deadline: string | null;
  isFeatured: boolean;
  createdAt: string;
  updatedAt: string;
  viewCount: number;
  companyId: number;
  companyName: string;
  companyStatus: boolean;
  provinceId: number | null;
  provinceName: string | null;
  districtId: number | null;
  districtName: string | null;
  categoryId: number;
  categoryName: string;
  skillIds: number[];
  skillNames: string[];
  suggest: { input: string[] };
};

export const shouldIndexPublicJob = (job: JobWithIndexRelations) => {
  if (job.deletedAt) return false;
  if (job.moderationStatus !== JobModerationStatus.APPROVED) return false;
  if (!job.company.status) return false;
  if (job.company.deletedAt) return false;
  if (job.category.deletedAt) return false;
  if (job.deadline && job.deadline < new Date()) return false;
  return true;
};

const inferWorkMode = (job: JobWithIndexRelations): WorkMode | null => {
  const raw = [
    job.workLocation ?? "",
    job.title ?? "",
    job.description ?? "",
  ]
    .join(" ")
    .toLowerCase();

  const hasHybrid =
    raw.includes("hybrid") || raw.includes("kết hợp") || raw.includes("ket hop");
  const hasRemote =
    raw.includes("remote") ||
    raw.includes("wfh") ||
    raw.includes("work from home") ||
    raw.includes("từ xa") ||
    raw.includes("tu xa") ||
    raw.includes("làm việc từ xa") ||
    raw.includes("lam viec tu xa");
  const hasOnsite =
    raw.includes("onsite") ||
    raw.includes("on-site") ||
    raw.includes("tại văn phòng") ||
    raw.includes("tai van phong") ||
    raw.includes("văn phòng") ||
    raw.includes("van phong") ||
    raw.includes("office");

  if (hasHybrid) return "HYBRID";
  if (hasRemote) return "REMOTE";
  if (hasOnsite) return "ONSITE";
  return null;
};

export const toJobSearchDocument = (job: JobWithIndexRelations): JobSearchDocument => {
  const skillNames = (job.jobSkills ?? [])
    .filter((js) => !js.skill?.deletedAt)
    .map((js) => js.skill?.name)
    .filter((x): x is string => typeof x === "string" && x.trim() !== "");
  const skillIds = (job.jobSkills ?? [])
    .filter((js) => !js.skill?.deletedAt)
    .map((js) => js.skill?.id)
    .filter((x): x is number => typeof x === "number" && Number.isFinite(x));

  const provinceName = job.company.province?.name ?? null;
  const districtName = job.company.district?.name ?? null;

  const suggestInputs = [
    job.title,
    job.company.name,
    job.category.name,
    provinceName ?? "",
    districtName ?? "",
    ...skillNames,
  ]
    .map((s) => String(s ?? "").trim())
    .filter((s) => s.length > 0);

  return {
    id: job.id,
    title: job.title,
    description: job.description,
    workLocation: job.workLocation ?? null,
    workMode: inferWorkMode(job),
    minSalary: job.minSalary ?? null,
    maxSalary: job.maxSalary ?? null,
    jobType: job.jobType,
    experienceLevel: job.experienceLevel,
    moderationStatus: job.moderationStatus,
    deadline: job.deadline ? job.deadline.toISOString() : null,
    isFeatured: job.isFeatured,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
    viewCount: job.viewCount ?? 0,
    companyId: job.companyId,
    companyName: job.company.name,
    companyStatus: Boolean(job.company.status),
    provinceId: job.company.provinceId ?? null,
    provinceName,
    districtId: job.company.districtId ?? null,
    districtName,
    categoryId: job.categoryId,
    categoryName: job.category.name,
    skillIds,
    skillNames,
    suggest: { input: suggestInputs },
  };
};
