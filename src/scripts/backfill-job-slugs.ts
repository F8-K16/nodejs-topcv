import { prisma } from "../utils/prisma";
import { uniqueSlug } from "../utils/slug";

const main = async () => {
  const rows = await prisma.job.findMany({
    select: { id: true, title: true, slug: true },
    orderBy: { id: "asc" },
  });
  const used = new Set(
    rows.map((row) => row.slug).filter((slug): slug is string => Boolean(slug)),
  );
  used.add("recommended");
  used.add("suggest");
  used.add("saved");

  let updated = 0;
  for (const row of rows) {
    if (row.slug) continue;
    const slug = uniqueSlug(row.title, used);
    await prisma.job.update({
      where: { id: row.id },
      data: { slug },
    });
    updated += 1;
  }
  console.log(`Đã gán slug cho ${updated}/${rows.length} việc làm.`);
};

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
