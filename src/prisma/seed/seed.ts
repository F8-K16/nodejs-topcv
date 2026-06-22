import {
  ApplicationStatus,
  CvStatus,
  EmployerStatus,
  ExperienceLevel,
  JobModerationStatus,
  JobType,
} from "../../generated/prisma/client";
import { hashPassword } from "../../utils/hashing";
import { prisma } from "../../utils/prisma";

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

const upsertCvTemplate = async () => {
  const name = "Modern Professional";
  const templateData = {
    layout: "single-column",
    meta: { theme: "green", variant: "classic", density: "comfortable" },
    blocks: [
      {
        id: "full-name",
        type: "text",
        bindingPath: "profile.fullName",
        defaultValue: "Nguyễn Văn A",
      },
      {
        id: "title",
        type: "text",
        bindingPath: "profile.title",
        defaultValue: "Frontend Developer",
      },
      {
        id: "email",
        type: "text",
        bindingPath: "profile.email",
        defaultValue: "nguyenvana@email.com",
      },
      {
        id: "phone",
        type: "text",
        bindingPath: "profile.phone",
        defaultValue: "090 123 4567",
      },
      {
        id: "address",
        type: "text",
        bindingPath: "profile.address",
        defaultValue: "TP. Hồ Chí Minh",
      },
      {
        id: "website",
        type: "text",
        bindingPath: "profile.website",
        defaultValue: "linkedin.com/in/nguyenvana",
      },
      {
        id: "summary",
        type: "multiline",
        bindingPath: "summary.text",
        defaultValue:
          "Ứng viên công nghệ có kinh nghiệm xây dựng sản phẩm web, tối ưu trải nghiệm người dùng và phối hợp hiệu quả với đội ngũ sản phẩm.",
      },
    ],
    sections: [
      {
        id: "experience",
        label: "Kinh nghiệm",
        bindingPath: "experience",
        defaultItem: {
          role: "Frontend Developer",
          company: "TopCV Tech",
          period: "2023 - Nay",
          description:
            "Phát triển giao diện tuyển dụng, cải thiện hiệu năng và xây dựng component dùng chung.",
        },
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
          school: "Đại học Bách Khoa",
          period: "2019 - 2023",
          description: "Tập trung vào phát triển phần mềm và hệ thống web.",
        },
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
        defaultItem: { name: "React, Next.js, TypeScript" },
        itemBlocks: [{ id: "name", type: "text", bindingPath: "name" }],
      },
    ],
  };
  const existing = await prisma.cvTemplate.findFirst({
    where: { name },
    select: { id: true },
  });

  if (existing) {
    return prisma.cvTemplate.update({
      where: { id: existing.id },
      data: {
        description: "Mẫu CV chuyên nghiệp cho ứng viên công nghệ",
        thumbnailUrl: "https://example.com/templates/modern-professional.png",
        templateData,
        isActive: true,
      },
      select: { id: true },
    });
  }

  return prisma.cvTemplate.create({
    data: {
      name,
      description: "Mẫu CV chuyên nghiệp cho ứng viên công nghệ",
      thumbnailUrl: "https://example.com/templates/modern-professional.png",
      templateData,
      isActive: true,
    },
    select: { id: true },
  });
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
    select: { id: true },
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

  return prisma.job.create({
    data: {
      ...data,
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

  const vietnamLocations = [
    {
      code: "HCM",
      name: "Thành phố Hồ Chí Minh",
      districts: ["Quận 1", "Quận 3", "Quận 7", "Bình Thạnh", "Thủ Đức"],
    },
    {
      code: "HN",
      name: "Hà Nội",
      districts: ["Cầu Giấy", "Đống Đa", "Hoàn Kiếm", "Nam Từ Liêm", "Thanh Xuân"],
    },
    {
      code: "DN",
      name: "Đà Nẵng",
      districts: ["Hải Châu", "Thanh Khê", "Sơn Trà", "Ngũ Hành Sơn"],
    },
    {
      code: "HP",
      name: "Hải Phòng",
      districts: ["Hồng Bàng", "Ngô Quyền", "Lê Chân", "Hải An"],
    },
    {
      code: "CT",
      name: "Cần Thơ",
      districts: ["Ninh Kiều", "Cái Răng", "Bình Thủy", "Ô Môn"],
    },
    {
      code: "BD",
      name: "Bình Dương",
      districts: ["Thủ Dầu Một", "Dĩ An", "Thuận An", "Bến Cát"],
    },
    {
      code: "DNA",
      name: "Đồng Nai",
      districts: ["Biên Hòa", "Long Khánh", "Nhơn Trạch", "Trảng Bom"],
    },
    {
      code: "KH",
      name: "Khánh Hòa",
      districts: ["Nha Trang", "Cam Ranh", "Ninh Hòa", "Diên Khánh"],
    },
    {
      code: "QNA",
      name: "Quảng Nam",
      districts: ["Tam Kỳ", "Hội An", "Điện Bàn", "Núi Thành"],
    },
    {
      code: "TH",
      name: "Thanh Hóa",
      districts: ["Thành phố Thanh Hóa", "Sầm Sơn", "Bỉm Sơn", "Nghi Sơn"],
    },
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

  const itParent = await prisma.categoryParent.upsert({
    where: { slug: "cong-nghe-thong-tin" },
    update: { name: "Công nghệ thông tin" },
    create: { name: "Công nghệ thông tin", slug: "cong-nghe-thong-tin" },
    select: { id: true },
  });
  const businessParent = await prisma.categoryParent.upsert({
    where: { slug: "kinh-doanh" },
    update: { name: "Kinh doanh" },
    create: { name: "Kinh doanh", slug: "kinh-doanh" },
    select: { id: true },
  });
  const marketingParent = await prisma.categoryParent.upsert({
    where: { slug: "marketing-truyen-thong" },
    update: { name: "Marketing - Truyền thông" },
    create: { name: "Marketing - Truyền thông", slug: "marketing-truyen-thong" },
    select: { id: true },
  });
  const operationsParent = await prisma.categoryParent.upsert({
    where: { slug: "van-hanh-san-xuat" },
    update: { name: "Vận hành - Sản xuất" },
    create: { name: "Vận hành - Sản xuất", slug: "van-hanh-san-xuat" },
    select: { id: true },
  });

  const backendCategory = await prisma.category.upsert({
    where: { slug: "backend-developer" },
    update: {
      name: "Backend Developer",
      parentCategoryId: itParent.id,
    },
    create: {
      name: "Backend Developer",
      slug: "backend-developer",
      parentCategoryId: itParent.id,
    },
    select: { id: true },
  });
  const frontendCategory = await prisma.category.upsert({
    where: { slug: "frontend-developer" },
    update: {
      name: "Frontend Developer",
      parentCategoryId: itParent.id,
    },
    create: {
      name: "Frontend Developer",
      slug: "frontend-developer",
      parentCategoryId: itParent.id,
    },
    select: { id: true },
  });
  await prisma.category.upsert({
    where: { slug: "sales-executive" },
    update: {
      name: "Sales Executive",
      parentCategoryId: businessParent.id,
    },
    create: {
      name: "Sales Executive",
      slug: "sales-executive",
      parentCategoryId: businessParent.id,
    },
  });
  const dataCategory = await prisma.category.upsert({
    where: { slug: "data-analyst" },
    update: {
      name: "Data Analyst",
      parentCategoryId: itParent.id,
    },
    create: {
      name: "Data Analyst",
      slug: "data-analyst",
      parentCategoryId: itParent.id,
    },
    select: { id: true },
  });
  const mobileCategory = await prisma.category.upsert({
    where: { slug: "mobile-developer" },
    update: {
      name: "Mobile Developer",
      parentCategoryId: itParent.id,
    },
    create: {
      name: "Mobile Developer",
      slug: "mobile-developer",
      parentCategoryId: itParent.id,
    },
    select: { id: true },
  });
  const marketingCategory = await prisma.category.upsert({
    where: { slug: "digital-marketing" },
    update: {
      name: "Digital Marketing",
      parentCategoryId: marketingParent.id,
    },
    create: {
      name: "Digital Marketing",
      slug: "digital-marketing",
      parentCategoryId: marketingParent.id,
    },
    select: { id: true },
  });
  const productCategory = await prisma.category.upsert({
    where: { slug: "product-manager" },
    update: {
      name: "Product Manager",
      parentCategoryId: businessParent.id,
    },
    create: {
      name: "Product Manager",
      slug: "product-manager",
      parentCategoryId: businessParent.id,
    },
    select: { id: true },
  });
  const operationsCategory = await prisma.category.upsert({
    where: { slug: "operations-specialist" },
    update: {
      name: "Operations Specialist",
      parentCategoryId: operationsParent.id,
    },
    create: {
      name: "Operations Specialist",
      slug: "operations-specialist",
      parentCategoryId: operationsParent.id,
    },
    select: { id: true },
  });

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
  if (existingCv) {
    await prisma.cv.update({
      where: { id: existingCv.id },
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
