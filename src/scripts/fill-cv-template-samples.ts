import "dotenv/config";

import { Prisma } from "../generated/prisma/client";
import { invalidateCvTemplateCaches } from "../utils/cache";
import { prisma } from "../utils/prisma";

const blockDefaults: Record<string, string> = {
  "profile.fullName": "Nguyễn Minh Anh",
  "profile.title": "Lập trình viên Frontend",
  "profile.email": "minh.anh@email.com",
  "profile.phone": "0901 234 567",
  "profile.address": "Quận 1, TP. Hồ Chí Minh",
  "profile.website": "github.com/minhanh",
  "summary.text":
    "Lập trình viên frontend với 3 năm kinh nghiệm React và TypeScript. Tập trung vào giao diện rõ ràng, hiệu năng và trải nghiệm người dùng.",
};

const sectionSamples: Record<string, Record<string, string>[]> = {
  experience: [
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
  education: [
    {
      major: "Công nghệ thông tin",
      school: "Đại học Bách khoa TP.HCM",
      period: "2018 - 2022",
      description: "Tốt nghiệp loại Khá. Đồ án về hệ thống tuyển dụng trực tuyến.",
    },
  ],
  skills: [
    { name: "React" },
    { name: "TypeScript" },
    { name: "Tailwind CSS" },
    { name: "Node.js" },
  ],
};

const main = async () => {
  const rows = await prisma.cvTemplate.findMany({
    where: { deletedAt: null },
    select: { id: true, templateData: true },
  });

  for (const row of rows) {
    const data = (row.templateData ?? {}) as Record<string, unknown>;
    const blocks = Array.isArray(data.blocks)
      ? data.blocks.map((block) => {
          if (!block || typeof block !== "object") return block;
          const current = block as { bindingPath?: string };
          const value = current.bindingPath
            ? blockDefaults[current.bindingPath]
            : undefined;
          return value ? { ...current, defaultValue: value } : block;
        })
      : data.blocks;
    const sections = Array.isArray(data.sections)
      ? data.sections.map((section) => {
          if (!section || typeof section !== "object") return section;
          const current = section as { bindingPath?: string };
          const sample = current.bindingPath
            ? sectionSamples[current.bindingPath]
            : undefined;
          if (!sample) return section;
          return { ...current, defaultItem: sample[0], sampleItems: sample };
        })
      : data.sections;

    await prisma.cvTemplate.update({
      where: { id: row.id },
      data: {
        templateData: { ...data, blocks, sections } as Prisma.InputJsonValue,
      },
    });
  }

  await invalidateCvTemplateCaches();
  process.stdout.write(`Updated ${rows.length} CV templates\n`);
};

main()
  .catch((err) => {
    process.stderr.write(`${String(err)}\n`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
