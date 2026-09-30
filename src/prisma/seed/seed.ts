import {
  ApplicationStatus,
  CvStatus,
  EmployerStatus,
  ExperienceLevel,
  JobModerationStatus,
  JobType,
} from "../../generated/prisma/client";
import { hashPassword } from "../../utils/hashing";
import { JOB_CATEGORY_CATALOG } from "./job-catalog";
import { ensureAdminRoutePermissions } from "../../services/admin-permission-sync.service";
import { prisma } from "../../utils/prisma";
import { uniqueSlug } from "../../utils/slug";

const ADMIN_EMAIL = "haovaf8@fullstack.edu.vn";
const ADMIN_PASSWORD = "admin@2606";

const upsertDistrict = async (name: string, provinceId: number) => {
  const existing = await prisma.district.findFirst({
    where: { name, provinceId },
    select: { id: true },
  });

  if (existing) return existing;

  return prisma.district.create({
    data: { name, provinceId },
    select: { id: true },
  });
};

const upsertSeedUser = async (data: {
  email: string;
  username: string;
  password: string;
}) => {
  return prisma.user.upsert({
    where: { email: data.email },
    update: {
      username: data.username,
      password: hashPassword(data.password),
      isVerified: true,
      isBlocked: false,
      receiveEmailNotifications: true,
    },
    create: {
      email: data.email,
      username: data.username,
      password: hashPassword(data.password),
      isVerified: true,
      isBlocked: false,
      receiveEmailNotifications: true,
    },
    select: { id: true },
  });
};

const upsertUserPhone = async (userId: number, phone: string) => {
  await prisma.userPhone.upsert({
    where: { userId },
    update: { phone },
    create: { userId, phone },
  });
};

const cvProfileBlocks = [
  { id: "full-name", type: "text", bindingPath: "profile.fullName", defaultValue: "Nguyễn Minh Anh" },
  { id: "title", type: "text", bindingPath: "profile.title", defaultValue: "Lập trình viên Frontend" },
  { id: "email", type: "text", bindingPath: "profile.email", defaultValue: "minh.anh@email.com" },
  { id: "phone", type: "text", bindingPath: "profile.phone", defaultValue: "0901 234 567" },
  { id: "address", type: "text", bindingPath: "profile.address", defaultValue: "Quận 1, TP. Hồ Chí Minh" },
  { id: "website", type: "text", bindingPath: "profile.website", defaultValue: "github.com/minhanh" },
  {
    id: "summary",
    type: "multiline",
    bindingPath: "summary.text",
    defaultValue:
      "Lập trình viên frontend với 3 năm kinh nghiệm React và TypeScript. Tập trung vào giao diện rõ ràng, hiệu năng và trải nghiệm người dùng.",
  },
];

const cvSections = [
  {
    id: "experience",
    label: "Kinh nghiệm",
    bindingPath: "experience",
    defaultItem: {
      role: "Frontend Developer",
      company: "F8 Technology",
      period: "2023 - Nay",
      description: "Xây dựng giao diện tuyển dụng, tối ưu hiệu năng và phối hợp API.",
    },
    sampleItems: [
      {
        role: "Frontend Developer",
        company: "F8 Technology",
        period: "2023 - Nay",
        description: "Xây dựng giao diện tuyển dụng, tối ưu hiệu năng và phối hợp API.",
      },
      {
        role: "Thực tập sinh Web",
        company: "Nova Digital",
        period: "2022 - 2023",
        description: "Tham gia phát triển landing page và trang quản trị nội bộ.",
      },
    ],
    itemBlocks: [
      { id: "role", type: "text", bindingPath: "role" },
      { id: "company", type: "text", bindingPath: "company" },
      { id: "period", type: "text", bindingPath: "period" },
      { id: "description", type: "multiline", bindingPath: "description" },
    ],
  },
  {
    id: "education",
    label: "Học vấn",
    bindingPath: "education",
    defaultItem: {
      major: "Công nghệ thông tin",
      school: "Đại học Bách khoa TP.HCM",
      period: "2018 - 2022",
      description: "Tốt nghiệp loại Khá. Đồ án về hệ thống tuyển dụng trực tuyến.",
    },
    sampleItems: [
      {
        major: "Công nghệ thông tin",
        school: "Đại học Bách khoa TP.HCM",
        period: "2018 - 2022",
        description: "Tốt nghiệp loại Khá. Đồ án về hệ thống tuyển dụng trực tuyến.",
      },
    ],
    itemBlocks: [
      { id: "major", type: "text", bindingPath: "major" },
      { id: "school", type: "text", bindingPath: "school" },
      { id: "period", type: "text", bindingPath: "period" },
      { id: "description", type: "multiline", bindingPath: "description" },
    ],
  },
  {
    id: "skills",
    label: "Kỹ năng",
    bindingPath: "skills",
    defaultItem: { name: "React" },
    sampleItems: [
      { name: "React" },
      { name: "TypeScript" },
      { name: "Tailwind CSS" },
      { name: "Node.js" },
    ],
    itemBlocks: [{ id: "name", type: "text", bindingPath: "name" }],
  },
];

