/**
 * Tải logo công ty đang trỏ ra ngoài lên Cloudinary và cập nhật database.
 * Chạy: pnpm exec ts-node src/scripts/upload-company-logos.ts
 */
import "dotenv/config";
import { createHash } from "node:crypto";
import { v2 as cloudinary } from "cloudinary";
import { prisma } from "../utils/prisma";

const FOLDER = "company-logos";
const CONCURRENCY = 6;

const cloudName = process.env.CLOUDINARY_CLOUD_NAME ?? "";
const apiKey = process.env.CLOUDINARY_API_KEY ?? "";
const apiSecret = process.env.CLOUDINARY_API_SECRET ?? "";

cloudinary.config({
  cloud_name: cloudName,
  api_key: apiKey,
  api_secret: apiSecret,
});

const publicIdFor = (url: string) =>
  createHash("sha1").update(url).digest("hex").slice(0, 24);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function uploadOne(url: string, attempt = 1): Promise<string> {
  try {
    const result = await cloudinary.uploader.upload(url, {
      folder: FOLDER,
      public_id: publicIdFor(url),
      overwrite: true,
      unique_filename: false,
      resource_type: "image",
    });
    if (!result.secure_url) throw new Error("Cloudinary không trả về secure_url");
    return result.secure_url;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const retryable = /420|429|499|500|timeout|ECONN|ETIMEDOUT|socket/i.test(message);
    if (retryable && attempt < 4) {
      await sleep(1000 * attempt * attempt);
      return uploadOne(url, attempt + 1);
    }
    throw error;
  }
}

async function mapPool<T>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<void>,
) {
  let cursor = 0;
  const runners = Array.from({ length: limit }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      await worker(items[index]!, index);
    }
  });
  await Promise.all(runners);
}

async function main() {
  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error("Thiếu CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY hoặc CLOUDINARY_API_SECRET");
  }

  const companies = await prisma.company.findMany({
    where: { logo: { not: null } },
    select: { id: true, logo: true },
  });
  const byLogo = new Map<string, number[]>();
  for (const company of companies) {
    const logo = company.logo?.trim() ?? "";
    if (!logo.startsWith("http") || logo.includes("res.cloudinary.com")) continue;
    const ids = byLogo.get(logo) ?? [];
    ids.push(company.id);
    byLogo.set(logo, ids);
  }

  const entries = [...byLogo.entries()];
  console.log(`Cần upload ${entries.length} logo cho ${[...byLogo.values()].reduce((sum, ids) => sum + ids.length, 0)} công ty`);

  let uploaded = 0;
  let failed = 0;
  let done = 0;

  await mapPool(entries, CONCURRENCY, async ([logo, ids]) => {
    try {
      const secureUrl = await uploadOne(logo);
      await prisma.company.updateMany({
        where: { id: { in: ids } },
        data: { logo: secureUrl },
      });
      uploaded += ids.length;
    } catch (error) {
      failed += ids.length;
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Lỗi logo company ${ids[0]}: ${message.slice(0, 180)}`);
    }
    done += 1;
    if (done % 100 === 0 || done === entries.length) {
      console.log(`Đã xử lý ${done}/${entries.length} logo. Cập nhật ${uploaded} công ty, lỗi ${failed}.`);
    }
  });

  console.log(`Xong. Cập nhật ${uploaded} công ty, lỗi ${failed}.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
