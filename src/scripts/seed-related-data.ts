/**
 * Bổ sung bảng liên quan từ companies và jobs đã có trong database.
 * Không tạo thêm công ty hay tin tuyển dụng.
 *
 * Chạy: pnpm exec ts-node src/scripts/seed-related-data.ts
 */
import {
  AiMatchStatus,
  ApplicationStatus,
  EmployerStatus,
  ExperienceLevel,
  JobType,
} from "../generated/prisma/client";
import { hashPassword } from "../utils/hashing";
import { prisma } from "../utils/prisma";

const EMPLOYER_PASSWORD = "Employer@2606";
const CANDIDATE_PASSWORD = "Candidate@2606";
const CANDIDATE_COUNT = 48;

const NOISE =
  /kinh nghiệm|trở lên|^tuổi|bảo hiểm|team building|thưởng|phụ cấp|thiết bị|du lịch|khám sức khỏe|phương tiện|hỗ trợ data|^có |^nam$|^nữ$/i;

const CATEGORY_SKILLS: Record<string, string[]> = {
  "backend-developer": ["Node.js", "TypeScript", "MySQL"],
  "frontend-developer": ["React", "TypeScript"],
  "mobile-developer": ["Flutter", "Kotlin"],
  "data-analyst": ["SQL", "Python", "Data Analysis"],
  "digital-marketing": ["SEO", "Google Ads"],
  "sales-executive": ["B2B Sales"],
  "product-manager": ["Product Management"],
  "operations-specialist": ["SQL", "Data Analysis"],
};

const INDUSTRY_PARENT: [RegExp, string][] = [
  [/công nghệ thông tin|phần mềm|lập trình|internet/i, "cong-nghe-thong-tin"],
  [/quảng cáo|marketing|truyền thông|báo chí/i, "marketing-truyen-thong"],
  [/kinh doanh|bán buôn|bán lẻ|bất động sản|tài chính|ngân hàng|bảo hiểm/i, "kinh-doanh"],
  [/sản xuất|vận hành|logistics|kho bãi|xây dựng|cơ khí/i, "van-hanh-san-xuat"],
];

const cut = (value: string, limit: number) => value.trim().slice(0, limit);

const skillTokens = (description: string) => {
  const line = description.match(/Kỹ năng\n([^\n]+)/)?.[1] ?? "";
  const seen = new Set<string>();
  const tokens: string[] = [];
  for (const raw of line.split(",")) {
    const name = cut(raw, 120);
    if (name.length < 2 || NOISE.test(name)) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    tokens.push(name);
  }
  return tokens;
};

const industryParents = (description: string | null) => {
  const line = description?.match(/Ngành nghề:\s*([^\n]+)/)?.[1] ?? "";
  const slugs = new Set<string>();
  for (const [pattern, slug] of INDUSTRY_PARENT) {
    if (pattern.test(line)) slugs.add(slug);
  }
  return slugs;
};

const phoneFor = (prefix: string, id: number) =>
  `${prefix}${String(id).padStart(8, "0")}`.slice(0, 15);

