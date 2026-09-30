/**
 * Sinh thêm dữ liệu giả (companies, jobs, candidates, applications, ...) với số lượng lớn
 * bằng @faker-js/faker (locale tiếng Việt) để phục vụ test/demo local.
 *
 * Yêu cầu: đã chạy `npx prisma db seed` trước đó (cần có sẵn provinces/districts/
 * categories/categoryParents/skills/cvTemplates).
 *
 * Chạy:
 *   npm run generate:fake-data
 *   FAKE_COMPANIES=80 FAKE_CANDIDATES=400 npm run generate:fake-data
 */
import { fakerVI as faker } from "@faker-js/faker";
import {
  ApplicationStatus,
  AiMatchStatus,
  EmployerStatus,
  ExperienceLevel,
  JobModerationStatus,
  JobType,
} from "../generated/prisma/client";
import { hashPassword } from "../utils/hashing";
import { prisma } from "../utils/prisma";
import { uniqueSlug } from "../utils/slug";
import { isOpenSearchEnabled } from "../utils/opensearch";
import { enqueueUpsertJobIndex } from "../search/jobs.indexer";

const COMPANIES_COUNT = Number(process.env.FAKE_COMPANIES ?? 40);
const CANDIDATES_COUNT = Number(process.env.FAKE_CANDIDATES ?? 200);
const MIN_JOBS_PER_COMPANY = 2;
const MAX_JOBS_PER_COMPANY = 6;
const MIN_SKILLS_PER_JOB = 2;
const MAX_SKILLS_PER_JOB = 5;
const MAX_APPLICATIONS_PER_CANDIDATE = 4;
const MAX_SAVED_JOBS_PER_CANDIDATE = 5;
const MAX_FOLLOWS_PER_CANDIDATE = 3;

const VN_MOBILE_PREFIXES = [
  "090", "091", "092", "093", "094", "096", "097", "098", "099",
  "032", "033", "034", "035", "036", "037", "038", "039",
  "070", "076", "077", "078", "079", "081", "082", "083", "086", "088", "089",
];

const COMPANY_PREFIXES = ["Công ty TNHH", "Công ty Cổ phần", "Công ty TNHH MTV"];
const COMPANY_CORE_WORDS = [
  "Công Nghệ", "Giải Pháp Số", "Truyền Thông", "Đầu Tư", "Thương Mại Dịch Vụ",
  "Nhân Lực", "Sáng Tạo", "Chuyển Đổi Số", "Phần Mềm", "Phát Triển", "Tư Vấn",
];
const COMPANY_SUFFIXES = [
  "Việt Nam", "Á Châu", "Sài Gòn", "Thăng Long", "Hồng Hà", "Cửu Long",
  "Đông Dương", "Toàn Cầu", "Miền Nam", "Miền Bắc",
];

type CategoryConfig = { titles: string[]; skills: string[] };

const CATEGORY_CONFIG: Record<string, CategoryConfig> = {
  "backend-developer": {
    titles: [
      "Backend Developer (Node.js)",
      "Lập trình viên Backend (Java)",
      "Kỹ sư Backend (PHP/Laravel)",
      "Backend Engineer (Golang)",
      "Senior Backend Developer",
      "Backend Developer (Python/Django)",
    ],
    skills: ["Node.js", "Express", "TypeScript", "MySQL", "Redis", "Docker", "Java", "Spring Boot", "Python", "Go", "SQL", "AWS"],
  },
  "frontend-developer": {
    titles: [
      "Frontend Developer (ReactJS)",
      "Lập trình viên Frontend (VueJS)",
      "Frontend Engineer (Next.js)",
      "UI Developer",
      "Senior Frontend Developer",
    ],
    skills: ["React", "TypeScript", "Figma"],
  },
  "mobile-developer": {
    titles: [
      "Mobile Developer (Flutter)",
      "Lập trình viên Mobile (Kotlin/Android)",
      "iOS Developer (Swift)",
      "React Native Developer",
    ],
    skills: ["Flutter", "Kotlin", "TypeScript", "React"],
  },
  "data-analyst": {
    titles: [
      "Data Analyst",
      "Chuyên viên Phân tích Dữ liệu",
      "Business Intelligence Analyst",
      "Data Engineer",
    ],
    skills: ["SQL", "Python", "Power BI", "Data Analysis", "AWS"],
  },
  "digital-marketing": {
    titles: [
      "Digital Marketing Executive",
      "Chuyên viên SEO",
      "Chuyên viên Google Ads",
      "Content Marketing Specialist",
      "Marketing Manager",
    ],
    skills: ["SEO", "Google Ads", "Data Analysis"],
  },
  "sales-executive": {
    titles: [
      "Nhân viên Kinh doanh B2B",
      "Sales Executive",
      "Chuyên viên Phát triển Kinh doanh",
      "Account Manager",
    ],
    skills: ["B2B Sales", "Data Analysis"],
  },
  "product-manager": {
    titles: ["Product Manager", "Product Owner", "Chuyên viên Phát triển Sản phẩm"],
    skills: ["Product Management", "Data Analysis", "Figma"],
  },
  "operations-specialist": {
    titles: ["Chuyên viên Vận hành", "Operations Executive", "Nhân viên Quản lý Chuỗi cung ứng"],
    skills: ["Data Analysis", "SQL"],
  },
};

