import {
  type ApplicationStatus,
  EmployerStatus,
  JobModerationStatus,
  Prisma,
} from "../generated/prisma/client";

import { prisma } from "../utils/prisma";
import { HttpException } from "../utils/exception";
import { jobService } from "./job.service";
import { applicationService } from "./application.service";
import { companyService } from "./company.service";
import { skillService } from "./skill.service";
import type { JobDTO } from "../types/job.type";
import { NotificationType, notificationService } from "./notification.service";
import { resolveResumePreviewForEmployer } from "../utils/application-resume-preview";

async function getApprovedEmployer(userId: number) {
  const employer = await prisma.employer.findUnique({
    where: { userId },
    include: {
      company: {
        select: { id: true, name: true, logo: true, status: true },
      },
      user: { select: { id: true, username: true, email: true } },
    },
  });

  if (!employer) {
    throw new HttpException("Employer profile not found", 403);
  }

  if (employer.status !== "APPROVED") {
    throw new HttpException("Employer account is not approved yet", 403);
  }

  return employer;
}

function requireCompanyId(
  employer: Awaited<ReturnType<typeof getApprovedEmployer>>,
): number {
  const id = employer.companyId;
  if (id == null) {
    throw new HttpException("Employer is not linked to a company", 400);
  }
  return id;
}

function requireCompanyActive(
  employer: Awaited<ReturnType<typeof getApprovedEmployer>>,
) {
  if (employer.company?.status === false) {
    throw new HttpException(
      "Công ty đã ngừng hoạt động. Bạn không thể cập nhật thông tin hay đăng/sửa tin tuyển dụng. Liên hệ bộ phận hỗ trợ qua email hoặc hotline trên website để được giải thích chi tiết.",
      403,
    );
  }
}

async function canEmployerAccessSuggestedCandidate(
  companyId: number,
  candidateId: number,
): Promise<boolean> {
  const hasApplication = await prisma.application.findFirst({
    where: {
      candidateId,
      job: { companyId },
    },
    select: { id: true },
  });
  if (hasApplication) return true;

  const jobCategoryRows = await prisma.job.findMany({
    where: {
      companyId,
      deletedAt: null,
      moderationStatus: JobModerationStatus.APPROVED,
    },
    select: { categoryId: true },
    distinct: ["categoryId"],
  });
  const categoryIds = jobCategoryRows.map((j) => j.categoryId);
  if (categoryIds.length === 0) return false;

  const prefRows = await prisma.candidateCategory.findMany({
    where: { candidateId },
    select: { categoryId: true },
  });
  const selected = prefRows.map((r) => r.categoryId);
  if (!selected.length) return false;

  const expanded = new Set<number>(selected);
  for (const id of categoryIds) {
    if (expanded.has(id)) return true;
  }
  return false;
}

export type EmployerCreateJobInput = Omit<
  JobDTO,
  "companyId" | "employerId" | "moderationStatus" | "isFeatured"
>;

function parseApplicationStatus(raw: unknown): ApplicationStatus | undefined {
  if (typeof raw !== "string" || raw === "") return undefined;
  const allowed: ApplicationStatus[] = [
    "PENDING",
    "REVIEWED",
    "ACCEPTED",
    "REJECTED",
  ];
  return allowed.includes(raw as ApplicationStatus)
    ? (raw as ApplicationStatus)
    : undefined;
}