const CV_TEMPLATE_PRESETS = [
  { name: "Cổ điển", description: "Một cột, đầu trang xanh.", layout: "single-column", theme: "green", variant: "classic" },
  { name: "Tối giản", description: "Một cột, ít trang trí.", layout: "single-column", theme: "slate", variant: "minimal" },
  { name: "Điều hành", description: "Hai cột, kiểu trang trọng.", layout: "two-column", theme: "slate", variant: "executive" },
  { name: "Sáng tạo", description: "Một cột, nhấn màu.", layout: "single-column", theme: "green", variant: "creative" },
  { name: "Thẻ hiện đại", description: "Các mục đặt trong thẻ.", layout: "single-column", theme: "slate", variant: "modernCard" },
  { name: "Gradient", description: "Đầu trang chuyển màu.", layout: "single-column", theme: "green", variant: "gradient" },
  { name: "Gọn", description: "Mật độ chữ cao, tiết kiệm trang.", layout: "single-column", theme: "green", variant: "compact" },
  { name: "Tối", description: "Nền tối, chữ sáng.", layout: "single-column", theme: "slate", variant: "dark" },
  { name: "Dòng thời gian", description: "Kinh nghiệm theo mốc thời gian.", layout: "single-column", theme: "slate", variant: "timeline" },
  { name: "Báo", description: "Bố cục kiểu báo in.", layout: "single-column", theme: "slate", variant: "newspaper" },
  { name: "Đậm", description: "Tương phản cao.", layout: "single-column", theme: "green", variant: "bold" },
  { name: "Thanh bên", description: "Hai cột, sidebar nhạt.", layout: "two-column", theme: "slate", variant: "softSidebar" },
  { name: "Chuyên nghiệp", description: "Một cột, tông xám trang trọng.", layout: "single-column", theme: "slate", variant: "classic" },
  { name: "Fresher", description: "Gọn, phù hợp ứng viên mới ra trường.", layout: "single-column", theme: "green", variant: "compact" },
  { name: "Kỹ thuật", description: "Kinh nghiệm theo mốc thời gian, tông xanh.", layout: "single-column", theme: "green", variant: "timeline" },
  { name: "Kinh doanh", description: "Hai cột, sidebar xanh cho vị trí sales.", layout: "two-column", theme: "green", variant: "softSidebar" },
  { name: "Hiện đại xanh", description: "Các mục đặt trong thẻ, tông xanh.", layout: "single-column", theme: "green", variant: "modernCard" },
  { name: "Tối giản xanh", description: "Ít trang trí, nhấn màu xanh.", layout: "single-column", theme: "green", variant: "minimal" },
  { name: "Điều hành xanh", description: "Hai cột trang trọng, tông xanh.", layout: "two-column", theme: "green", variant: "executive" },
  { name: "Báo xanh", description: "Bố cục báo in, nhấn xanh.", layout: "single-column", theme: "green", variant: "newspaper" },
] as const;

const upsertCvTemplate = async () => {
  let firstId = 0;
  for (const preset of CV_TEMPLATE_PRESETS) {
    const templateData = {
      layout: preset.layout,
      meta: { theme: preset.theme, variant: preset.variant, density: "comfortable" },
      blocks: cvProfileBlocks,
      sections: cvSections,
    };
    const existing = await prisma.cvTemplate.findFirst({
      where: { name: preset.name },
      select: { id: true },
    });
    const row = existing
      ? await prisma.cvTemplate.update({
          where: { id: existing.id },
          data: {
            description: preset.description,
            thumbnailUrl: null,
            templateData,
            status: true,
            deletedAt: null,
          },
          select: { id: true },
        })
      : await prisma.cvTemplate.create({
          data: {
            name: preset.name,
            description: preset.description,
            templateData,
            status: true,
          },
          select: { id: true },
        });
    if (!firstId) firstId = row.id;
  }
  return { id: firstId };
};

const upsertJob = async (data: {
  title: string;
  description: string;
  minSalary: number;
  maxSalary: number;
  quantity: number;
  jobType: JobType;
  experienceLevel: ExperienceLevel;
  deadline: Date;
  isFeatured: boolean;
  workLocation: string;
  employerId: number;
  companyId: number;
  categoryId: number;
  viewCount: number;
}) => {
  const existing = await prisma.job.findFirst({
    where: { title: data.title, companyId: data.companyId },
    select: { id: true, slug: true },
  });

  if (existing) {
    return prisma.job.update({
      where: { id: existing.id },
      data: {
        ...data,
        moderationStatus: JobModerationStatus.APPROVED,
      },
      select: { id: true },
    });
  }

  const usedSlugs = new Set(
    (
      await prisma.job.findMany({
        select: { slug: true },
      })
    )
      .map((row) => row.slug)
      .filter((slug): slug is string => Boolean(slug)),
  );
  usedSlugs.add("recommended");
  usedSlugs.add("suggest");
  usedSlugs.add("saved");

  return prisma.job.create({
    data: {
      ...data,
      slug: uniqueSlug(data.title, usedSlugs),
      moderationStatus: JobModerationStatus.APPROVED,
    },
    select: { id: true },
  });
};

const upsertResume = async (candidateId: number) => {
  const title = "CV Nguyen Van Candidate";
  const existing = await prisma.resume.findFirst({
    where: { candidateId, title },
    select: { id: true },
  });

  if (existing) {
    return prisma.resume.update({
      where: { id: existing.id },
      data: {
        fileUrl: "https://example.com/resumes/nguyen-van-candidate.pdf",
      },
      select: { id: true },
    });
  }

  return prisma.resume.create({
    data: {
      candidateId,
      title,
      fileUrl: "https://example.com/resumes/nguyen-van-candidate.pdf",
    },
    select: { id: true },
  });
};

const ensureNotification = async (data: {
  userId: number;
  type: string;
  title: string;
  body: string;
  link: string;
}) => {
  const existing = await prisma.notification.findFirst({
    where: { userId: data.userId, type: data.type, title: data.title },
    select: { id: true },
  });

  if (!existing) {
    await prisma.notification.create({ data });
  }
};

const ensureAuditLog = async (actorUserId: number) => {
  const existing = await prisma.auditLog.findFirst({
    where: {
      actorUserId,
      action: "SEED_DATABASE",
      entityType: "Database",
      entityId: "initial-seed",
    },
    select: { id: true },
  });

  if (!existing) {
    await prisma.auditLog.create({
      data: {
        actorUserId,
        action: "SEED_DATABASE",
        entityType: "Database",
        entityId: "initial-seed",
        success: true,
        requestId: "seed-script",
        ip: "127.0.0.1",
        userAgent: "ts-node seed",
        metadata: {
          source: "src/prisma/seed/seed.ts",
        },
      },
    });
  }
};