const RESPONSIBILITY_POOL = [
  "Phát triển và bảo trì các tính năng theo yêu cầu dự án",
  "Phối hợp với các phòng ban liên quan để đảm bảo tiến độ công việc",
  "Tham gia review, tối ưu quy trình làm việc của team",
  "Nghiên cứu, đề xuất giải pháp cải tiến hiệu suất công việc",
  "Báo cáo tiến độ công việc định kỳ cho quản lý trực tiếp",
  "Tham gia các buổi họp lên kế hoạch, đánh giá dự án",
  "Đảm bảo chất lượng sản phẩm/dịch vụ trước khi bàn giao",
  "Đào tạo, hỗ trợ thành viên mới trong team",
];

const REQUIREMENT_POOL = [
  "Có tinh thần trách nhiệm cao, chủ động trong công việc",
  "Kỹ năng giao tiếp, làm việc nhóm tốt",
  "Ưu tiên ứng viên có kinh nghiệm trong lĩnh vực tương tự",
  "Có khả năng làm việc độc lập và chịu được áp lực công việc",
  "Tư duy logic, cẩn thận, chú trọng chi tiết",
  "Sẵn sàng học hỏi công nghệ/kiến thức mới",
];

const BENEFIT_POOL = [
  "Lương thưởng cạnh tranh, review 2 lần/năm",
  "Bảo hiểm đầy đủ theo quy định, thêm bảo hiểm sức khỏe",
  "Môi trường làm việc trẻ, năng động, nhiều cơ hội phát triển",
  "Chế độ nghỉ phép, du lịch hàng năm",
  "Thưởng dự án, thưởng lễ Tết hấp dẫn",
  "Được đào tạo và tham gia các khóa học nâng cao chuyên môn",
];

const pickMany = <T,>(arr: T[], min: number, max: number): T[] =>
  faker.helpers.arrayElements(arr, { min, max });

const uniqueGenerator = (existing: Set<string>) => {
  return (candidate: () => string): string => {
    let value = candidate();
    let attempts = 0;
    while (existing.has(value) && attempts < 20) {
      value = `${candidate()} ${faker.number.int({ min: 100, max: 999 })}`;
      attempts++;
    }
    existing.add(value);
    return value;
  };
};

const randomVnPhone = () =>
  `${faker.helpers.arrayElement(VN_MOBILE_PREFIXES)}${faker.string.numeric(7)}`;

const STREET_TYPES = ["Đường", "Phố", "Đại lộ"];
const buildStreetAddress = () =>
  `Số ${faker.number.int({ min: 1, max: 300 })}, ${faker.helpers.arrayElement(STREET_TYPES)} ${faker.person.lastName()} ${faker.number.int({ min: 1, max: 30 })}`;

