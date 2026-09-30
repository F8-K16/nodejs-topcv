/**
 * Nhập companies_data.csv và jobs_data.csv vào database.
 * Công ty có trong companies_data.csv được nhập đủ hồ sơ.
 * Job có company_link chưa có hồ sơ thì tạo công ty tối thiểu từ tên và link trên tin.
 *
 * Chạy: pnpm run import:topcv-csv
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import {
  ExperienceLevel,
  JobModerationStatus,
  JobType,
} from "../generated/prisma/client";
import {
  classifyJobCategorySlug,
  JOB_CATEGORY_CATALOG,
} from "../prisma/seed/job-catalog";
import { VIETNAM_LOCATIONS } from "../prisma/seed/vietnam-locations";
import { prisma } from "../utils/prisma";
import { uniqueSlug } from "../utils/slug";

const SCRAPER_DIR = path.resolve(__dirname, "../../../TopCV-scraper");
const UNKNOWN_LOCATION = "Chưa cập nhật";
const COMPANY_SOURCE = "Nguồn TopCV:";
const JOB_SOURCE = "Nguồn TopCV:";
const NAME_LIMIT = 191;
const LOCATION_LIMIT = 191;
const TITLE_LIMIT = 191;
const WEBSITE_LIMIT = 191;
const LOGO_LIMIT = 512;

type CompanyRow = {
  name: string;
  companyLink: string;
  logo: string;
  description: string;
  website: string;
  size: string;
  industries: string;
  address: string;
};

type JobRow = {
  title: string;
  jobLink: string;
  companyLink: string;
  company: string;
  deadline: string;
  location: string;
  experience: string;
  addresses: string[];
  skills: string[];
  income: string;
  description: string;
};

type CompanyRecord = {
  id: number;
  name: string;
  slug: string;
  website: string | null;
  description: string | null;
  provinceId: number;
};

const cut = (value: string, limit: number) => value.trim().slice(0, limit);

const readCsv = (): { companies: CompanyRow[]; jobs: JobRow[] } => {
  const raw = execFileSync("python3", ["-c", PYTHON_READER, SCRAPER_DIR], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  return JSON.parse(raw) as { companies: CompanyRow[]; jobs: JobRow[] };
};

const topcvId = (link: string) => link.match(/\/(\d+)\.html/i)?.[1] ?? link;

const uniqueName = (base: string, id: string, used: Set<string>) => {
  const plain = cut(base, NAME_LIMIT);
  if (!used.has(plain.toLowerCase())) {
    used.add(plain.toLowerCase());
    return plain;
  }
  const suffix = ` (${id})`;
  const next = `${cut(base, NAME_LIMIT - suffix.length)}${suffix}`;
  used.add(next.toLowerCase());
  return next;
};

const companyDescription = (row: CompanyRow, stub: boolean) => {
  if (stub) {
    return `Hồ sơ công ty được tạo từ tin tuyển dụng TopCV, chưa có thông tin chi tiết.\n\n${COMPANY_SOURCE} ${row.companyLink}`;
  }
  const parts = [row.description];
  if (row.size) parts.push(`Quy mô: ${row.size}`);
  if (row.industries) parts.push(`Ngành nghề: ${row.industries}`);
  if (row.website) parts.push(`Website: ${row.website}`);
  parts.push(`${COMPANY_SOURCE} ${row.companyLink}`);
  return parts.filter(Boolean).join("\n\n");
};

const storedWebsite = (row: CompanyRow) => {
  const site = row.website.trim();
  if (site.startsWith("http") && site.length <= WEBSITE_LIMIT) return site;
  return cut(row.companyLink, WEBSITE_LIMIT);
};

const linkFromCompany = (row: CompanyRecord) => {
  const website = row.website ?? "";
  if (website.includes("/cong-ty/")) return website.split("?")[0] ?? website;
  const match = row.description?.match(
    /https:\/\/www\.topcv\.vn\/cong-ty\/[^\s]+/i,
  );
  return match?.[0]?.replace(/[).,]+$/, "") ?? "";
};

const fold = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

type SeededDistrict = { id: number; provinceId: number; name: string; keys: string[] };

const districtKeys = (name: string, aliases: string[] = []) => {
  const bare = fold(name).replace(/^(quan|huyen|thi xa|thanh pho)\s+/, "");
  return [...new Set([fold(name), bare, ...aliases.map(fold)].filter((key) => key.length >= 2))];
};

const parseSalary = (text: string) => {
  const range = text.match(/(\d+(?:[.,]\d+)?)\s*-\s*(\d+(?:[.,]\d+)?)\s*triệu/i);
  const toVnd = (raw: string) => Math.round(Number(raw.replace(",", ".")) * 1_000_000);
  if (range?.[1] && range[2]) {
    return { minSalary: toVnd(range[1]), maxSalary: toVnd(range[2]) };
  }
  const from = text.match(/Từ\s+(\d+(?:[.,]\d+)?)\s*triệu/i);
  if (from?.[1]) return { minSalary: toVnd(from[1]), maxSalary: null };
  return { minSalary: null, maxSalary: null };
};

const experienceLevel = (raw: string, title: string) => {
  if (/thực tập|intern/i.test(title)) return ExperienceLevel.INTERN;
  const text = raw.toLowerCase();
  if (text.includes("không yêu cầu") || text.includes("dưới 1")) {
    return ExperienceLevel.FRESHER;
  }
  if (text.includes("trên 5")) return ExperienceLevel.LEAD;
  const years = Number(text.match(/(\d+)/)?.[1] ?? NaN);
  if (years >= 5) return ExperienceLevel.SENIOR;
  if (years >= 3) return ExperienceLevel.MIDDLE;
  if (years >= 1) return ExperienceLevel.JUNIOR;
  return ExperienceLevel.FRESHER;
};

const jobType = (title: string, description: string) => {
  const text = `${title}\n${description}`;
  if (/freelance|cộng tác viên/i.test(text)) return JobType.FREELANCE;
  if (/bán thời gian|part[- ]?time/i.test(text)) return JobType.PART_TIME;
  return JobType.FULL_TIME;
};

const parseDeadline = (value: string) => {
  const match = value.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!match?.[1] || !match[2] || !match[3]) return null;
  const date = new Date(Date.UTC(Number(match[3]), Number(match[2]) - 1, Number(match[1]), 12));
  return Number.isNaN(date.getTime()) ? null : date;
};

const categorySlug = (title: string) => classifyJobCategorySlug(title);

const ensureLocations = async () => {
  const districts: SeededDistrict[] = [];
  const provinceIdByCode = new Map<string, number>();
  const defaultDistrictByProvince = new Map<number, number>();

  for (const location of VIETNAM_LOCATIONS) {
    const province = await prisma.province.upsert({
      where: { code: location.code },
      update: { name: location.name, deletedAt: null },
      create: { code: location.code, name: location.name },
      select: { id: true },
    });
    provinceIdByCode.set(location.code, province.id);
    for (const district of location.districts) {
      const existing = await prisma.district.findFirst({
        where: { name: district.name, provinceId: province.id },
        select: { id: true },
      });
      const row =
        existing ??
        (await prisma.district.create({
          data: { name: district.name, provinceId: province.id },
          select: { id: true },
        }));
      if (existing?.id) {
        await prisma.district.update({
          where: { id: existing.id },
          data: { deletedAt: null },
        });
      }
      districts.push({
        id: row.id,
        provinceId: province.id,
        name: district.name,
        keys: districtKeys(district.name, district.aliases),
      });
      if (!defaultDistrictByProvince.has(province.id)) {
        defaultDistrictByProvince.set(province.id, row.id);
      }
    }
  }

  const provinceMatchers = VIETNAM_LOCATIONS.map((location) => ({
    provinceId: provinceIdByCode.get(location.code)!,
    keys: [fold(location.name).replace(/^thanh pho\s+/, ""), ...location.aliases.map(fold)],
  }));

  return { districts, provinceMatchers, defaultDistrictByProvince };
};

const containsTerm = (haystack: string, key: string) => {
  if (key.length < 3) return false;
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|\\s)${escaped}(?:\\s|$)`).test(haystack);
};

const matchLocation = (
  text: string,
  locations: Awaited<ReturnType<typeof ensureLocations>>,
) => {
  const folded = fold(text);
  const provinceHits = locations.provinceMatchers.filter((row) =>
    row.keys.some((key) => containsTerm(folded, key)),
  );
  const provinceIds = new Set(provinceHits.map((row) => row.provinceId));
  const pool =
    provinceIds.size > 0
      ? locations.districts.filter((row) => provinceIds.has(row.provinceId))
      : locations.districts;
  let best: SeededDistrict | undefined;
  let bestLength = 0;
  for (const district of pool) {
    for (const key of district.keys) {
      if (key.length > bestLength && containsTerm(folded, key)) {
        best = district;
        bestLength = key.length;
      }
    }
  }
  if (best) return { provinceId: best.provinceId, districtId: best.id };
  const provinceId = provinceHits[0]?.provinceId ?? locations.provinceMatchers[0]?.provinceId;
  const districtId = provinceId
    ? locations.defaultDistrictByProvince.get(provinceId)
    : undefined;
  if (!provinceId || !districtId) throw new Error("Thiếu tỉnh thành Việt Nam");
  return { provinceId, districtId };
};

const ensureCategory = async () => {
  for (const parent of JOB_CATEGORY_CATALOG) {
    const parentRow = await prisma.categoryParent.upsert({
      where: { slug: parent.slug },
      update: { name: parent.name, deletedAt: null },
      create: { name: parent.name, slug: parent.slug },
      select: { id: true },
    });
    for (const category of parent.categories) {
      await prisma.category.upsert({
        where: { slug: category.slug },
        update: {
          name: category.name,
          parentCategoryId: parentRow.id,
          deletedAt: null,
        },
        create: {
          name: category.name,
          slug: category.slug,
          parentCategoryId: parentRow.id,
        },
      });
    }
  }
  const categories = await prisma.category.findMany({
    where: { deletedAt: null },
    select: { id: true, slug: true },
  });
  return new Map(categories.map((row) => [row.slug, row.id]));
};

const indexCompanies = (rows: CompanyRecord[]) => {
  const byLink = new Map<string, CompanyRecord>();
  const usedNames = new Set<string>();
  const usedSlugs = new Set<string>();
  for (const row of rows) {
    usedNames.add(row.name.toLowerCase());
    if (row.slug) usedSlugs.add(row.slug);
    const link = linkFromCompany(row);
    if (link) byLink.set(link, row);
    if (row.website) byLink.set(row.website, row);
  }
  return { byLink, usedNames, usedSlugs };
};

const loadCompanies = async () => {
  const rows = await prisma.company.findMany({
    where: { deletedAt: null },
    select: {
      id: true,
      name: true,
      slug: true,
      website: true,
      description: true,
      provinceId: true,
    },
  });
  return indexCompanies(rows);
};

const clearJobGraph = async () => {
  const [applications, savedJobs, jobSkills, jobs] = await prisma.$transaction([
    prisma.application.deleteMany(),
    prisma.savedJob.deleteMany(),
    prisma.jobSkill.deleteMany(),
    prisma.job.deleteMany(),
  ]);
  const skills = await prisma.skill.deleteMany({
    where: { candidateSkills: { none: {} }, jobSkills: { none: {} } },
  });
  await prisma.companyCategory.deleteMany();
  console.log(
    `Đã xóa ${jobs.count} việc làm, ${jobSkills.count} kỹ năng gắn việc, ${skills.count} skill, ${applications.count} đơn ứng tuyển, ${savedJobs.count} việc đã lưu.`,
  );
};

const skillCache = new Map<string, number>();

const ensureSkill = async (name: string) => {
  const label = cut(name, 120);
  if (!label) return null;
  const key = label.toLowerCase();
  const cached = skillCache.get(key);
  if (cached) return cached;
  const row = await prisma.skill.upsert({
    where: { name: label },
    update: { deletedAt: null },
    create: { name: label },
    select: { id: true },
  });
  skillCache.set(key, row.id);
  return row.id;
};

const syncJobSkills = async (jobId: number, names: string[]) => {
  const skillIds = [
    ...new Set(
      (await Promise.all(names.map((name) => ensureSkill(name)))).filter(
        (id): id is number => id != null,
      ),
    ),
  ];
  await prisma.jobSkill.deleteMany({ where: { jobId } });
  if (!skillIds.length) return;
  await prisma.jobSkill.createMany({
    data: skillIds.map((skillId) => ({ jobId, skillId })),
    skipDuplicates: true,
  });
};

const syncCompanyCategories = async () => {
  const rows = await prisma.job.findMany({
    where: { deletedAt: null },
    select: {
      companyId: true,
      category: { select: { parentCategoryId: true } },
    },
  });
  const pairs = new Map<string, { companyId: number; parentCategoryId: number }>();
  for (const row of rows) {
    const key = `${row.companyId}:${row.category.parentCategoryId}`;
    pairs.set(key, {
      companyId: row.companyId,
      parentCategoryId: row.category.parentCategoryId,
    });
  }
  if (!pairs.size) return;
  await prisma.companyCategory.createMany({
    data: [...pairs.values()],
    skipDuplicates: true,
  });
  console.log(`Đã gắn ${pairs.size} danh mục cho công ty.`);
};

const ADMIN_EMAIL = "haovaf8@fullstack.edu.vn";

const wipeExceptAdmin = async () => {
  const admin = await prisma.user.findUnique({
    where: { email: ADMIN_EMAIL },
    select: { id: true },
  });
  if (!admin) throw new Error(`Không thấy tài khoản admin ${ADMIN_EMAIL}`);

  await prisma.chatMessage.deleteMany();
  await prisma.chatConversation.deleteMany();
  await prisma.application.deleteMany();
  await prisma.savedJob.deleteMany();
  await prisma.jobSkill.deleteMany();
  await prisma.job.deleteMany();
  await prisma.companyFollow.deleteMany();
  await prisma.companyCategory.deleteMany();
  await prisma.employer.deleteMany();
  await prisma.candidatePreference.deleteMany();
  await prisma.candidateSkill.deleteMany();
  await prisma.candidateCategory.deleteMany();
  await prisma.resume.deleteMany();
  await prisma.candidate.deleteMany();
  await prisma.cv.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.company.deleteMany();
  await prisma.skill.deleteMany();
  await prisma.userPhone.deleteMany({ where: { userId: { not: admin.id } } });
  await prisma.userRole.deleteMany({ where: { userId: { not: admin.id } } });
  await prisma.userPermission.deleteMany({ where: { userId: { not: admin.id } } });
  const removedUsers = await prisma.user.deleteMany({ where: { id: { not: admin.id } } });
  await prisma.district.deleteMany();
  await prisma.province.deleteMany();
  console.log(`Đã xóa ${removedUsers.count} user, chỉ giữ ${ADMIN_EMAIL}.`);
};

const main = async () => {
  if (process.argv.includes("--reseed")) await wipeExceptAdmin();
  await clearJobGraph();
  const { companies, jobs } = readCsv();
  const locations = await ensureLocations();
  const categories = await ensureCategory();
  const fallbackCategoryId = categories.get("khac");
  if (!fallbackCategoryId) throw new Error("Thiếu danh mục Khác");

  let createdCompanies = 0;
  let updatedCompanies = 0;
  let stubCompanies = 0;

  const applyCompany = async (row: CompanyRow, stub: boolean, jobLocation: string) => {
    const state = await loadCompanies();
    const current = state.byLink.get(row.companyLink);
    const place = matchLocation(`${row.address} ${jobLocation}`, locations);
    const data = {
      logo: row.logo ? cut(row.logo, LOGO_LIMIT) : null,
      website: storedWebsite(row),
      location: cut(row.address || jobLocation || UNKNOWN_LOCATION, LOCATION_LIMIT),
      status: true,
      deletedAt: null,
      description: companyDescription(row, stub),
      provinceId: place.provinceId,
      districtId: place.districtId,
    };
    if (current) {
      await prisma.company.update({
        where: { id: current.id },
        data,
      });
      updatedCompanies += 1;
      return;
    }
    const name = uniqueName(
      row.name || "Công ty TopCV",
      topcvId(row.companyLink),
      state.usedNames,
    );
    await prisma.company.create({
      data: {
        ...data,
        name,
        slug: uniqueSlug(name, state.usedSlugs),
      },
    });
    if (stub) stubCompanies += 1;
    else createdCompanies += 1;
  };

  const jobLocationByLink = new Map<string, string>();
  for (const job of jobs) {
    if (!jobLocationByLink.has(job.companyLink)) {
      jobLocationByLink.set(job.companyLink, job.location);
    }
  }

  console.log(`Nhập ${companies.length} công ty từ companies_data.csv`);
  for (const row of companies) {
    await applyCompany(row, false, jobLocationByLink.get(row.companyLink) ?? "");
  }

  const covered = new Set(companies.map((row) => row.companyLink));
  const missingLinks = [...new Set(jobs.map((job) => job.companyLink))].filter(
    (link) => !covered.has(link),
  );
  console.log(`Tạo hồ sơ tối thiểu cho ${missingLinks.length} công ty chưa có trong companies_data.csv`);
  for (const link of missingLinks) {
    const sample = jobs.find((job) => job.companyLink === link);
    if (!sample) continue;
    await applyCompany(
      {
        name: sample.company,
        companyLink: link,
        logo: "",
        description: "",
        website: "",
        size: "",
        industries: "",
        address: "",
      },
      true,
      sample.location,
    );
  }

  const state = await loadCompanies();
  const existingJobs = await prisma.job.findMany({
    where: { description: { contains: "topcv.vn/viec-lam/" } },
    select: { id: true, description: true },
  });
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
  const jobByLink = new Map<string, number>();
  for (const job of existingJobs) {
    const match = job.description.match(/https:\/\/www\.topcv\.vn\/viec-lam\/[^\s]+/i);
    if (match?.[0]) jobByLink.set(match[0], job.id);
  }

  let createdJobs = 0;
  let updatedJobs = 0;
  let skippedJobs = 0;
  for (const job of jobs) {
    const company = state.byLink.get(job.companyLink);
    if (!company) {
      skippedJobs += 1;
      continue;
    }
    const salary = parseSalary(job.income);
    const categoryId = categories.get(categorySlug(job.title)) ?? fallbackCategoryId;
    const workLocation = cut(
      job.addresses[0] || job.location || UNKNOWN_LOCATION,
      LOCATION_LIMIT,
    );
    const description = `${job.description || job.title}\n\n${JOB_SOURCE} ${job.jobLink}`;
    const payload = {
      title: cut(job.title, TITLE_LIMIT),
      description,
      minSalary: salary.minSalary,
      maxSalary: salary.maxSalary,
      quantity: 1,
      jobType: jobType(job.title, job.description),
      experienceLevel: experienceLevel(job.experience, job.title),
      moderationStatus: JobModerationStatus.APPROVED,
      deadline: parseDeadline(job.deadline),
      isFeatured: false,
      workLocation,
      companyId: company.id,
      categoryId,
    };
    const existingId = jobByLink.get(job.jobLink);
    const jobId = existingId
      ? (
          await prisma.job.update({
            where: { id: existingId },
            data: payload,
            select: { id: true },
          })
        ).id
      : (
          await prisma.job.create({
            data: { ...payload, slug: uniqueSlug(payload.title, usedJobSlugs) },
            select: { id: true },
          })
        ).id;
    if (existingId) updatedJobs += 1;
    else {
      jobByLink.set(job.jobLink, jobId);
      createdJobs += 1;
    }
    await syncJobSkills(jobId, job.skills);
  }

  await syncCompanyCategories();

  console.log(
    `Xong. Công ty tạo mới ${createdCompanies}, tối thiểu ${stubCompanies}, cập nhật ${updatedCompanies}. Job tạo mới ${createdJobs}, cập nhật ${updatedJobs}, bỏ qua ${skippedJobs}.`,
  );
};

const PYTHON_READER = String.raw`
import ast, csv, json, sys
from pathlib import Path
base = Path(sys.argv[1])

def companies():
    rows = []
    seen_links = set()
    seen_names = {}
    aliases = {}
    with open(base / "companies_data.csv", encoding="utf-8") as handle:
        for row in csv.DictReader(handle):
            link = (row.get("company_link") or "").split("?")[0].strip()
            name = (row.get("name") or "").strip()
            if not link or link in seen_links:
                continue
            key = name.casefold()
            if key and key in seen_names:
                aliases[link] = seen_names[key]
                continue
            seen_links.add(link)
            if key:
                seen_names[key] = link
            rows.append({
                "name": name,
                "companyLink": link,
                "logo": (row.get("logo") or "").strip(),
                "description": (row.get("description") or "").strip(),
                "website": (row.get("website") or "").strip(),
                "size": (row.get("size") or "").strip(),
                "industries": (row.get("industries") or "").strip(),
                "address": (row.get("address") or "").strip(),
            })
    return rows, aliases

def jobs(aliases):
    rows = []
    seen = set()
    seen_titles = set()
    with open(base / "jobs_data.csv", encoding="utf-8") as handle:
        for row in csv.DictReader(handle):
            link = (row.get("job_link") or "").split("?")[0].strip()
            company = (row.get("company_link") or "").split("?")[0].strip()
            company = aliases.get(company, company)
            title = (row.get("title") or "").strip()
            title_key = (title.casefold(), company)
            if not link or not company or link in seen or title_key in seen_titles:
                continue
            seen.add(link)
            seen_titles.add(title_key)
            overview = ast.literal_eval(row.get("overview") or "{}")
            details = ast.literal_eval(row.get("job_details") or "{}")
            addresses = ast.literal_eval(row.get("addresses") or "[]")
            skills = ast.literal_eval(row.get("skills") or "[]")
            sections = []
            for label in ("Mô tả công việc", "Yêu cầu ứng viên", "Quyền lợi ứng viên", "Thu nhập"):
                text = (details.get(label) or "").strip()
                if text:
                    sections.append(f"{label}\n{text}")
            if skills:
                sections.append("Kỹ năng\n" + ", ".join(skills))
            rows.append({
                "title": (row.get("title") or "").strip(),
                "jobLink": link,
                "companyLink": company,
                "company": (row.get("company") or "").strip(),
                "deadline": (row.get("deadline") or overview.get("Hạn ứng tuyển") or "").strip(),
                "location": (overview.get("Địa điểm") or "").strip(),
                "experience": (overview.get("Kinh nghiệm") or "").strip(),
                "addresses": addresses,
                "skills": skills,
                "income": (details.get("Thu nhập") or "").strip(),
                "description": "\n\n".join(sections),
            })
    return rows

company_rows, company_aliases = companies()
json.dump({"companies": company_rows, "jobs": jobs(company_aliases)}, sys.stdout, ensure_ascii=False)
`;

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
