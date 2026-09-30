import { prisma } from "../utils/prisma";
import { uniqueSlug } from "../utils/slug";

const main = async () => {
  const rows = await prisma.company.findMany({
    select: { id: true, name: true, slug: true },
    orderBy: { id: "asc" },
  });
  const used = new Set(
    rows.map((row) => row.slug).filter((slug): slug is string => Boolean(slug)),
  );
  let updated = 0;
  for (const row of rows) {
    if (row.slug) continue;
    const slug = uniqueSlug(row.name, used);
    await prisma.company.update({
      where: { id: row.id },
      data: { slug },
    });
    updated += 1;
  }
  console.log(`Đã gán slug cho ${updated}/${rows.length} công ty.`);
};

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