const buildCompanyName = () => {
  const prefix = faker.helpers.arrayElement(COMPANY_PREFIXES);
  const core = faker.helpers.arrayElement(COMPANY_CORE_WORDS);
  const suffix = faker.helpers.arrayElement(COMPANY_SUFFIXES);
  const person = faker.person.lastName();
  return `${prefix} ${core} ${person} ${suffix}`;
};

const buildJobDescription = (opts: {
  title: string;
  companyName: string;
  cityName: string;
  skillNames: string[];
}) => {
  const responsibilities = pickMany(RESPONSIBILITY_POOL, 3, 4);
  const requirements = [
    opts.skillNames.length > 0
      ? `Có kinh nghiệm làm việc với ${opts.skillNames.join(", ")}`
      : "Có kinh nghiệm liên quan đến vị trí ứng tuyển",
    ...pickMany(REQUIREMENT_POOL, 2, 3),
  ];
  const benefits = pickMany(BENEFIT_POOL, 3, 4);

  return [
    `${opts.companyName} đang tuyển dụng vị trí ${opts.title} làm việc tại ${opts.cityName}.`,
    "",
    "Mô tả công việc:",
    ...responsibilities.map((r) => `- ${r}`),
    "",
    "Yêu cầu:",
    ...requirements.map((r) => `- ${r}`),
    "",
    "Quyền lợi:",
    ...benefits.map((r) => `- ${r}`),
  ].join("\n");
};

const salaryRangeByLevel: Record<ExperienceLevel, [number, number]> = {
  INTERN: [2, 5],
  FRESHER: [6, 10],
  JUNIOR: [10, 18],
  MIDDLE: [18, 30],
  SENIOR: [28, 45],
  LEAD: [40, 65],
};