const main = async () => {
  await prisma.siteSettings.upsert({
    where: { id: 1 },
    update: {
      siteName: "F8 TopCV",
      seoTitle: "F8 TopCV - Nền tảng tuyển dụng IT",
      seoDescription:
        "Dữ liệu seed cho môi trường local của JobPortal TopCV.",
      maintenanceMode: false,
      smtpHost: "smtp.gmail.com",
      smtpPort: 587,
      smtpUser: ADMIN_EMAIL,
      smtpFrom: ADMIN_EMAIL,
    },
    create: {
      id: 1,
      siteName: "F8 TopCV",
      seoTitle: "F8 TopCV - Nền tảng tuyển dụng IT",
      seoDescription:
        "Dữ liệu seed cho môi trường local của JobPortal TopCV.",
      maintenanceMode: false,
      smtpHost: "smtp.gmail.com",
      smtpPort: 587,
      smtpUser: ADMIN_EMAIL,
      smtpFrom: ADMIN_EMAIL,
    },
  });

  const moduleNames = [
    "DASHBOARD",
    "USER",
    "ROLE",
    "COMPANY",
    "JOB",
    "APPLICATION",
    "CATEGORY",
    "SKILL",
    "SETTING",
  ];
  const actionNames = ["VIEW", "CREATE", "UPDATE", "DELETE", "APPROVE"];

  const modules = new Map<string, number>();
  for (const name of moduleNames) {
    const row = await prisma.module.upsert({
      where: { name },
      update: { status: true },
      create: { name, status: true },
      select: { id: true },
    });
    modules.set(name, row.id);
  }

  const actions = new Map<string, number>();
  for (const name of actionNames) {
    const row = await prisma.action.upsert({
      where: { name },
      update: { status: true },
      create: { name, status: true },
      select: { id: true },
    });
    actions.set(name, row.id);
  }

  const permissions = new Map<string, number>();
  for (const moduleName of moduleNames) {
    for (const actionName of actionNames) {
      const moduleId = modules.get(moduleName)!;
      const actionId = actions.get(actionName)!;
      const moduleAction = await prisma.moduleAction.upsert({
        where: { moduleId_actionId: { moduleId, actionId } },
        update: {},
        create: { moduleId, actionId },
        select: { id: true },
      });
      const permissionName = `${moduleName}_${actionName}`;
      const permission = await prisma.permission.upsert({
        where: { name: permissionName },
        update: { moduleActionId: moduleAction.id },
        create: {
          name: permissionName,
          moduleActionId: moduleAction.id,
        },
        select: { id: true },
      });
      permissions.set(permissionName, permission.id);
    }
  }

  const roleNames = ["ADMIN", "MODERATOR", "SUPPORT", "EMPLOYER", "CANDIDATE"];
  const roles = new Map<string, number>();
  for (const name of roleNames) {
    const row = await prisma.role.upsert({
      where: { name },
      update: { status: true },
      create: { name, status: true },
      select: { id: true },
    });
    roles.set(name, row.id);
  }

  const permissionIds = Array.from(permissions.values());
  await prisma.rolePermission.createMany({
    data: permissionIds.map((permissionId) => ({
      roleId: roles.get("ADMIN")!,
      permissionId,
    })),
    skipDuplicates: true,
  });
  await ensureAdminRoutePermissions();

  const employerPermissionNames = [
    "DASHBOARD_VIEW",
    "COMPANY_VIEW",
    "COMPANY_UPDATE",
    "JOB_VIEW",
    "JOB_CREATE",
    "JOB_UPDATE",
    "APPLICATION_VIEW",
  ];
  await prisma.rolePermission.createMany({
    data: employerPermissionNames.map((name) => ({
      roleId: roles.get("EMPLOYER")!,
      permissionId: permissions.get(name)!,
    })),
    skipDuplicates: true,
  });

  const candidatePermissionNames = [
    "JOB_VIEW",
    "COMPANY_VIEW",
    "APPLICATION_CREATE",
    "APPLICATION_VIEW",
  ];
  await prisma.rolePermission.createMany({
    data: candidatePermissionNames.map((name) => ({
      roleId: roles.get("CANDIDATE")!,
      permissionId: permissions.get(name)!,
    })),
    skipDuplicates: true,
  });

  const admin = await prisma.user.upsert({
    where: { email: ADMIN_EMAIL },
    update: {
      username: "admin",
      password: hashPassword(ADMIN_PASSWORD),
      isVerified: true,
      isBlocked: false,
      receiveEmailNotifications: true,
    },
    create: {
      email: ADMIN_EMAIL,
      username: "admin",
      password: hashPassword(ADMIN_PASSWORD),
      isVerified: true,
      isBlocked: false,
      receiveEmailNotifications: true,
    },
    select: { id: true },
  });

  const employerUser = await prisma.user.upsert({
    where: { email: "employer.seed@topcv.local" },
    update: {
      username: "employer_seed",
      password: hashPassword("Employer@2606"),
      isVerified: true,
      isBlocked: false,
    },
    create: {
      email: "employer.seed@topcv.local",
      username: "employer_seed",
      password: hashPassword("Employer@2606"),
      isVerified: true,
      isBlocked: false,
    },
    select: { id: true },
  });

  const candidateUser = await prisma.user.upsert({
    where: { email: "candidate.seed@topcv.local" },
    update: {
      username: "candidate_seed",
      password: hashPassword("Candidate@2606"),
      isVerified: true,
      isBlocked: false,
    },
    create: {
      email: "candidate.seed@topcv.local",
      username: "candidate_seed",
      password: hashPassword("Candidate@2606"),
      isVerified: true,
      isBlocked: false,
    },
    select: { id: true },
  });

  await prisma.userRole.createMany({
    data: [
      { userId: admin.id, roleId: roles.get("ADMIN")! },
      { userId: employerUser.id, roleId: roles.get("EMPLOYER")! },
      { userId: candidateUser.id, roleId: roles.get("CANDIDATE")! },
    ],
    skipDuplicates: true,
  });

  await prisma.userPermission.createMany({
    data: [
      {
        userId: admin.id,
        permissionId: permissions.get("SETTING_UPDATE")!,
      },
    ],
    skipDuplicates: true,
  });

  await prisma.userPhone.upsert({
    where: { userId: admin.id },
    update: { phone: "0902606001" },
    create: { userId: admin.id, phone: "0902606001" },
  });
  await prisma.userPhone.upsert({
    where: { userId: employerUser.id },
    update: { phone: "0902606002" },
    create: { userId: employerUser.id, phone: "0902606002" },
  });
  await prisma.userPhone.upsert({
    where: { userId: candidateUser.id },
    update: { phone: "0902606003" },
    create: { userId: candidateUser.id, phone: "0902606003" },
  });

  const vietnamLocations: { code: string; name: string; districts: string[] }[] = [
    { code: "HN", name: "Thành phố Hà Nội", districts: [] },
    { code: "HUE", name: "Thành phố Huế", districts: [] },
    { code: "LC", name: "Lai Châu", districts: [] },
    { code: "DB", name: "Điện Biên", districts: [] },
    { code: "SL", name: "Sơn La", districts: [] },
    { code: "LS", name: "Lạng Sơn", districts: [] },
    { code: "QN", name: "Quảng Ninh", districts: [] },
    { code: "TH", name: "Thanh Hóa", districts: [] },
    { code: "NA", name: "Nghệ An", districts: [] },
    { code: "HT", name: "Hà Tĩnh", districts: [] },
    { code: "CB", name: "Cao Bằng", districts: [] },
    { code: "TQ", name: "Tuyên Quang", districts: [] },
    { code: "LCA", name: "Lào Cai", districts: [] },
    { code: "TN", name: "Thái Nguyên", districts: [] },
    { code: "PT", name: "Phú Thọ", districts: [] },
    { code: "BN", name: "Bắc Ninh", districts: [] },
    { code: "HY", name: "Hưng Yên", districts: [] },
    { code: "HP", name: "Thành phố Hải Phòng", districts: [] },
    { code: "NB", name: "Ninh Bình", districts: [] },
    { code: "QT", name: "Quảng Trị", districts: [] },
    { code: "DN", name: "Thành phố Đà Nẵng", districts: [] },
    { code: "QNG", name: "Quảng Ngãi", districts: [] },
    { code: "GL", name: "Gia Lai", districts: [] },
    { code: "KH", name: "Khánh Hòa", districts: [] },
    { code: "LD", name: "Lâm Đồng", districts: [] },
    { code: "DL", name: "Đắk Lắk", districts: [] },
    { code: "HCM", name: "Thành phố Hồ Chí Minh", districts: [] },
    { code: "DNA", name: "Đồng Nai", districts: [] },
    { code: "TNI", name: "Tây Ninh", districts: [] },
    { code: "CT", name: "Thành phố Cần Thơ", districts: [] },
    { code: "VL", name: "Vĩnh Long", districts: [] },
    { code: "DT", name: "Đồng Tháp", districts: [] },
    { code: "CM", name: "Cà Mau", districts: [] },
    { code: "AG", name: "An Giang", districts: [] },
  ];

  const provinces = new Map<string, { id: number }>();
  const districts = new Map<string, { id: number }>();
  for (const location of vietnamLocations) {
    const province = await prisma.province.upsert({
      where: { code: location.code },
      update: { name: location.name },
      create: { code: location.code, name: location.name },
      select: { id: true },
    });
    provinces.set(location.code, province);

    for (const districtName of location.districts) {
      const district = await upsertDistrict(districtName, province.id);
      districts.set(`${location.code}:${districtName}`, district);
    }
  }

  const hcm = provinces.get("HCM")!;
  const district1 = districts.get("HCM:Quận 1")!;
  const district7 = districts.get("HCM:Quận 7")!;

  const categoryIds = new Map<string, number>();
  const parentIds = new Map<string, number>();
  for (const parent of JOB_CATEGORY_CATALOG) {
    const parentRow = await prisma.categoryParent.upsert({
      where: { slug: parent.slug },
      update: { name: parent.name, deletedAt: null },
      create: { name: parent.name, slug: parent.slug },
      select: { id: true },
    });
    parentIds.set(parent.slug, parentRow.id);
    for (const category of parent.categories) {
      const row = await prisma.category.upsert({
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
        select: { id: true },
      });
      categoryIds.set(category.slug, row.id);
    }
  }
  const backendCategory = { id: categoryIds.get("backend-developer")! };
  const frontendCategory = { id: categoryIds.get("frontend-developer")! };
  const dataCategory = { id: categoryIds.get("data-analyst")! };
  const mobileCategory = { id: categoryIds.get("mobile-developer")! };
  const marketingCategory = { id: categoryIds.get("digital-marketing")! };
  const productCategory = { id: categoryIds.get("product-manager")! };
  const operationsCategory = { id: categoryIds.get("operations-specialist")! };
  const itParent = { id: parentIds.get("cong-nghe-thong-tin")! };
  const businessParent = { id: parentIds.get("kinh-doanh")! };
  const marketingParent = { id: parentIds.get("marketing-truyen-thong")! };
  const operationsParent = { id: parentIds.get("van-hanh-san-xuat")! };

  const skillNames = [
    "TypeScript",
    "Node.js",
    "Express",
    "React",
    "MySQL",
    "Redis",
    "Docker",
    "Java",
    "Spring Boot",
    "Python",
    "Go",
    "SQL",
    "AWS",
    "Flutter",
    "Kotlin",
    "Figma",
    "SEO",
    "Google Ads",
    "B2B Sales",
    "Product Management",
    "Data Analysis",
    "Power BI",
  ];
  const skills = new Map<string, number>();
  for (const name of skillNames) {
    const row = await prisma.skill.upsert({
      where: { name },
      update: {},
      create: { name },
      select: { id: true },
    });
    skills.set(name, row.id);
  }

  await upsertCvTemplate();
  console.log("Seed completed");
  console.log(`Admin email: ${ADMIN_EMAIL}`);
  console.log(`Admin password: ${ADMIN_PASSWORD}`);
  return;

  const company = await prisma.company.upsert({
    where: { name: "F8 Technology JSC" },
    update: {
      description: "Công ty công nghệ mẫu cho dữ liệu local seed.",
      logo: "https://example.com/logos/f8-tech.png",
      website: "https://fullstack.edu.vn",
      location: "Tòa nhà F8, Quận 1, TP. Hồ Chí Minh",
      status: true,
      provinceId: hcm.id,
      districtId: district1.id,
    },
    create: {
      name: "F8 Technology JSC",
      slug: "f8-technology-jsc",
      description: "Công ty công nghệ mẫu cho dữ liệu local seed.",
      logo: "https://example.com/logos/f8-tech.png",
      website: "https://fullstack.edu.vn",
      location: "Tòa nhà F8, Quận 1, TP. Hồ Chí Minh",
      status: true,
      provinceId: hcm.id,
      districtId: district1.id,
    },
    select: { id: true },
  });

  await prisma.companyCategory.createMany({
    data: [
      { companyId: company.id, parentCategoryId: itParent.id },
      { companyId: company.id, parentCategoryId: businessParent.id },
    ],
    skipDuplicates: true,
  });

  const employer = await prisma.employer.upsert({
    where: { userId: employerUser.id },
    update: {
      companyId: company.id,
      status: EmployerStatus.APPROVED,
    },
    create: {
      userId: employerUser.id,
      companyId: company.id,
      status: EmployerStatus.APPROVED,
    },
    select: { id: true },
  });

  const candidate = await prisma.candidate.upsert({
    where: { userId: candidateUser.id },
    update: {
      provinceId: hcm.id,
      districtId: district7.id,
    },
    create: {
      userId: candidateUser.id,
      provinceId: hcm.id,
      districtId: district7.id,
    },
    select: { id: true },
  });

  await prisma.candidatePreference.upsert({
    where: { candidateId: candidate.id },
    update: {
      desiredMinSalary: 15000000,
      desiredMaxSalary: 30000000,
      jobType: JobType.FULL_TIME,
      experienceLevel: ExperienceLevel.JUNIOR,
      preferredProvinceId: hcm.id,
      preferredDistrictId: district7.id,
      isOpenToRemote: true,
    },
    create: {
      candidateId: candidate.id,
      desiredMinSalary: 15000000,
      desiredMaxSalary: 30000000,
      jobType: JobType.FULL_TIME,
      experienceLevel: ExperienceLevel.JUNIOR,
      preferredProvinceId: hcm.id,
      preferredDistrictId: district7.id,
      isOpenToRemote: true,
    },
  });

  await prisma.candidateSkill.createMany({
    data: ["TypeScript", "Node.js", "React"].map((name) => ({
      candidateId: candidate.id,
      skillId: skills.get(name)!,
    })),
    skipDuplicates: true,
  });
  await prisma.candidateCategory.createMany({
    data: [
      { candidateId: candidate.id, categoryId: backendCategory.id },
      { candidateId: candidate.id, categoryId: frontendCategory.id },
    ],
    skipDuplicates: true,
  });

  const backendJob = await upsertJob({
    title: "Backend Developer Node.js",
    description:
      "Xây dựng API tuyển dụng, tối ưu truy vấn MySQL và tích hợp Redis cache.",
    minSalary: 18000000,
    maxSalary: 35000000,
    quantity: 3,
    jobType: JobType.FULL_TIME,
    experienceLevel: ExperienceLevel.JUNIOR,
    deadline: new Date("2027-12-31T00:00:00.000Z"),
    isFeatured: true,
    workLocation: "Quận 1, TP. Hồ Chí Minh",
    employerId: employer.id,
    companyId: company.id,
    categoryId: backendCategory.id,
    viewCount: 120,
  });

  const frontendJob = await upsertJob({
    title: "Frontend Developer React",
    description:
      "Phát triển giao diện tuyển dụng, tối ưu trải nghiệm người dùng và SEO.",
    minSalary: 16000000,
    maxSalary: 32000000,
    quantity: 2,
    jobType: JobType.FULL_TIME,
    experienceLevel: ExperienceLevel.FRESHER,
    deadline: new Date("2027-12-31T00:00:00.000Z"),
    isFeatured: false,
    workLocation: "Cầu Giấy, Hà Nội",
    employerId: employer.id,
    companyId: company.id,
    categoryId: frontendCategory.id,
    viewCount: 80,
  });

  await prisma.jobSkill.createMany({
    data: [
      { jobId: backendJob.id, skillId: skills.get("TypeScript")! },
      { jobId: backendJob.id, skillId: skills.get("Node.js")! },
      { jobId: backendJob.id, skillId: skills.get("Express")! },
      { jobId: backendJob.id, skillId: skills.get("MySQL")! },
      { jobId: backendJob.id, skillId: skills.get("Redis")! },
      { jobId: frontendJob.id, skillId: skills.get("TypeScript")! },
      { jobId: frontendJob.id, skillId: skills.get("React")! },
      { jobId: frontendJob.id, skillId: skills.get("Docker")! },
    ],
    skipDuplicates: true,
  });

  const vietnamCompanySeeds = [
    {
      company: {
        name: "VNG Corporation",
        description: "Công ty công nghệ Internet và sản phẩm số tại Việt Nam.",
        logo: "https://example.com/logos/vng.png",
        website: "https://vng.com.vn",
        location: "Khu chế xuất Tân Thuận, Quận 7, TP. Hồ Chí Minh",
        provinceCode: "HCM",
        districtName: "Quận 7",
        categoryParentIds: [itParent.id],
      },
      employer: {
        email: "employer.vng@topcv.local",
        username: "employer_vng",
        password: "Employer@2606",
        phone: "0902606011",
      },
      jobs: [
        {
          title: "Senior Backend Engineer Java",
          description:
            "Phát triển dịch vụ backend quy mô lớn cho sản phẩm Internet tại Việt Nam.",
          minSalary: 35000000,
          maxSalary: 65000000,
          quantity: 2,
          jobType: JobType.FULL_TIME,
          experienceLevel: ExperienceLevel.SENIOR,
          categoryId: backendCategory.id,
          skillNames: ["Java", "Spring Boot", "MySQL", "Redis", "AWS"],
          workLocation: "Quận 7, TP. Hồ Chí Minh",
          isFeatured: true,
          viewCount: 320,
        },
        {
          title: "Product Manager Fintech",
          description:
            "Phụ trách roadmap sản phẩm, phân tích nhu cầu người dùng và phối hợp đội kỹ thuật.",
          minSalary: 30000000,
          maxSalary: 55000000,
          quantity: 1,
          jobType: JobType.FULL_TIME,
          experienceLevel: ExperienceLevel.MIDDLE,
          categoryId: productCategory.id,
          skillNames: ["Product Management", "Data Analysis", "Figma"],
          workLocation: "Quận 7, TP. Hồ Chí Minh",
          isFeatured: false,
          viewCount: 180,
        },
      ],
    },
    {
      company: {
        name: "FPT Software Hà Nội",
        description: "Doanh nghiệp dịch vụ công nghệ thông tin hàng đầu Việt Nam.",
        logo: "https://example.com/logos/fpt-software.png",
        website: "https://fptsoftware.com",
        location: "Tòa FPT, Cầu Giấy, Hà Nội",
        provinceCode: "HN",
        districtName: "Cầu Giấy",
        categoryParentIds: [itParent.id, businessParent.id],
      },
      employer: {
        email: "employer.fpt@topcv.local",
        username: "employer_fpt",
        password: "Employer@2606",
        phone: "0902606012",
      },
      jobs: [
        {
          title: "Frontend Engineer React TypeScript",
          description:
            "Xây dựng giao diện web enterprise cho khách hàng Nhật Bản và châu Âu.",
          minSalary: 22000000,
          maxSalary: 42000000,
          quantity: 4,
          jobType: JobType.FULL_TIME,
          experienceLevel: ExperienceLevel.MIDDLE,
          categoryId: frontendCategory.id,
          skillNames: ["React", "TypeScript", "Figma"],
          workLocation: "Cầu Giấy, Hà Nội",
          isFeatured: true,
          viewCount: 260,
        },
        {
          title: "Data Analyst Banking Domain",
          description:
            "Phân tích dữ liệu nghiệp vụ ngân hàng, xây dashboard và báo cáo vận hành.",
          minSalary: 20000000,
          maxSalary: 38000000,
          quantity: 2,
          jobType: JobType.FULL_TIME,
          experienceLevel: ExperienceLevel.JUNIOR,
          categoryId: dataCategory.id,
          skillNames: ["SQL", "Python", "Power BI", "Data Analysis"],
          workLocation: "Cầu Giấy, Hà Nội",
          isFeatured: false,
          viewCount: 145,
        },
      ],
    },
    {
      company: {
        name: "MoMo Technology Services",
        description: "Công ty fintech Việt Nam phát triển ví điện tử và thanh toán số.",
        logo: "https://example.com/logos/momo.png",
        website: "https://momo.vn",
        location: "Quận 3, TP. Hồ Chí Minh",
        provinceCode: "HCM",
        districtName: "Quận 3",
        categoryParentIds: [itParent.id, businessParent.id],
      },
      employer: {
        email: "employer.momo@topcv.local",
        username: "employer_momo",
        password: "Employer@2606",
        phone: "0902606013",
      },
      jobs: [
        {
          title: "Mobile Developer Flutter",
          description:
            "Phát triển tính năng mobile app cho hệ sinh thái thanh toán và tài chính số.",
          minSalary: 25000000,
          maxSalary: 50000000,
          quantity: 3,
          jobType: JobType.FULL_TIME,
          experienceLevel: ExperienceLevel.MIDDLE,
          categoryId: mobileCategory.id,
          skillNames: ["Flutter", "Kotlin", "TypeScript"],
          workLocation: "Quận 3, TP. Hồ Chí Minh",
          isFeatured: true,
          viewCount: 290,
        },
      ],
    },
    {
      company: {
        name: "Tiki Trading Việt Nam",
        description: "Nền tảng thương mại điện tử và logistics tại Việt Nam.",
        logo: "https://example.com/logos/tiki.png",
        website: "https://tiki.vn",
        location: "Thủ Đức, TP. Hồ Chí Minh",
        provinceCode: "HCM",
        districtName: "Thủ Đức",
        categoryParentIds: [itParent.id, operationsParent.id],
      },
      employer: {
        email: "employer.tiki@topcv.local",
        username: "employer_tiki",
        password: "Employer@2606",
        phone: "0902606014",
      },
      jobs: [
        {
          title: "Operations Specialist E-commerce",
          description:
            "Theo dõi vận hành đơn hàng, phối hợp kho vận và tối ưu chỉ số giao hàng.",
          minSalary: 14000000,
          maxSalary: 26000000,
          quantity: 5,
          jobType: JobType.FULL_TIME,
          experienceLevel: ExperienceLevel.FRESHER,
          categoryId: operationsCategory.id,
          skillNames: ["SQL", "Data Analysis"],
          workLocation: "Thủ Đức, TP. Hồ Chí Minh",
          isFeatured: false,
          viewCount: 110,
        },
      ],
    },
    {
      company: {
        name: "Axon Active Đà Nẵng",
        description: "Công ty phát triển phần mềm Agile tại Đà Nẵng.",
        logo: "https://example.com/logos/axon-active.png",
        website: "https://www.axonactive.com",
        location: "Hải Châu, Đà Nẵng",
        provinceCode: "DN",
        districtName: "Hải Châu",
        categoryParentIds: [itParent.id],
      },
      employer: {
        email: "employer.axon@topcv.local",
        username: "employer_axon",
        password: "Employer@2606",
        phone: "0902606015",
      },
      jobs: [
        {
          title: "Golang Backend Developer",
          description:
            "Thiết kế microservices, tối ưu hiệu năng API và triển khai Docker/Kubernetes.",
          minSalary: 28000000,
          maxSalary: 52000000,
          quantity: 2,
          jobType: JobType.FULL_TIME,
          experienceLevel: ExperienceLevel.MIDDLE,
          categoryId: backendCategory.id,
          skillNames: ["Go", "Docker", "MySQL", "Redis"],
          workLocation: "Hải Châu, Đà Nẵng",
          isFeatured: true,
          viewCount: 210,
        },
      ],
    },
    {
      company: {
        name: "Haravan Việt Nam",
        description: "Nền tảng bán hàng đa kênh cho doanh nghiệp Việt Nam.",
        logo: "https://example.com/logos/haravan.png",
        website: "https://www.haravan.com",
        location: "Bình Thạnh, TP. Hồ Chí Minh",
        provinceCode: "HCM",
        districtName: "Bình Thạnh",
        categoryParentIds: [businessParent.id, marketingParent.id],
      },
      employer: {
        email: "employer.haravan@topcv.local",
        username: "employer_haravan",
        password: "Employer@2606",
        phone: "0902606016",
      },
      jobs: [
        {
          title: "Digital Marketing Executive",
          description:
            "Triển khai chiến dịch SEO, Google Ads và tối ưu chuyển đổi cho khách hàng SME.",
          minSalary: 12000000,
          maxSalary: 24000000,
          quantity: 3,
          jobType: JobType.FULL_TIME,
          experienceLevel: ExperienceLevel.JUNIOR,
          categoryId: marketingCategory.id,
          skillNames: ["SEO", "Google Ads", "Data Analysis"],
          workLocation: "Bình Thạnh, TP. Hồ Chí Minh",
          isFeatured: false,
          viewCount: 95,
        },
      ],
    },
    {
      company: {
        name: "Base Enterprise",
        description: "Nền tảng quản trị doanh nghiệp SaaS cho thị trường Việt Nam.",
        logo: "https://example.com/logos/base.png",
        website: "https://base.vn",
        location: "Nam Từ Liêm, Hà Nội",
        provinceCode: "HN",
        districtName: "Nam Từ Liêm",
        categoryParentIds: [businessParent.id, itParent.id],
      },
      employer: {
        email: "employer.base@topcv.local",
        username: "employer_base",
        password: "Employer@2606",
        phone: "0902606017",
      },
      jobs: [
        {
          title: "B2B Sales Consultant SaaS",
          description:
            "Tư vấn giải pháp phần mềm quản trị cho doanh nghiệp vừa và lớn tại Việt Nam.",
          minSalary: 15000000,
          maxSalary: 35000000,
          quantity: 4,
          jobType: JobType.FULL_TIME,
          experienceLevel: ExperienceLevel.JUNIOR,
          categoryId: productCategory.id,
          skillNames: ["B2B Sales", "Product Management"],
          workLocation: "Nam Từ Liêm, Hà Nội",
          isFeatured: false,
          viewCount: 130,
        },
      ],
    },
    {
      company: {
        name: "CMC Global",
        description: "Công ty công nghệ và chuyển đổi số thuộc CMC Corporation.",
        logo: "https://example.com/logos/cmc-global.png",
        website: "https://cmcglobal.com.vn",
        location: "Thanh Xuân, Hà Nội",
        provinceCode: "HN",
        districtName: "Thanh Xuân",
        categoryParentIds: [itParent.id],
      },
      employer: {
        email: "employer.cmc@topcv.local",
        username: "employer_cmc",
        password: "Employer@2606",
        phone: "0902606018",
      },
      jobs: [
        {
          title: "Python Data Engineer",
          description:
            "Xây dựng pipeline dữ liệu, xử lý ETL và triển khai báo cáo phân tích.",
          minSalary: 26000000,
          maxSalary: 48000000,
          quantity: 2,
          jobType: JobType.FULL_TIME,
          experienceLevel: ExperienceLevel.MIDDLE,
          categoryId: dataCategory.id,
          skillNames: ["Python", "SQL", "AWS", "Data Analysis"],
          workLocation: "Thanh Xuân, Hà Nội",
          isFeatured: true,
          viewCount: 205,
        },
      ],
    },
  ];

  const extraCompanies: Array<{ id: number }> = [];
  const extraJobs: Array<{ id: number }> = [];
  for (const seed of vietnamCompanySeeds) {
    const province = provinces.get(seed.company.provinceCode)!;
    const district = districts.get(
      `${seed.company.provinceCode}:${seed.company.districtName}`,
    )!;

    const user = await upsertSeedUser(seed.employer);
    await prisma.userRole.createMany({
      data: [{ userId: user.id, roleId: roles.get("EMPLOYER")! }],
      skipDuplicates: true,
    });
    await upsertUserPhone(user.id, seed.employer.phone);

    const seededCompany = await prisma.company.upsert({
      where: { name: seed.company.name },
      update: {
        description: seed.company.description,
        logo: seed.company.logo,
        website: seed.company.website,
        location: seed.company.location,
        status: true,
        provinceId: province.id,
        districtId: district.id,
      },
      create: {
        name: seed.company.name,
        slug: seed.company.name
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/đ/g, "d")
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "")
          .slice(0, 160) || "cong-ty",
        description: seed.company.description,
        logo: seed.company.logo,
        website: seed.company.website,
        location: seed.company.location,
        status: true,
        provinceId: province.id,
        districtId: district.id,
      },
      select: { id: true },
    });
    extraCompanies.push(seededCompany);

    await prisma.companyCategory.createMany({
      data: seed.company.categoryParentIds.map((parentCategoryId) => ({
        companyId: seededCompany.id,
        parentCategoryId,
      })),
      skipDuplicates: true,
    });

    const seededEmployer = await prisma.employer.upsert({
      where: { userId: user.id },
      update: {
        companyId: seededCompany.id,
        status: EmployerStatus.APPROVED,
      },
      create: {
        userId: user.id,
        companyId: seededCompany.id,
        status: EmployerStatus.APPROVED,
      },
      select: { id: true },
    });

    for (const job of seed.jobs) {
      const seededJob = await upsertJob({
        title: job.title,
        description: job.description,
        minSalary: job.minSalary,
        maxSalary: job.maxSalary,
        quantity: job.quantity,
        jobType: job.jobType,
        experienceLevel: job.experienceLevel,
        deadline: new Date("2027-12-31T00:00:00.000Z"),
        isFeatured: job.isFeatured,
        workLocation: job.workLocation,
        employerId: seededEmployer.id,
        companyId: seededCompany.id,
        categoryId: job.categoryId,
        viewCount: job.viewCount,
      });
      extraJobs.push(seededJob);

      await prisma.jobSkill.createMany({
        data: job.skillNames.map((skillName) => ({
          jobId: seededJob.id,
          skillId: skills.get(skillName)!,
        })),
        skipDuplicates: true,
      });
    }
  }

  const template = await upsertCvTemplate();
  const resume = await upsertResume(candidate.id);

  const existingCv = await prisma.cv.findFirst({
    where: { userId: candidateUser.id, title: "CV Backend Developer" },
    select: { id: true },
  });
  const existingCvId = existingCv?.id ?? 0;
  if (existingCvId > 0) {
    await prisma.cv.update({
      where: { id: existingCvId },
      data: {
        templateId: template.id,
        status: CvStatus.COMPLETED,
        content: {
          fullName: "Nguyễn Văn Candidate",
          headline: "Junior Backend Developer",
          skills: ["TypeScript", "Node.js", "MySQL"],
        },
        lastEditedAt: new Date(),
      },
    });
  } else {
    await prisma.cv.create({
      data: {
        userId: candidateUser.id,
        templateId: template.id,
        title: "CV Backend Developer",
        status: CvStatus.COMPLETED,
        content: {
          fullName: "Nguyễn Văn Candidate",
          headline: "Junior Backend Developer",
          skills: ["TypeScript", "Node.js", "MySQL"],
        },
        lastEditedAt: new Date(),
      },
    });
  }

  await prisma.application.upsert({
    where: {
      candidateId_jobId: {
        candidateId: candidate.id,
        jobId: backendJob.id,
      },
    },
    update: {
      status: ApplicationStatus.REVIEWED,
      coverLetter:
        "Tôi quan tâm vị trí Backend Developer và có kinh nghiệm với Node.js.",
      resumeId: resume.id,
      aiMatchScore: 86,
      aiMatchReason: "Ứng viên phù hợp với kỹ năng TypeScript và Node.js.",
      aiMatchModel: "seed-model",
      aiMatchUpdatedAt: new Date(),
    },
    create: {
      candidateId: candidate.id,
      jobId: backendJob.id,
      resumeId: resume.id,
      status: ApplicationStatus.REVIEWED,
      coverLetter:
        "Tôi quan tâm vị trí Backend Developer và có kinh nghiệm với Node.js.",
      aiMatchScore: 86,
      aiMatchReason: "Ứng viên phù hợp với kỹ năng TypeScript và Node.js.",
      aiMatchModel: "seed-model",
      aiMatchUpdatedAt: new Date(),
    },
  });

  await prisma.savedJob.createMany({
    data: [
      { candidateId: candidate.id, jobId: frontendJob.id },
      ...extraJobs.slice(0, 4).map((job) => ({
        candidateId: candidate.id,
        jobId: job.id,
      })),
    ],
    skipDuplicates: true,
  });
  await prisma.companyFollow.createMany({
    data: [
      { candidateId: candidate.id, companyId: company.id },
      ...extraCompanies.slice(0, 5).map((seededCompany) => ({
        candidateId: candidate.id,
        companyId: seededCompany.id,
      })),
    ],
    skipDuplicates: true,
  });

  const conversation = await prisma.chatConversation.upsert({
    where: {
      employerUserId_candidateUserId: {
        employerUserId: employerUser.id,
        candidateUserId: candidateUser.id,
      },
    },
    update: {
      lastMessageAt: new Date(),
    },
    create: {
      employerUserId: employerUser.id,
      candidateUserId: candidateUser.id,
      lastMessageAt: new Date(),
    },
    select: { id: true },
  });

  const seededMessage = await prisma.chatMessage.findFirst({
    where: {
      conversationId: conversation.id,
      body: "Chào bạn, hồ sơ của bạn rất phù hợp với vị trí Backend Developer.",
    },
    select: { id: true },
  });
  if (!seededMessage) {
    await prisma.chatMessage.create({
      data: {
        conversationId: conversation.id,
        senderUserId: employerUser.id,
        body: "Chào bạn, hồ sơ của bạn rất phù hợp với vị trí Backend Developer.",
      },
    });
  }

  await ensureNotification({
    userId: admin.id,
    type: "SYSTEM",
    title: "Seed dữ liệu thành công",
    body: "Dữ liệu mẫu cho môi trường local đã được tạo.",
    link: "/admin",
  });
  await ensureNotification({
    userId: candidateUser.id,
    type: "APPLICATION_REVIEWED",
    title: "Hồ sơ của bạn đã được xem",
    body: "Nhà tuyển dụng đã xem hồ sơ ứng tuyển Backend Developer.",
    link: `/jobs/${backendJob.id}`,
  });

  await ensureAuditLog(admin.id);

  const blogSeeds = [
    {
      slug: "cv-chuan-ats",
      title: "Viết CV chuẩn ATS để vượt cổng lọc tự động",
      excerpt:
        "Từ khóa, cấu trúc, độ dài — checklist ngắn gọn cho ứng viên IT.",
      content: `## ATS đọc CV như thế nào

Phần mềm ATS tách tiêu đề, kinh nghiệm và kỹ năng thành trường dữ liệu. CV dạng cột phức tạp, icon hay bảng dễ bị mất nội dung.

## Checklist trước khi nộp

**Dùng tiêu đề rõ:** Kinh nghiệm, Học vấn, Kỹ năng. Khớp từ khóa trong tin tuyển dụng (React, TypeScript, REST) nếu bạn thực sự dùng.

**Độ dài:** 1–2 trang. Mỗi bullet nên có số liệu: giảm thời gian tải 30%, xử lý 20k đơn/ngày.

**File:** PDF text (không scan). Tên file: Ho-ten-Frontend.pdf.

Sau khi xuất PDF, copy toàn bộ text ra Notepad. Nếu thiếu mục, ATS cũng sẽ thiếu.`,
    },
    {
      slug: "phong-van-star",
      title: "Phỏng vấn theo mô hình STAR",
      excerpt:
        "Cách kể chuyện có số liệu, gây ấn tượng với hiring manager.",
      content: `## STAR là gì

**S**ituation — bối cảnh. **T**ask — trách nhiệm. **A**ction — việc bạn làm. **R**esult — kết quả đo được.

## Ví dụ ngắn

Situation: API checkout timeout 8% đơn hàng. Task: giảm lỗi trước Black Friday. Action: thêm retry, tách payment worker, theo dõi p95. Result: timeout còn 0.4%, doanh thu không mất đơn.

## Gợi ý luyện

Chuẩn bị 4–5 câu chuyện: xung đột team, deadline, bug production, mentorship. Tập nói 90 giây/câu. Đừng nói “chúng tôi” nếu hành động là của bạn.`,
    },
    {
      slug: "luong-thoa-thuan",
      title: "Thương lượng lương minh bạch",
      excerpt:
        "Nghiên cứu thị trường và khung lương trước khi nhận offer.",
      content: `## Biết số trước khi nói số

Xem tin tương tự trên trang, hỏi mentor cùng level, đối chiếu năm kinh nghiệm và stack. Đừng lấy offer cao nhất trên mạng làm mốc duy nhất.

## Cách mở lời

Nói tổng thu nhập: lương gross, thưởng, remote, thiết bị. Nếu HR hỏi kỳ vọng sớm, đưa **khoảng** đã nghiên cứu, không phải một con số cứng.

## Khi có offer

Cảm ơn, xin thời gian 2–3 ngày. Nếu muốn tăng: nêu lý do gắn với trách nhiệm (on-call, lead) chứ không so sánh cảm tính. Biết điểm dừng: văn hóa, học hỏi, manager cũng là một phần offer.`,
    },
  ];

  for (const post of blogSeeds) {
    await prisma.blogPost.upsert({
      where: { slug: post.slug },
      update: {
        title: post.title,
        excerpt: post.excerpt,
        content: post.content,
        deletedAt: null,
        publishedAt: new Date(),
        authorId: admin.id,
      },
      create: {
        slug: post.slug,
        title: post.title,
        excerpt: post.excerpt,
        content: post.content,
        publishedAt: new Date(),
        authorId: admin.id,
      },
    });
  }

  console.log("Seed completed");
  console.log(`Admin email: ${ADMIN_EMAIL}`);
  console.log(`Admin password: ${ADMIN_PASSWORD}`);
};

main()
  .catch((error: unknown) => {
    console.error("Seed failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
