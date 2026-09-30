/**
 * Xóa dữ liệu mẫu (công ty, việc làm, user không phải admin) và seed lại
 * 34 tỉnh thành cùng các mẫu CV. Không nhập CSV.
 *
 * Chạy: pnpm exec ts-node src/scripts/reset-demo-data.ts
 */
import { prisma } from "../utils/prisma";

const ADMIN_EMAIL = "haovaf8@fullstack.edu.vn";

const PROVINCES: { code: string; name: string }[] = [
  { code: "HN", name: "Thành phố Hà Nội" },
  { code: "HUE", name: "Thành phố Huế" },
  { code: "LC", name: "Lai Châu" },
  { code: "DB", name: "Điện Biên" },
  { code: "SL", name: "Sơn La" },
  { code: "LS", name: "Lạng Sơn" },
  { code: "QN", name: "Quảng Ninh" },
  { code: "TH", name: "Thanh Hóa" },
  { code: "NA", name: "Nghệ An" },
  { code: "HT", name: "Hà Tĩnh" },
  { code: "CB", name: "Cao Bằng" },
  { code: "TQ", name: "Tuyên Quang" },
  { code: "LCA", name: "Lào Cai" },
  { code: "TN", name: "Thái Nguyên" },
  { code: "PT", name: "Phú Thọ" },
  { code: "BN", name: "Bắc Ninh" },
  { code: "HY", name: "Hưng Yên" },
  { code: "HP", name: "Thành phố Hải Phòng" },
  { code: "NB", name: "Ninh Bình" },
  { code: "QT", name: "Quảng Trị" },
  { code: "DN", name: "Thành phố Đà Nẵng" },
  { code: "QNG", name: "Quảng Ngãi" },
  { code: "GL", name: "Gia Lai" },
  { code: "KH", name: "Khánh Hòa" },
  { code: "LD", name: "Lâm Đồng" },
  { code: "DL", name: "Đắk Lắk" },
  { code: "HCM", name: "Thành phố Hồ Chí Minh" },
  { code: "DNA", name: "Đồng Nai" },
  { code: "TNI", name: "Tây Ninh" },
  { code: "CT", name: "Thành phố Cần Thơ" },
  { code: "VL", name: "Vĩnh Long" },
  { code: "DT", name: "Đồng Tháp" },
  { code: "CM", name: "Cà Mau" },
  { code: "AG", name: "An Giang" },
];

const cvProfileBlocks = [
  { id: "full-name", type: "text", bindingPath: "profile.fullName", defaultValue: "" },
  { id: "title", type: "text", bindingPath: "profile.title", defaultValue: "" },
  { id: "email", type: "text", bindingPath: "profile.email", defaultValue: "" },
  { id: "phone", type: "text", bindingPath: "profile.phone", defaultValue: "" },
  { id: "address", type: "text", bindingPath: "profile.address", defaultValue: "" },
  { id: "website", type: "text", bindingPath: "profile.website", defaultValue: "" },
  { id: "summary", type: "multiline", bindingPath: "summary.text", defaultValue: "" },
];

const cvSections = [
  {
    id: "experience",
    label: "Kinh nghiệm",
    bindingPath: "experience",
    defaultItem: { role: "", company: "", period: "", description: "" },
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
    defaultItem: { major: "", school: "", period: "", description: "" },
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
    defaultItem: { name: "" },
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
] as const;

const main = async () => {
  const admin = await prisma.user.findUnique({
    where: { email: ADMIN_EMAIL },
    select: { id: true, email: true },
  });
  if (!admin) {
    throw new Error(`Không thấy tài khoản admin ${ADMIN_EMAIL}`);
  }

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

  await prisma.userPhone.deleteMany({ where: { userId: { not: admin.id } } });
  await prisma.userRole.deleteMany({ where: { userId: { not: admin.id } } });
  await prisma.userPermission.deleteMany({ where: { userId: { not: admin.id } } });
  const removedUsers = await prisma.user.deleteMany({
    where: { id: { not: admin.id } },
  });

  await prisma.district.deleteMany();
  await prisma.province.deleteMany();
  await prisma.province.createMany({ data: PROVINCES });

  await prisma.cvTemplate.deleteMany();
  await prisma.cvTemplate.createMany({
    data: CV_TEMPLATE_PRESETS.map((preset) => ({
      name: preset.name,
      description: preset.description,
      templateData: {
        layout: preset.layout,
        meta: { theme: preset.theme, variant: preset.variant, density: "comfortable" },
        blocks: cvProfileBlocks,
        sections: cvSections,
      },
      status: true,
    })),
  });

  const [users, provinces, templates, companies, jobs] = await Promise.all([
    prisma.user.count(),
    prisma.province.count(),
    prisma.cvTemplate.count(),
    prisma.company.count(),
    prisma.job.count(),
  ]);
  console.log(
    `Đã xóa ${removedUsers.count} user. Còn ${users} user, ${provinces} tỉnh thành, ${templates} mẫu CV, ${companies} công ty, ${jobs} việc làm.`,
  );
};

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