async function main() {
  console.log("Đang tải dữ liệu tham chiếu (provinces, categories, skills)...");

  const provinces = await prisma.province.findMany({
    include: { districts: true },
  });
  const categories = await prisma.category.findMany({
    select: { id: true, name: true, slug: true },
  });
  const categoryParents = await prisma.categoryParent.findMany({
    select: { id: true },
  });
  const skills = await prisma.skill.findMany({ select: { id: true, name: true } });
  const usedJobSlugs = new Set(
    (
      await prisma.job.findMany({ select: { slug: true } })
    )
      .map((row) => row.slug)
      .filter((slug): slug is string => Boolean(slug)),
  );
  usedJobSlugs.add("recommended");
  usedJobSlugs.add("suggest");
  usedJobSlugs.add("saved");

  if (provinces.length === 0 || categories.length === 0 || skills.length === 0) {
    throw new Error(
      "Chưa có dữ liệu tham chiếu (provinces/categories/skills). Hãy chạy `npx prisma db seed` trước.",
    );
  }

  const provincesWithDistricts = provinces.filter((p) => p.districts.length > 0);
  const skillIdByName = new Map(skills.map((s) => [s.name, s.id]));

  const existingCompanies = await prisma.company.findMany({
    select: { name: true, slug: true },
  });
  const existingCompanyNames = new Set(existingCompanies.map((c) => c.name));
  const usedSlugs = new Set(
    existingCompanies.map((c) => c.slug).filter((slug): slug is string => Boolean(slug)),
  );
  const existingEmails = new Set(
    (await prisma.user.findMany({ select: { email: true } })).map((u) => u.email),
  );

  const genCompanyName = uniqueGenerator(existingCompanyNames);
  const genEmail = uniqueGenerator(existingEmails);

  console.log(`Tạo ${COMPANIES_COUNT} công ty + việc làm liên quan...`);

  const allJobIds: number[] = [];
  const allCompanyIds: number[] = [];

  for (let i = 0; i < COMPANIES_COUNT; i++) {
    const province = faker.helpers.arrayElement(provincesWithDistricts);
    const district = faker.helpers.arrayElement(province.districts);
    const companyName = genCompanyName(buildCompanyName);

    const company = await prisma.company.create({
      data: {
        name: companyName,
        slug: uniqueSlug(companyName, usedSlugs),
        description: `${companyName} là đơn vị hoạt động trong lĩnh vực công nghệ và dịch vụ, cam kết mang lại môi trường làm việc chuyên nghiệp cho nhân viên.`,
        logo: faker.image.avatarGitHub(),
        website: faker.internet.url(),
        location: `${buildStreetAddress()}, ${district.name}, ${province.name}`,
        status: faker.datatype.boolean({ probability: 0.85 }),
        provinceId: province.id,
        districtId: district.id,
      },
      select: { id: true, name: true },
    });
    allCompanyIds.push(company.id);

    await prisma.companyCategory.createMany({
      data: pickMany(categoryParents, 1, 2).map((cp) => ({
        companyId: company.id,
        parentCategoryId: cp.id,
      })),
      skipDuplicates: true,
    });

    const employerFirstName = faker.person.firstName();
    const employerLastName = faker.person.lastName();
    const employerEmail = genEmail(() =>
      faker.internet
        .email({ firstName: employerFirstName, lastName: employerLastName })
        .toLowerCase(),
    );

    const employerUser = await prisma.user.create({
      data: {
        email: employerEmail,
        username: faker.internet.username({
          firstName: employerFirstName,
          lastName: employerLastName,
        }),
        password: hashPassword("Employer@123"),
        isVerified: true,
        isBlocked: false,
      },
      select: { id: true },
    });

    await prisma.userPhone.create({
      data: { userId: employerUser.id, phone: randomVnPhone() },
    });

    const employer = await prisma.employer.create({
      data: {
        userId: employerUser.id,
        companyId: company.id,
        status: faker.helpers.weightedArrayElement([
          { value: EmployerStatus.APPROVED, weight: 8 },
          { value: EmployerStatus.PENDING, weight: 1 },
          { value: EmployerStatus.REJECTED, weight: 1 },
        ]),
      },
      select: { id: true },
    });

    const jobsToCreate = faker.number.int({
      min: MIN_JOBS_PER_COMPANY,
      max: MAX_JOBS_PER_COMPANY,
    });

    for (let j = 0; j < jobsToCreate; j++) {
      const category = faker.helpers.arrayElement(categories);
      const config = CATEGORY_CONFIG[category.slug];
      const title = config
        ? faker.helpers.arrayElement(config.titles)
        : `${category.name} - ${faker.person.jobTitle()}`;
      const experienceLevel = faker.helpers.arrayElement(
        Object.values(ExperienceLevel),
      );
      const [minBase, maxBase] = salaryRangeByLevel[experienceLevel];
      const minSalary = minBase * 1_000_000;
      const maxSalary = (maxBase + faker.number.int({ min: 0, max: 10 })) * 1_000_000;
      const skillPoolNames = config?.skills ?? skills.map((s) => s.name);
      const chosenSkillNames = pickMany(
        skillPoolNames,
        MIN_SKILLS_PER_JOB,
        MAX_SKILLS_PER_JOB,
      );

      const job = await prisma.job.create({
        data: {
          title,
          slug: uniqueSlug(title, usedJobSlugs),
          description: buildJobDescription({
            title,
            companyName: company.name,
            cityName: province.name,
            skillNames: chosenSkillNames,
          }),
          minSalary,
          maxSalary,
          quantity: faker.number.int({ min: 1, max: 5 }),
          jobType: faker.helpers.weightedArrayElement([
            { value: JobType.FULL_TIME, weight: 8 },
            { value: JobType.PART_TIME, weight: 1 },
            { value: JobType.FREELANCE, weight: 1 },
          ]),
          experienceLevel,
          moderationStatus: faker.helpers.weightedArrayElement([
            { value: JobModerationStatus.APPROVED, weight: 8 },
            { value: JobModerationStatus.PENDING, weight: 2 },
            { value: JobModerationStatus.REJECTED, weight: 1 },
          ]),
          deadline: faker.datatype.boolean({ probability: 0.85 })
            ? faker.date.soon({ days: 60 })
            : null,
          isFeatured: faker.datatype.boolean({ probability: 0.1 }),
          workLocation: faker.datatype.boolean({ probability: 0.15 })
            ? "Remote"
            : `${district.name}, ${province.name}`,
          employerId: employer.id,
          companyId: company.id,
          categoryId: category.id,
          viewCount: faker.number.int({ min: 0, max: 5000 }),
        },
        select: { id: true },
      });
      allJobIds.push(job.id);

      const jobSkillIds = chosenSkillNames
        .map((name) => skillIdByName.get(name))
        .filter((id): id is number => Boolean(id));
      if (jobSkillIds.length > 0) {
        await prisma.jobSkill.createMany({
          data: jobSkillIds.map((skillId) => ({ jobId: job.id, skillId })),
          skipDuplicates: true,
        });
      }
    }

    if ((i + 1) % 10 === 0 || i === COMPANIES_COUNT - 1) {
      console.log(`  Đã tạo ${i + 1}/${COMPANIES_COUNT} công ty (${allJobIds.length} jobs)`);
    }
  }

  console.log(`Tạo ${CANDIDATES_COUNT} ứng viên + hồ sơ liên quan...`);

  let resumeCount = 0;
  let applicationCount = 0;
  let savedJobCount = 0;
  let followCount = 0;

  for (let i = 0; i < CANDIDATES_COUNT; i++) {
    const firstName = faker.person.firstName();
    const lastName = faker.person.lastName();
    const fullName = `${lastName} ${firstName}`;
    const email = genEmail(() =>
      faker.internet.email({ firstName, lastName }).toLowerCase(),
    );

    const candidateUser = await prisma.user.create({
      data: {
        email,
        username: faker.internet.username({ firstName, lastName }),
        password: hashPassword("Candidate@123"),
        isVerified: faker.datatype.boolean({ probability: 0.9 }),
        isBlocked: false,
      },
      select: { id: true },
    });

    await prisma.userPhone.create({
      data: { userId: candidateUser.id, phone: randomVnPhone() },
    });

    const province = faker.helpers.arrayElement(provincesWithDistricts);
    const district = faker.helpers.arrayElement(province.districts);

    const candidate = await prisma.candidate.create({
      data: {
        userId: candidateUser.id,
        provinceId: province.id,
        districtId: district.id,
      },
      select: { id: true },
    });

    const candidateSkillIds = pickMany(skills, 2, 6).map((s) => s.id);
    await prisma.candidateSkill.createMany({
      data: candidateSkillIds.map((skillId) => ({
        candidateId: candidate.id,
        skillId,
      })),
      skipDuplicates: true,
    });

    const candidateCategoryIds = pickMany(categories, 1, 3).map((c) => c.id);
    await prisma.candidateCategory.createMany({
      data: candidateCategoryIds.map((categoryId) => ({
        candidateId: candidate.id,
        categoryId,
      })),
      skipDuplicates: true,
    });

    if (faker.datatype.boolean({ probability: 0.7 })) {
      const prefProvince = faker.helpers.arrayElement(provincesWithDistricts);
      const prefDistrict = faker.helpers.arrayElement(prefProvince.districts);
      const expLevel = faker.helpers.arrayElement(Object.values(ExperienceLevel));
      const [minBase, maxBase] = salaryRangeByLevel[expLevel];
      await prisma.candidatePreference.create({
        data: {
          candidateId: candidate.id,
          desiredMinSalary: minBase * 1_000_000,
          desiredMaxSalary: maxBase * 1_000_000,
          jobType: faker.helpers.arrayElement(Object.values(JobType)),
          experienceLevel: expLevel,
          preferredProvinceId: prefProvince.id,
          preferredDistrictId: prefDistrict.id,
          isOpenToRemote: faker.datatype.boolean({ probability: 0.4 }),
        },
      });
    }

    const resumeIds: number[] = [];
    const resumesToCreate = faker.number.int({ min: 1, max: 2 });
    for (let r = 0; r < resumesToCreate; r++) {
      const resume = await prisma.resume.create({
        data: {
          candidateId: candidate.id,
          title: `CV ${fullName} - ${faker.person.jobTitle()}`,
          fileUrl: `https://example.com/resumes/${faker.string.uuid()}.pdf`,
        },
        select: { id: true },
      });
      resumeIds.push(resume.id);
      resumeCount++;
    }

    const applicationTargetJobIds = faker.helpers.arrayElements(allJobIds, {
      min: 0,
      max: Math.min(MAX_APPLICATIONS_PER_CANDIDATE, allJobIds.length),
    });
    for (const jobId of applicationTargetJobIds) {
      const aiMatchStatus = faker.helpers.weightedArrayElement([
        { value: AiMatchStatus.DONE, weight: 5 },
        { value: AiMatchStatus.PENDING, weight: 3 },
        { value: AiMatchStatus.FAILED, weight: 1 },
      ]);
      try {
        await prisma.application.create({
          data: {
            candidateId: candidate.id,
            jobId,
            resumeId: faker.helpers.arrayElement(resumeIds),
            status: faker.helpers.weightedArrayElement([
              { value: ApplicationStatus.PENDING, weight: 5 },
              { value: ApplicationStatus.REVIEWED, weight: 3 },
              { value: ApplicationStatus.ACCEPTED, weight: 1 },
              { value: ApplicationStatus.REJECTED, weight: 2 },
            ]),
            coverLetter: faker.datatype.boolean({ probability: 0.5 })
              ? `Kính gửi Nhà tuyển dụng,\n\nTôi là ${fullName}, tôi rất quan tâm đến vị trí này và mong muốn được đóng góp cho công ty.\n\nTrân trọng.`
              : null,
            aiMatchStatus,
            aiMatchScore:
              aiMatchStatus === AiMatchStatus.DONE
                ? faker.number.int({ min: 40, max: 98 })
                : null,
          },
        });
        applicationCount++;
      } catch {
        // bỏ qua nếu trùng unique (candidateId, jobId) do random trùng lặp
      }
    }

    const savedJobIds = faker.helpers.arrayElements(allJobIds, {
      min: 0,
      max: Math.min(MAX_SAVED_JOBS_PER_CANDIDATE, allJobIds.length),
    });
    if (savedJobIds.length > 0) {
      const result = await prisma.savedJob.createMany({
        data: savedJobIds.map((jobId) => ({ candidateId: candidate.id, jobId })),
        skipDuplicates: true,
      });
      savedJobCount += result.count;
    }

    const followCompanyIds = faker.helpers.arrayElements(allCompanyIds, {
      min: 0,
      max: Math.min(MAX_FOLLOWS_PER_CANDIDATE, allCompanyIds.length),
    });
    if (followCompanyIds.length > 0) {
      const result = await prisma.companyFollow.createMany({
        data: followCompanyIds.map((companyId) => ({
          candidateId: candidate.id,
          companyId,
        })),
        skipDuplicates: true,
      });
      followCount += result.count;
    }

    if ((i + 1) % 25 === 0 || i === CANDIDATES_COUNT - 1) {
      console.log(`  Đã tạo ${i + 1}/${CANDIDATES_COUNT} ứng viên`);
    }
  }

  console.log("\n✅ Hoàn tất sinh dữ liệu giả:");
  console.log(`  Companies: +${allCompanyIds.length}`);
  console.log(`  Jobs: +${allJobIds.length}`);
  console.log(`  Candidates: +${CANDIDATES_COUNT}`);
  console.log(`  Resumes: +${resumeCount}`);
  console.log(`  Applications: +${applicationCount}`);
  console.log(`  SavedJobs: +${savedJobCount}`);
  console.log(`  CompanyFollows: +${followCount}`);

  // Dữ liệu job được tạo trực tiếp bằng prisma.job.create ở trên nên KHÔNG đi
  // qua jobService.createJob (nơi tự động enqueue upsert vào OpenSearch).
  // Đồng bộ lại toàn bộ job vừa tạo vào index tìm kiếm để trang chủ / trang
  // /jobs hiển thị đúng ngay sau khi chạy script này.
  if (isOpenSearchEnabled() && allJobIds.length > 0) {
    console.log(
      `\n🔄 Đồng bộ ${allJobIds.length} job vừa tạo vào OpenSearch...`,
    );
    for (const jobId of allJobIds) {
      await enqueueUpsertJobIndex(jobId);
    }
    console.log("✅ Đã enqueue đồng bộ OpenSearch cho toàn bộ job mới.");
  }
}

main()
  .catch((err) => {
    console.error("Lỗi khi sinh dữ liệu giả:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
