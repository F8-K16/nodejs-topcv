/**
 * Gán slug từ tên cho các mẫu CV còn trống hoặc đang dùng mau-cv-{id}.
 * Chạy: pnpm exec ts-node src/scripts/fill-cv-template-slugs.ts
 */
import "dotenv/config";

import { invalidateCvTemplateCaches } from "../utils/cache";
import { prisma } from "../utils/prisma";
import { uniqueSlug } from "../utils/slug";

const main = async () => {
  const rows = await prisma.cvTemplate.findMany({
    select: { id: true, name: true, slug: true },
    orderBy: { id: "asc" },
  });
  const used = new Set(rows.map((row) => row.slug).filter(Boolean));
  let updated = 0;

  for (const row of rows) {
    const placeholder = !row.slug || /^mau-cv-\d+$/.test(row.slug);
    if (!placeholder) continue;
    used.delete(row.slug);
    const slug = uniqueSlug(row.name, used);
    if (slug === row.slug) continue;
    await prisma.cvTemplate.update({
      where: { id: row.id },
      data: { slug },
    });
    updated += 1;
  }

  await invalidateCvTemplateCaches();
  process.stdout.write(`Updated ${updated}/${rows.length} CV template slugs\n`);
};

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