const main = async () => {
  const [categories, parents, companies, jobs, employerRole, candidateRole] =
    await Promise.all([
      prisma.category.findMany({
        where: { deletedAt: null },
        select: { id: true, slug: true, parentCategoryId: true },
      }),
      prisma.categoryParent.findMany({
        where: { deletedAt: null },
        select: { id: true, slug: true },
      }),
      prisma.company.findMany({
        where: { deletedAt: null },
        select: { id: true, name: true, description: true, provinceId: true, districtId: true },
      }),
      prisma.job.findMany({
        where: { deletedAt: null },
        select: {
          id: true,
          title: true,
          description: true,
          companyId: true,
          categoryId: true,
          employerId: true,
          jobType: true,
          experienceLevel: true,
          minSalary: true,
          maxSalary: true,
        },
      }),
      prisma.role.findUnique({ where: { name: "EMPLOYER" }, select: { id: true } }),
      prisma.role.findUnique({ where: { name: "CANDIDATE" }, select: { id: true } }),
    ]);

  if (!employerRole || !candidateRole) {
    throw new Error("Thiếu role EMPLOYER hoặc CANDIDATE. Hãy chạy seed gốc trước.");
  }

  const categoryById = new Map(categories.map((row) => [row.id, row]));
  const parentBySlug = new Map(parents.map((row) => [row.slug, row.id]));
  const otherParentId = parentBySlug.get("khac");
  if (!otherParentId) throw new Error("Thiếu nhóm ngành Khác");

  const skillNames = new Set<string>();
  const skillsByJob = new Map<number, string[]>();
  for (const job of jobs) {
    const category = categoryById.get(job.categoryId);
    const fromText = skillTokens(job.description);
    const fallback = category ? CATEGORY_SKILLS[category.slug] ?? [] : [];
    const names = (fromText.length > 0 ? fromText : fallback).slice(0, 8);
    const resolved = names.length > 0 ? names : ["Kỹ năng chuyên môn"];
    skillsByJob.set(job.id, resolved);
    for (const name of resolved) skillNames.add(name);
  }

  const existingSkills = await prisma.skill.findMany({
    select: { id: true, name: true },
  });
  const skillIdByName = new Map(existingSkills.map((row) => [row.name.toLowerCase(), row.id]));
  const missingSkills = [...skillNames].filter((name) => !skillIdByName.has(name.toLowerCase()));
  if (missingSkills.length > 0) {
    await prisma.skill.createMany({
      data: missingSkills.map((name) => ({ name })),
      skipDuplicates: true,
    });
    const created = await prisma.skill.findMany({
      where: { name: { in: missingSkills } },
      select: { id: true, name: true },
    });
    for (const row of created) skillIdByName.set(row.name.toLowerCase(), row.id);
  }

  const jobSkillRows: { jobId: number; skillId: number }[] = [];
  for (const [jobId, names] of skillsByJob) {
    for (const name of names) {
      const skillId = skillIdByName.get(name.toLowerCase());
      if (skillId) jobSkillRows.push({ jobId, skillId });
    }
  }
  for (let i = 0; i < jobSkillRows.length; i += 1000) {
    await prisma.jobSkill.createMany({
      data: jobSkillRows.slice(i, i + 1000),
      skipDuplicates: true,
    });
  }

  const parentsByCompany = new Map<number, Set<number>>();
  for (const company of companies) {
    const ids = new Set<number>();
    for (const slug of industryParents(company.description)) {
      const parentId = parentBySlug.get(slug);
      if (parentId) ids.add(parentId);
    }
    parentsByCompany.set(company.id, ids);
  }
  for (const job of jobs) {
    const parentId = categoryById.get(job.categoryId)?.parentCategoryId;
    if (parentId) parentsByCompany.get(job.companyId)?.add(parentId);
  }
  const companyCategoryRows: { companyId: number; parentCategoryId: number }[] = [];
  for (const [companyId, ids] of parentsByCompany) {
    const chosen = ids.size > 0 ? ids : new Set([otherParentId]);
    for (const parentCategoryId of chosen) {
      companyCategoryRows.push({ companyId, parentCategoryId });
    }
  }
  for (let i = 0; i < companyCategoryRows.length; i += 1000) {
    await prisma.companyCategory.createMany({
      data: companyCategoryRows.slice(i, i + 1000),
      skipDuplicates: true,
    });
  }

  const passwordHash = hashPassword(EMPLOYER_PASSWORD);
  const allCompaniesNeedingEmployer = companies.filter((company) => {
    const hasEmployerJob = jobs.some(
      (job) => job.companyId === company.id && job.employerId != null,
    );
    return !hasEmployerJob;
  });

  const existingEmployers = await prisma.employer.findMany({
    select: { id: true, companyId: true },
  });
  const employerByCompany = new Map<number, number>();
  for (const row of existingEmployers) {
    if (row.companyId) employerByCompany.set(row.companyId, row.id);
  }

  let createdEmployers = 0;
  for (const company of allCompaniesNeedingEmployer) {
    if (employerByCompany.has(company.id)) continue;
    const email = `emp.${company.id}@seed.topcv.local`;
    const user = await prisma.user.upsert({
      where: { email },
      update: { isVerified: true, isBlocked: false },
      create: {
        email,
        username: `emp${company.id}`.slice(0, 30),
        password: passwordHash,
        isVerified: true,
        isBlocked: false,
      },
      select: { id: true },
    });
    await prisma.userRole.createMany({
      data: [{ userId: user.id, roleId: employerRole.id }],
      skipDuplicates: true,
    });
    await prisma.userPhone.upsert({
      where: { userId: user.id },
      update: {},
      create: { userId: user.id, phone: phoneFor("091", company.id) },
    });
    const employer = await prisma.employer.upsert({
      where: { userId: user.id },
      update: { companyId: company.id, status: EmployerStatus.APPROVED },
      create: {
        userId: user.id,
        companyId: company.id,
        status: EmployerStatus.APPROVED,
      },
      select: { id: true },
    });
    employerByCompany.set(company.id, employer.id);
    createdEmployers += 1;
  }

  let linkedJobs = 0;
  for (const job of jobs) {
    if (job.employerId) continue;
    const employerId = employerByCompany.get(job.companyId);
    if (!employerId) continue;
    await prisma.job.update({
      where: { id: job.id },
      data: { employerId },
    });
    linkedJobs += 1;
  }

  const candidateHash = hashPassword(CANDIDATE_PASSWORD);
  const provinces = await prisma.province.findMany({
    where: { deletedAt: null, code: { not: "UNKNOWN" } },
    select: { id: true, districts: { where: { deletedAt: null }, select: { id: true }, take: 1 } },
  });
  const located = provinces.filter((row) => row.districts[0]);
  const jobsByCategory = new Map<number, typeof jobs>();
  for (const job of jobs) {
    const list = jobsByCategory.get(job.categoryId) ?? [];
    list.push(job);
    jobsByCategory.set(job.categoryId, list);
  }
  const categoryIds = [...jobsByCategory.keys()];

  let applications = 0;
  let saved = 0;
  let follows = 0;
  for (let index = 1; index <= CANDIDATE_COUNT; index += 1) {
    const email = `cand.${index}@seed.topcv.local`;
    const place = located[index % located.length] ?? located[0];
    const user = await prisma.user.upsert({
      where: { email },
      update: { isVerified: true, isBlocked: false },
      create: {
        email,
        username: `cand${index}`.slice(0, 30),
        password: candidateHash,
        isVerified: true,
        isBlocked: false,
      },
      select: { id: true },
    });
    await prisma.userRole.createMany({
      data: [{ userId: user.id, roleId: candidateRole.id }],
      skipDuplicates: true,
    });
    await prisma.userPhone.upsert({
      where: { userId: user.id },
      update: {},
      create: { userId: user.id, phone: phoneFor("098", index) },
    });
    const candidate = await prisma.candidate.upsert({
      where: { userId: user.id },
      update: {
        provinceId: place?.id ?? null,
        districtId: place?.districts[0]?.id ?? null,
      },
      create: {
        userId: user.id,
        provinceId: place?.id ?? null,
        districtId: place?.districts[0]?.id ?? null,
      },
      select: { id: true },
    });

    const categoryId = categoryIds[(index - 1) % Math.max(categoryIds.length, 1)];
    const category = categoryId ? categoryById.get(categoryId) : undefined;
    const pool = categoryId ? jobsByCategory.get(categoryId) ?? [] : [];
    const picked = pool.filter((_, jobIndex) => jobIndex % 17 === index % 17).slice(0, 3);
    const skillIds = [
      ...(category ? CATEGORY_SKILLS[category.slug] ?? [] : []),
      ...(picked[0] ? skillsByJob.get(picked[0].id) ?? [] : []),
    ]
      .map((name) => skillIdByName.get(name.toLowerCase()))
      .filter((id): id is number => Boolean(id))
      .slice(0, 5);

    if (skillIds.length > 0) {
      await prisma.candidateSkill.createMany({
        data: skillIds.map((skillId) => ({ candidateId: candidate.id, skillId })),
        skipDuplicates: true,
      });
    }
    if (categoryId) {
      await prisma.candidateCategory.createMany({
        data: [{ candidateId: candidate.id, categoryId }],
        skipDuplicates: true,
      });
    }

    const sampleJob = picked[0];
    await prisma.candidatePreference.upsert({
      where: { candidateId: candidate.id },
      update: {},
      create: {
        candidateId: candidate.id,
        desiredMinSalary: sampleJob?.minSalary ?? 10000000,
        desiredMaxSalary: sampleJob?.maxSalary ?? 25000000,
        jobType: sampleJob?.jobType ?? JobType.FULL_TIME,
        experienceLevel: sampleJob?.experienceLevel ?? ExperienceLevel.JUNIOR,
        preferredProvinceId: place?.id ?? null,
        preferredDistrictId: place?.districts[0]?.id ?? null,
        isOpenToRemote: index % 3 === 0,
      },
    });

    const resume = await prisma.resume.findFirst({
      where: { candidateId: candidate.id, title: `CV ứng viên ${index}` },
      select: { id: true },
    });
    const resumeId =
      resume?.id ??
      (
        await prisma.resume.create({
          data: {
            candidateId: candidate.id,
            title: `CV ứng viên ${index}`,
            fileUrl: `https://example.com/resumes/candidate-${index}.pdf`,
          },
          select: { id: true },
        })
      ).id;

    const statuses = [
      ApplicationStatus.PENDING,
      ApplicationStatus.REVIEWED,
      ApplicationStatus.ACCEPTED,
    ];
    for (const [offset, job] of picked.entries()) {
      const status = statuses[offset % statuses.length] ?? ApplicationStatus.PENDING;
      await prisma.application.upsert({
        where: { candidateId_jobId: { candidateId: candidate.id, jobId: job.id } },
        update: {},
        create: {
          candidateId: candidate.id,
          jobId: job.id,
          resumeId,
          status,
          coverLetter: `Tôi quan tâm vị trí ${job.title} và muốn được trao đổi thêm.`,
          aiMatchStatus: AiMatchStatus.DONE,
          aiMatchScore: 60 + ((index + offset) % 35),
          aiMatchReason: "Kỹ năng và ngành nghề của ứng viên gần với yêu cầu tin tuyển dụng.",
          aiMatchModel: "seed-related",
          aiMatchUpdatedAt: new Date(),
        },
      });
      applications += 1;
    }

    const saveTargets = pool.slice(index % 5, (index % 5) + 2);
    if (saveTargets.length > 0) {
      const result = await prisma.savedJob.createMany({
        data: saveTargets.map((job) => ({ candidateId: candidate.id, jobId: job.id })),
        skipDuplicates: true,
      });
      saved += result.count;
    }

    const followTargets = [...new Set(picked.map((job) => job.companyId))].slice(0, 2);
    if (followTargets.length > 0) {
      const result = await prisma.companyFollow.createMany({
        data: followTargets.map((companyId) => ({ candidateId: candidate.id, companyId })),
        skipDuplicates: true,
      });
      follows += result.count;
    }
  }

  console.log(
    `Xong. Job skills ${jobSkillRows.length}, company categories ${companyCategoryRows.length}, employer mới ${createdEmployers}, job gắn employer ${linkedJobs}. Ứng viên ${CANDIDATE_COUNT}, đơn ứng tuyển xử lý ${applications}, việc đã lưu +${saved}, theo dõi công ty +${follows}.`,
  );
  console.log(`Mật khẩu employer: ${EMPLOYER_PASSWORD}`);
  console.log(`Mật khẩu candidate: ${CANDIDATE_PASSWORD}`);
  console.log(`Email mẫu: emp.{companyId}@seed.topcv.local, cand.{1..${CANDIDATE_COUNT}}@seed.topcv.local`);
};

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
