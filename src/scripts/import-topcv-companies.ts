/**
 * Nhập công ty từ TopCV-scraper/company_link_logo.csv vào bảng companies.
 * File crawl chỉ có link trang công ty và logo, không có địa chỉ hay tin tuyển dụng.
 *
 * Chạy: pnpm run import:topcv
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { prisma } from "../utils/prisma";
import { uniqueSlug } from "../utils/slug";

const CSV_PATH = path.resolve(
  __dirname,
  "../../../TopCV-scraper/company_link_logo.csv",
);
const BATCH_SIZE = 400;
const UPPER_TOKENS = new Set(["tnhh", "mtv", "tmdv", "jsc", "llc", "it", "ai", "hr"]);

const titleFromSlug = (slug: string) =>
  slug
    .split("-")
    .filter(Boolean)
    .map((part) =>
      UPPER_TOKENS.has(part)
        ? part.toUpperCase()
        : part.charAt(0).toUpperCase() + part.slice(1),
    )
    .join(" ");

const uniqueName = (base: string, topcvId: string, used: Set<string>) => {
  const plain = base.slice(0, 191);
  if (!used.has(plain.toLowerCase())) {
    used.add(plain.toLowerCase());
    return plain;
  }
  const suffix = ` (${topcvId})`;
  const next = `${base.slice(0, 191 - suffix.length)}${suffix}`;
  used.add(next.toLowerCase());
  return next;
};

const readRows = () => {
  const rows: { link: string; logo: string | null; topcvId: string; baseName: string }[] = [];
  const lines = readFileSync(CSV_PATH, "utf8").split(/\r?\n/).slice(1);
  for (const line of lines) {
    if (!line.trim()) continue;
    const comma = line.indexOf(",");
    const link = line.slice(0, comma).trim();
    const logoRaw = line.slice(comma + 1).trim();
    const match = link.match(/\/cong-ty\/([^/]+)\/(\d+)\.html/i);
    const slug = match?.[1];
    const topcvId = match?.[2];
    if (!slug || !topcvId) continue;
    rows.push({
      link,
      logo: logoRaw && logoRaw.toUpperCase() !== "N/A" ? logoRaw : null,
      topcvId,
      baseName: titleFromSlug(slug),
    });
  }
  return rows;
};

const main = async () => {
  const rows = readRows();
  const province = await prisma.province.findFirst({
    where: { code: "HN", deletedAt: null },
    select: { id: true, name: true },
  });
  if (!province) {
    throw new Error("Không tìm thấy tỉnh Hà Nội để gán công ty chưa có địa chỉ");
  }
  const district = await prisma.district.findFirst({
    where: { provinceId: province.id, deletedAt: null },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
  if (!district) {
    throw new Error("Không tìm thấy quận/huyện của Hà Nội");
  }
  const locationLabel = `${district.name}, ${province.name}`;

  const existing = await prisma.company.findMany({
    select: { id: true, name: true, website: true, slug: true },
  });
  const usedNames = new Set(existing.map((row) => row.name.toLowerCase()));
  const usedSlugs = new Set(existing.map((row) => row.slug));
  const byWebsite = new Map(
    existing
      .filter((row) => row.website)
      .map((row) => [row.website as string, row]),
  );

  const toCreate: {
    name: string;
    slug: string;
    logo: string | null;
    website: string;
    location: string;
    status: boolean;
    provinceId: number;
    districtId: number;
    description: string;
  }[] = [];
  let updated = 0;

  for (const row of rows) {
    const current = byWebsite.get(row.link);
    if (current) {
      await prisma.company.update({
        where: { id: current.id },
        data: { logo: row.logo, status: true },
      });
      updated += 1;
      continue;
    }
    toCreate.push({
      name: uniqueName(row.baseName, row.topcvId, usedNames),
      slug: uniqueSlug(row.baseName, usedSlugs),
      logo: row.logo,
      website: row.link,
      location: locationLabel,
      status: true,
      provinceId: province.id,
      districtId: district.id,
      description: "Nhập từ dữ liệu crawl TopCV (company_link_logo.csv).",
    });
  }

  let created = 0;
  for (let i = 0; i < toCreate.length; i += BATCH_SIZE) {
    const result = await prisma.company.createMany({
      data: toCreate.slice(i, i + BATCH_SIZE),
    });
    created += result.count;
    console.log(`Đã tạo ${created}/${toCreate.length} công ty`);
  }

  console.log(`Xong. Tạo mới ${created}, cập nhật ${updated}.`);
};

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
