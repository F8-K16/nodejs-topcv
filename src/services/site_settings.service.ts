import { prisma } from "../utils/prisma";
import { HttpException } from "../utils/exception";
import type { Prisma, SiteSettings } from "../generated/prisma/client";
import {
  CacheKeys,
  cacheGetJson,
  cacheSetJsonPersistent,
  invalidateSiteSettingsCache,
} from "../utils/cache";

export const siteSettingsService = {
  async assertNotMaintenance() {
    const s = await prisma.siteSettings.findUnique({ where: { id: 1 } });
    if (s?.maintenanceMode) {
      throw new HttpException(
        "Hệ thống đang bảo trì. Vui lòng quay lại sau.",
        503,
        "MAINTENANCE_MODE",
      );
    }
  },

  async getOrCreate() {
    const cached = await cacheGetJson<SiteSettings>(CacheKeys.siteSettings);
    if (cached) return cached;

    let row = await prisma.siteSettings.findUnique({ where: { id: 1 } });
    if (!row) {
      row = await prisma.siteSettings.create({
        data: { id: 1, siteName: "Job Portal" },
      });
    }
    await cacheSetJsonPersistent(CacheKeys.siteSettings, row);
    return row;
  },

  async update(data: Prisma.SiteSettingsUpdateInput) {
    await prisma.siteSettings.upsert({
      where: { id: 1 },
      create: { id: 1 },
      update: data,
    });
    await invalidateSiteSettingsCache();
    const row = await prisma.siteSettings.findUnique({ where: { id: 1 } });
    if (!row) {
      throw new HttpException("Không thể cập nhật cài đặt", 500);
    }
    await cacheSetJsonPersistent(CacheKeys.siteSettings, row);
    return row;
  },

  async getPublic() {
    return this.getOrCreate();
  },
};