export const employerPortalService = {
  async me(userId: number) {
    const employer = await getApprovedEmployer(userId);
    return { employer, company: employer.company };
  },

  async listCompanyMembers(userId: number) {
    const employer = await getApprovedEmployer(userId);
    const companyId = requireCompanyId(employer);
    const rows = await prisma.employer.findMany({
      where: { companyId, status: EmployerStatus.APPROVED },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            email: true,
            userPhone: { select: { phone: true } },
          },
        },
      },
      orderBy: { id: "asc" },
    });
    return {
      members: rows.map((r) => ({
        employerId: r.id,
        userId: r.userId,
        username: r.user.username,
        email: r.user.email,
        phone: r.user.userPhone?.phone ?? null,
      })),
    };
  },

  async dashboard(userId: number) {
    const employer = await getApprovedEmployer(userId);
    const companyId = requireCompanyId(employer);

    const jobBase = { companyId } satisfies Prisma.JobWhereInput;

    const [
      jobsTotal,
      jobsPending,
      jobsApproved,
      jobsRejected,
      appsTotal,
      appsPending,
      appsReviewed,
      appsAccepted,
      appsRejected,
      recentJobs,
      recentApplications,
    ] = await Promise.all([
      prisma.job.count({ where: jobBase }),
      prisma.job.count({
        where: { ...jobBase, moderationStatus: JobModerationStatus.PENDING },
      }),
      prisma.job.count({
        where: { ...jobBase, moderationStatus: JobModerationStatus.APPROVED },
      }),
      prisma.job.count({
        where: { ...jobBase, moderationStatus: JobModerationStatus.REJECTED },
      }),
      prisma.application.count({
        where: { job: { companyId } },
      }),
      prisma.application.count({
        where: { job: { companyId }, status: "PENDING" },
      }),
      prisma.application.count({
        where: { job: { companyId }, status: "REVIEWED" },
      }),
      prisma.application.count({
        where: { job: { companyId }, status: "ACCEPTED" },
      }),
      prisma.application.count({
        where: { job: { companyId }, status: "REJECTED" },
      }),
      prisma.job.findMany({
        where: jobBase,
        orderBy: { id: "desc" },
        take: 6,
        include: {
          category: { select: { id: true, name: true } },
          _count: { select: { applications: true } },
        },
      }),
      prisma.application.findMany({
        where: { job: { companyId } },
        orderBy: { createdAt: "desc" },
        take: 8,
        include: {
          candidate: {
            include: {
              user: { select: { id: true, username: true, email: true } },
            },
          },
          job: { select: { id: true, title: true } },
          resume: { select: { id: true, title: true } },
        },
      }),
    ]);

    return {
      company: employer.company,
      user: employer.user,
      stats: {
        jobs: {
          total: jobsTotal,
          pending: jobsPending,
          approved: jobsApproved,
          rejected: jobsRejected,
        },
        applications: {
          total: appsTotal,
          pending: appsPending,
          reviewed: appsReviewed,
          accepted: appsAccepted,
          rejected: appsRejected,
        },
      },
      recentJobs,
      recentApplications,
    };
  },

  async jobAnalytics(userId: number) {
    const employer = await getApprovedEmployer(userId);
    const companyId = requireCompanyId(employer);

    const jobs = await prisma.job.findMany({
      where: { companyId, deletedAt: null },
      orderBy: { id: "desc" },
      take: 50,
      select: {
        id: true,
        title: true,
        slug: true,
        moderationStatus: true,
        viewCount: true,
        createdAt: true,
        _count: { select: { applications: true } },
        viewSources: {
          select: { source: true, views: true },
          orderBy: { views: "desc" },
        },
      },
    });

    const rows = jobs.map((job) => {
      const views = job.viewCount ?? 0;
      const applications = job._count.applications;
      const conversionRate =
        views > 0 ? Math.round((applications / views) * 1000) / 10 : 0;
      return {
        id: job.id,
        title: job.title,
        slug: job.slug,
        moderationStatus: job.moderationStatus,
        createdAt: job.createdAt,
        views,
        applications,
        conversionRate,
        sources: job.viewSources.map((s) => ({
          source: s.source,
          views: s.views,
        })),
      };
    });

    const totals = rows.reduce(
      (acc, row) => {
        acc.views += row.views;
        acc.applications += row.applications;
        return acc;
      },
      { views: 0, applications: 0 },
    );

    const sourceTotals = new Map<string, number>();
    for (const row of rows) {
      for (const src of row.sources) {
        sourceTotals.set(
          src.source,
          (sourceTotals.get(src.source) ?? 0) + src.views,
        );
      }
    }

    return {
      summary: {
        jobs: rows.length,
        views: totals.views,
        applications: totals.applications,
        conversionRate:
          totals.views > 0
            ? Math.round((totals.applications / totals.views) * 1000) / 10
            : 0,
      },
      sources: Array.from(sourceTotals.entries())
        .map(([source, views]) => ({ source, views }))
        .sort((a, b) => b.views - a.views),
      jobs: rows,
    };
  },

  async formMeta(userId: number) {
    const employer = await getApprovedEmployer(userId);
    const companyId = requireCompanyId(employer);
    const [company, categoryRows, parentCategories, skills] = await Promise.all([
      prisma.company.findUnique({
        where: { id: companyId },
        select: {
          id: true,
          name: true,
          description: true,
          logo: true,
          website: true,
          location: true,
          status: true,
          provinceId: true,
          districtId: true,
        },
      }),
      prisma.companyCategory.findMany({
        where: { companyId },
        include: {
          parentCategory: {
            select: { id: true, name: true, slug: true },
          },
        },
        orderBy: { parentCategoryId: "asc" },
      }),
      prisma.categoryParent.findMany({
        select: { id: true, name: true, slug: true },
        orderBy: [{ name: "asc" }],
      }),
      prisma.skill.findMany({
        where: { deletedAt: null },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
        take: 3000,
      }),
    ]);

    if (!company) {
      throw new HttpException("Company not found", 404);
    }

    const selectedParentCategoryIds = categoryRows.map((r) => r.parentCategoryId);
    const categories = selectedParentCategoryIds.length
      ? await prisma.category.findMany({
          where: { parentCategoryId: { in: selectedParentCategoryIds } },
          select: { id: true, name: true, slug: true, parentCategoryId: true },
          orderBy: [{ parentCategoryId: "asc" }, { name: "asc" }],
        })
      : [];

    return {
      company,
      categories,
      parentCategories,
      selectedParentCategoryIds,
      skills,
    };
  },

  async listSkills(userId: number, search = "") {
    await getApprovedEmployer(userId);
    const q = search.trim();
    const skills = await prisma.skill.findMany({
      where: {
        deletedAt: null,
        ...(q ? { name: { contains: q } } : {}),
      },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
      take: q ? 50 : 100,
    });
    return { skills };
  },

  async createSkill(userId: number, name: string) {
    await getApprovedEmployer(userId);
    const skill = await skillService.create(name.trim());
    return { id: skill.id, name: skill.name };
  },

  async updateCompanyProfile(
    userId: number,
    data: {
      name: string;
      description?: string;
      location: string;
      website?: string;
      logo?: string;
      provinceId: number;
      districtId: number;
      categoryIds: number[];
    },
  ) {
    const employer = await getApprovedEmployer(userId);
    const companyId = requireCompanyId(employer);
    requireCompanyActive(employer);
    const payload: Parameters<typeof companyService.updateCompany>[1] = {
      name: data.name,
      location: data.location,
      provinceId: data.provinceId,
      districtId: data.districtId,
      categoryIds: data.categoryIds,
    };
    if (data.description !== undefined) {
      payload.description = data.description;
    }
    if (data.website !== undefined) {
      payload.website = data.website;
    }
    if (data.logo !== undefined) {
      payload.logo = data.logo;
    }
    return companyService.updateCompany(companyId, payload);
  },

  async listJobs(userId: number, query: Record<string, unknown>) {
    const employer = await getApprovedEmployer(userId);
    const companyId = requireCompanyId(employer);
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(Math.max(1, Number(query.limit) || 12), 50);
    const skip = (page - 1) * limit;
    const search = typeof query.search === "string" ? query.search.trim() : "";
    const modRaw = query.moderationStatus;
    const modStr =
      typeof modRaw === "string" && modRaw.trim() !== ""
        ? modRaw.trim().toUpperCase()
        : null;
    const moderationFilter =
      modStr &&
      (Object.values(JobModerationStatus) as string[]).includes(modStr)
        ? (modStr as JobModerationStatus)
        : null;

    const where: Prisma.JobWhereInput = {
      companyId,
      deletedAt: null,
      ...(search ? { title: { contains: search } } : {}),
      ...(moderationFilter ? { moderationStatus: moderationFilter } : {}),
    };

    const [jobs, total] = await Promise.all([
      prisma.job.findMany({
        where,
        skip,
        take: limit,
        orderBy: { id: "desc" },
        include: {
          category: true,
          _count: { select: { applications: true } },
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
        totalPages: Math.ceil(total / limit) || 0,
      },
    };
  },

  async getJob(userId: number, jobId: number) {
    if (Number.isNaN(jobId)) {
      throw new HttpException("Invalid id", 400);
    }
    const employer = await getApprovedEmployer(userId);
    const companyId = requireCompanyId(employer);
    const job = await prisma.job.findFirst({
      where: { id: jobId, companyId },
      include: {
        category: true,
        jobSkills: { include: { skill: true } },
        _count: { select: { applications: true } },
      },
    });
    if (!job) {
      throw new HttpException("Job not found", 404);
    }
    return job;
  },

  async createJob(userId: number, data: EmployerCreateJobInput) {
    const employer = await getApprovedEmployer(userId);
    const companyId = requireCompanyId(employer);
    requireCompanyActive(employer);
    const result = await jobService.createJob({
      ...data,
      companyId,
      employerId: employer.id,
      moderationStatus: JobModerationStatus.PENDING,
      isFeatured: false,
    });
    await notificationService.notifyAdmins({
      type: NotificationType.JOB_PENDING_REVIEW,
      title: "Tin tuyển dụng chờ duyệt",
      body: `${employer.company?.name ?? "Công ty"} — "${data.title}".`,
    });

    const MS_24H = 24 * 60 * 60 * 1000;
    const dl = result?.deadline ? new Date(result.deadline) : null;
    if (dl && !Number.isNaN(dl.getTime())) {
      const end = dl.getTime();
      const now = Date.now();
      if (end > now && end - now < MS_24H) {
        await notificationService.createOne(userId, {
          type: NotificationType.JOB_DEADLINE_WITHIN_24H,
          title: "Hạn nhận hồ sơ dưới 24 giờ",
          body: `Tin "${data.title}" sẽ hết hạn nhận hồ sơ trước ${dl.toLocaleString("vi-VN")}. Bạn có thể chỉnh lại hạn trong mục sửa tin nếu cần thêm thời gian.`,
          appArea: "main",
        });
      }
    }

    return result;
  },

  async updateJob(
    userId: number,
    jobId: number,
    data: Partial<EmployerCreateJobInput>,
  ) {
    if (Number.isNaN(jobId)) {
      throw new HttpException("Invalid id", 400);
    }
    const employer = await getApprovedEmployer(userId);
    const companyId = requireCompanyId(employer);
    requireCompanyActive(employer);
    const job = await prisma.job.findFirst({
      where: { id: jobId, deletedAt: null },
    });
    if (!job || job.companyId !== companyId) {
      throw new HttpException("Job not found", 404);
    }

    return jobService.updateJob(jobId, {
      ...data,
      companyId,
      employerId: employer.id,
    });
  },

  async listApplications(userId: number, query: Record<string, unknown>) {
    const employer = await getApprovedEmployer(userId);
    const companyId = requireCompanyId(employer);
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(Math.max(1, Number(query.limit) || 20), 100);
    const skip = (page - 1) * limit;
    const jobIdRaw = query.jobId;
    const jobId =
      jobIdRaw != null && jobIdRaw !== "" && !Number.isNaN(Number(jobIdRaw))
        ? Number(jobIdRaw)
        : undefined;

    const statusFilter = parseApplicationStatus(query.status);

    if (jobId != null) {
      const job = await prisma.job.findFirst({
        where: { id: jobId, companyId },
      });
      if (!job) {
        throw new HttpException("Job not found", 404);
      }
    }

    const where: Prisma.ApplicationWhereInput = {
      job: {
        companyId,
        ...(jobId != null ? { id: jobId } : {}),
      },
      ...(statusFilter ? { status: statusFilter } : {}),
    };

    const [applications, total] = await Promise.all([
      prisma.application.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          candidate: {
            include: {
              user: {
                select: {
                  id: true,
                  email: true,
                  username: true,
                  userPhone: { select: { phone: true } },
                },
              },
              province: true,
              district: true,
            },
          },
          job: { select: { id: true, title: true } },
          resume: { select: { id: true, title: true, fileUrl: true } },
        },
      }),
      prisma.application.count({ where }),
    ]);

    return {
      applications,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 0,
      },
    };
  },

  async updateApplicationStatus(
    userId: number,
    applicationId: number,
    status: ApplicationStatus,
  ) {
    if (Number.isNaN(applicationId)) {
      throw new HttpException("Invalid id", 400);
    }
    const employer = await getApprovedEmployer(userId);
    const companyId = requireCompanyId(employer);
    const application = await prisma.application.findUnique({
      where: { id: applicationId },
      include: { job: { select: { companyId: true } } },
    });
    if (!application || application.job.companyId !== companyId) {
      throw new HttpException("Application not found", 404);
    }
    return applicationService.updateStatus(applicationId, status);
  },

  async getApplicationPreview(userId: number, applicationId: number) {
    if (!Number.isFinite(applicationId) || applicationId < 1) {
      throw new HttpException("Invalid id", 400);
    }
    const employer = await getApprovedEmployer(userId);
    const companyId = requireCompanyId(employer);

    const application = await prisma.application.findUnique({
      where: { id: applicationId },
      include: {
        job: { select: { id: true, title: true, companyId: true } },
        candidate: {
          include: {
            user: { select: { id: true, username: true, email: true } },
            province: { select: { name: true } },
            district: { select: { name: true } },
          },
        },
        resume: { select: { id: true, title: true, fileUrl: true } },
      },
    });

    if (!application || application.job.companyId !== companyId) {
      throw new HttpException("Không tìm thấy hồ sơ", 404);
    }

    const coverLetter = application.coverLetter?.trim() || null;

    let resume:
      | { kind: "none" }
      | { kind: "upload"; title: string; fileUrl: string }
      | { kind: "template"; title: string; cv: unknown };

    if (!application.resume) {
      resume = { kind: "none" };
    } else {
      const resolved = await resolveResumePreviewForEmployer(
        application.resume.fileUrl,
        application.candidate.userId,
      );
      if (resolved.kind === "upload") {
        resume = {
          kind: "upload",
          title: application.resume.title,
          fileUrl: resolved.fileUrl,
        };
      } else {
        resume = {
          kind: "template",
          title: application.resume.title,
          cv: resolved.cv,
        };
      }
    }

    return {
      applicationId: application.id,
      coverLetter,
      job: { id: application.job.id, title: application.job.title },
      candidate: {
        user: application.candidate.user,
        province: application.candidate.province,
        district: application.candidate.district,
      },
      resume,
    };
  },

  async deleteJob(userId: number, jobId: number) {
    if (Number.isNaN(jobId)) {
      throw new HttpException("Invalid id", 400);
    }
    const employer = await getApprovedEmployer(userId);
    const companyId = requireCompanyId(employer);
    requireCompanyActive(employer);
    const job = await prisma.job.findFirst({
      where: { id: jobId, deletedAt: null },
    });
    if (!job || job.companyId !== companyId) {
      throw new HttpException("Job not found", 404);
    }
    return jobService.deleteJob(jobId);
  },

  async getSuggestedCandidates(
    userId: number,
    opts: {
      limit?: number;
      page?: number;
      jobId?: number;
      provinceId?: number;
      experienceLevel?: string;
    } = {},
  ) {
    const employer = await getApprovedEmployer(userId);
    const companyId = requireCompanyId(employer);

    const page = Math.max(1, Number(opts.page) || 1);
    const limit = Math.min(Math.max(1, Number(opts.limit) || 20), 50);
    const POOL = 200; // candidates to score before pagination

    // ── Resolve job context (specific job or all approved jobs of company) ──
    type JobContext = {
      id: number;
      categoryId: number;
      jobType: string;
      experienceLevel: string;
      provinceId: number | null;
      districtId: number | null;
      skillIds: number[];
    };

    let jobContexts: JobContext[] = [];
    if (opts.jobId) {
      const job = await prisma.job.findFirst({
        where: {
          id: opts.jobId,
          companyId,
          deletedAt: null,
        },
        include: { jobSkills: { select: { skillId: true } }, company: { select: { provinceId: true, districtId: true } } },
      });
      if (job) {
        jobContexts = [{
          id: job.id,
          categoryId: job.categoryId,
          jobType: String(job.jobType),
          experienceLevel: String(job.experienceLevel),
          provinceId: job.company.provinceId,
          districtId: job.company.districtId,
          skillIds: job.jobSkills.map((s) => s.skillId),
        }];
      }
    }

    if (!jobContexts.length) {
      const jobs = await prisma.job.findMany({
        where: {
          companyId,
          deletedAt: null,
          moderationStatus: JobModerationStatus.APPROVED,
        },
        include: { jobSkills: { select: { skillId: true } }, company: { select: { provinceId: true, districtId: true } } },
        orderBy: { createdAt: "desc" },
        take: 10,
      });
      jobContexts = jobs.map((j) => ({
        id: j.id,
        categoryId: j.categoryId,
        jobType: String(j.jobType),
        experienceLevel: String(j.experienceLevel),
        provinceId: j.company.provinceId,
        districtId: j.company.districtId,
        skillIds: j.jobSkills.map((s) => s.skillId),
      }));
    }

    // Sets for fast lookup
    const allCategoryIds = [...new Set(jobContexts.map((j) => j.categoryId))];
    const allSkillIds = [...new Set(jobContexts.flatMap((j) => j.skillIds))];
    const allProvinceIds = [...new Set(jobContexts.map((j) => j.provinceId).filter((v): v is number => v != null))];
    const allDistrictIds = [...new Set(jobContexts.map((j) => j.districtId).filter((v): v is number => v != null))];
    const jobTypeSet = new Set(jobContexts.map((j) => j.jobType));
    const expLevelSet = new Set(jobContexts.map((j) => j.experienceLevel));

    const EXPERIENCE_RANK: Record<string, number> = {
      INTERN: 0, FRESHER: 1, JUNIOR: 2, MIDDLE: 3, SENIOR: 4, LEAD: 5,
    };

    // ── Fetch candidate pool ─────────────────────────────────────────────────
    // Build OR filter to catch any relevant candidate
    const orFilters: Prisma.CandidateWhereInput[] = [];
    if (allCategoryIds.length) {
      orFilters.push({ candidateCategories: { some: { categoryId: { in: allCategoryIds } } } });
    }
    if (allSkillIds.length) {
      orFilters.push({ candidateSkills: { some: { skillId: { in: allSkillIds } } } });
    }
    // Always include candidates who applied to company
    orFilters.push({ applications: { some: { job: { companyId } } } });

    const baseWhere: Prisma.CandidateWhereInput = {
      ...(opts.provinceId != null ? { provinceId: opts.provinceId } : {}),
      ...(opts.experienceLevel
        ? { preference: { experienceLevel: opts.experienceLevel as never } }
        : {}),
      ...(orFilters.length ? { OR: orFilters } : {}),
    };

    const candidates = await prisma.candidate.findMany({
      where: baseWhere,
      take: POOL,
      include: {
        user: { select: { id: true, username: true, email: true, avatar: true } },
        province: { select: { name: true } },
        district: { select: { name: true } },
        candidateSkills: { select: { skillId: true } },
        candidateCategories: { select: { categoryId: true } },
        preference: { select: { experienceLevel: true, jobType: true, isOpenToRemote: true, preferredProvinceId: true } },
        applications: {
          where: { job: { companyId } },
          select: { job: { select: { title: true } } },
          take: 1,
          orderBy: { createdAt: "desc" },
        },
      },
    });

    // ── Score each candidate ─────────────────────────────────────────────────
    const categoriesSet = new Set(allCategoryIds);
    const skillsSet = new Set(allSkillIds);
    const provincesSet = new Set(allProvinceIds);
    const districtsSet = new Set(allDistrictIds);

    type ScoredRow = {
      candidateId: number;
      user: { id: number; username: string; email: string; avatar: string | null };
      province: { name: string } | null;
      district: { name: string } | null;
      score: number;
      reason: "applied" | "category_match" | "skill_match" | "multi_match";
      matchedSkillCount: number;
      matchedCategoryCount: number;
      hint: string;
    };

    const scored: ScoredRow[] = candidates.map((c) => {
      let score = 0;
      const signals: string[] = [];

      const appliedJob = c.applications[0]?.job?.title;
      if (appliedJob) {
        score += 30;
        signals.push("applied");
      }

      const cCategories = new Set(c.candidateCategories.map((r) => r.categoryId));
      const matchedCats = [...cCategories].filter((id) => categoriesSet.has(id)).length;
      if (matchedCats > 0) {
        score += Math.min(matchedCats * 10, 20);
        signals.push("category");
      }

      const cSkills = new Set(c.candidateSkills.map((r) => r.skillId));
      const matchedSkills = [...cSkills].filter((id) => skillsSet.has(id)).length;
      if (matchedSkills > 0) {
        score += Math.min(matchedSkills * 5, 25);
        signals.push("skill");
      }

      const prefProvince = c.preference?.preferredProvinceId ?? null;
      if (prefProvince != null && provincesSet.has(prefProvince)) {
        score += 8;
        signals.push("location");
      } else if (c.provinceId != null && provincesSet.has(c.provinceId)) {
        score += 5;
        signals.push("location");
      }
      if (c.districtId != null && districtsSet.has(c.districtId)) score += 3;

      const prefExp = c.preference?.experienceLevel != null ? String(c.preference.experienceLevel) : null;
      if (prefExp && expLevelSet.has(prefExp)) {
        score += 8;
        signals.push("experience");
      } else if (prefExp) {
        const prefRank = EXPERIENCE_RANK[prefExp] ?? -1;
        let minDist = Infinity;
        for (const jExp of expLevelSet) {
          const jRank = EXPERIENCE_RANK[jExp] ?? -1;
          if (prefRank >= 0 && jRank >= 0) minDist = Math.min(minDist, Math.abs(prefRank - jRank));
        }
        if (minDist === 1) score += 4;
        else if (minDist >= 2) score -= 3;
      }

      const prefJobType = c.preference?.jobType != null ? String(c.preference.jobType) : null;
      if (prefJobType && jobTypeSet.has(prefJobType)) score += 5;

      let reason: ScoredRow["reason"] = "category_match";
      if (signals.includes("applied")) reason = "applied";
      else if (signals.length >= 2) reason = "multi_match";
      else if (signals.includes("skill")) reason = "skill_match";

      const hintParts: string[] = [];
      if (appliedJob) hintParts.push(`Đã ứng tuyển: ${appliedJob}`);
      if (matchedSkills > 0) hintParts.push(`${matchedSkills} kỹ năng phù hợp`);
      if (matchedCats > 0 && !appliedJob) hintParts.push("Ngành nghề phù hợp");
      if (signals.includes("experience")) hintParts.push("Kinh nghiệm phù hợp");
      if (signals.includes("location")) hintParts.push("Khu vực phù hợp");

      return {
        candidateId: c.id,
        user: c.user,
        province: c.province,
        district: c.district,
        score,
        reason,
        matchedSkillCount: matchedSkills,
        matchedCategoryCount: matchedCats,
        hint: hintParts.join(" · ") || "Có thể phù hợp",
      };
    });

    // Sort by score desc
    scored.sort((a, b) => b.score - a.score || b.matchedSkillCount - a.matchedSkillCount);

    const total = scored.length;
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const skip = (page - 1) * limit;
    const items = scored.slice(skip, skip + limit).map(({ score, ...rest }) => rest);

    return {
      items,
      pagination: { total, page, limit, totalPages },
      context: {
        jobCount: jobContexts.length,
        categoryIds: allCategoryIds,
        skillCount: allSkillIds.length,
      },
    };
  },

  async getSuggestedCandidateCv(
    employerUserId: number,
    rawCandidateId: number,
  ) {
    if (Number.isNaN(rawCandidateId) || rawCandidateId < 1) {
      throw new HttpException("Ứng viên không hợp lệ", 400);
    }
    const candidateId = rawCandidateId;
    const employer = await getApprovedEmployer(employerUserId);
    const companyId = requireCompanyId(employer);
    requireCompanyActive(employer);
    const companyName = employer.company?.name?.trim() || "Nhà tuyển dụng";

    const allowed = await canEmployerAccessSuggestedCandidate(
      companyId,
      candidateId,
    );
    if (!allowed) {
      throw new HttpException("Không tìm thấy ứng viên", 404);
    }

    const candidate = await prisma.candidate.findUnique({
      where: { id: candidateId },
      include: {
        user: {
          select: { id: true, username: true, email: true, avatar: true },
        },
        province: { select: { name: true } },
        district: { select: { name: true } },
      },
    });
    if (!candidate) {
      throw new HttpException("Ứng viên không tồn tại", 404);
    }

    const resume = await prisma.resume.findFirst({
      where: { candidateId },
      orderBy: { updatedAt: "desc" },
      select: { id: true, title: true, fileUrl: true, updatedAt: true },
    });

    try {
      await notificationService.notifyCandidateEmployerViewedProfileFromSuggestions(
        {
          candidateUserId: candidate.userId,
          companyName,
        },
      );
    } catch {
      // thông báo lỗi không chặn việc xem CV
    }

    let resumeOut:
      | {
          id: number;
          title: string;
          updatedAt: string;
          preview:
            | { kind: "upload"; fileUrl: string }
            | { kind: "template"; cv: unknown };
        }
      | null = null;

    if (resume) {
      const resolved = await resolveResumePreviewForEmployer(
        resume.fileUrl,
        candidate.userId,
      );
      resumeOut = {
        id: resume.id,
        title: resume.title,
        updatedAt: resume.updatedAt.toISOString(),
        preview:
          resolved.kind === "upload"
            ? { kind: "upload", fileUrl: resolved.fileUrl }
            : { kind: "template", cv: resolved.cv },
      };
    }

    return {
      candidate: {
        id: candidate.id,
        user: candidate.user,
        province: candidate.province,
        district: candidate.district,
      },
      resume: resumeOut,
    };
  },
};
