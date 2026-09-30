import "dotenv/config";

import {
  classifyJobCategorySlug,
  JOB_CATEGORY_CATALOG,
} from "../prisma/seed/job-catalog";
import { Prisma } from "../generated/prisma/client";
import { prisma } from "../utils/prisma";

const EXTRA_CV_TEMPLATES = [
  { name: "Chuyên nghiệp", description: "Một cột, tông xám trang trọng.", layout: "single-column", theme: "slate", variant: "classic" },
  { name: "Fresher", description: "Gọn, phù hợp ứng viên mới ra trường.", layout: "single-column", theme: "green", variant: "compact" },
  { name: "Kỹ thuật", description: "Kinh nghiệm theo mốc thời gian, tông xanh.", layout: "single-column", theme: "green", variant: "timeline" },
  { name: "Kinh doanh", description: "Hai cột, sidebar xanh cho vị trí sales.", layout: "two-column", theme: "green", variant: "softSidebar" },
  { name: "Hiện đại xanh", description: "Các mục đặt trong thẻ, tông xanh.", layout: "single-column", theme: "green", variant: "modernCard" },
  { name: "Tối giản xanh", description: "Ít trang trí, nhấn màu xanh.", layout: "single-column", theme: "green", variant: "minimal" },
  { name: "Điều hành xanh", description: "Hai cột trang trọng, tông xanh.", layout: "two-column", theme: "green", variant: "executive" },
  { name: "Báo xanh", description: "Bố cục báo in, nhấn xanh.", layout: "single-column", theme: "green", variant: "newspaper" },
] as const;

const main = async () => {
  const categoryIds = new Map<string, number>();
  for (const parent of JOB_CATEGORY_CATALOG) {
    const parentRow = await prisma.categoryParent.upsert({
      where: { slug: parent.slug },
      update: { name: parent.name, deletedAt: null },
      create: { name: parent.name, slug: parent.slug },
      select: { id: true },
    });
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

  const jobs = await prisma.job.findMany({
    where: { deletedAt: null },
    select: { id: true, title: true, categoryId: true },
  });
  let reassigned = 0;
  for (const job of jobs) {
    const slug = classifyJobCategorySlug(job.title);
    const categoryId = categoryIds.get(slug);
    if (!categoryId || categoryId === job.categoryId) continue;
    await prisma.job.update({
      where: { id: job.id },
      data: { categoryId },
    });
    reassigned += 1;
  }

  const baseTemplate = await prisma.cvTemplate.findFirst({
    where: { deletedAt: null },
    select: { templateData: true },
  });
  if (!baseTemplate) throw new Error("Chưa có mẫu CV để nhân bản");
  const baseData = baseTemplate.templateData as {
    blocks?: unknown;
    sections?: unknown;
  };

  for (const preset of EXTRA_CV_TEMPLATES) {
    const templateData = {
      layout: preset.layout,
      meta: { theme: preset.theme, variant: preset.variant, density: "comfortable" },
      blocks: baseData.blocks,
      sections: baseData.sections,
    } as Prisma.InputJsonValue;
    const existing = await prisma.cvTemplate.findFirst({
      where: { name: preset.name },
      select: { id: true },
    });
    if (existing) {
      await prisma.cvTemplate.update({
        where: { id: existing.id },
        data: {
          description: preset.description,
          templateData,
          status: true,
          deletedAt: null,
        },
      });
    } else {
      await prisma.cvTemplate.create({
        data: {
          name: preset.name,
          description: preset.description,
          templateData,
          status: true,
        },
      });
    }
  }

  const [categoryCount, templateCount, otherCount] = await Promise.all([
    prisma.category.count({ where: { deletedAt: null } }),
    prisma.cvTemplate.count({ where: { deletedAt: null, status: true } }),
    prisma.job.count({
      where: {
        deletedAt: null,
        category: { slug: "khac" },
      },
    }),
  ]);
  process.stdout.write(
    `Categories ${categoryCount}, templates ${templateCount}, reassigned ${reassigned}, still Khác ${otherCount}\n`,
  );
};

main()
  .catch((err) => {
    process.stderr.write(`${String(err)}\n`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
