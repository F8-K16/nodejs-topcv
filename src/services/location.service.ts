import { HttpException } from "../utils/exception";
import { prisma } from "../utils/prisma";
import { env } from "../config/env";
import {
  CacheKeys,
  cacheGetJson,
  cacheSetJson,
  invalidateLocationCaches,
  invalidateLocationCachesForProvince,
} from "../utils/cache";

const HIDDEN_LOCATION_NAMES = new Set(["chưa xác định", "không xác định"]);

function isHiddenLocation(row: { name?: string | null; code?: string | null }) {
  if (row.code === "UNKNOWN") return true;
  const name = row.name?.trim().toLowerCase() ?? "";
  return HIDDEN_LOCATION_NAMES.has(name);
}

async function fetchProvinces() {
  const rows = await prisma.province.findMany({
    where: { deletedAt: null },
    orderBy: { name: "asc" },
  });
  return rows.filter((row) => !isHiddenLocation(row));
}

async function fetchDistricts(provinceId: number) {
  return prisma.district.findMany({
    where: { provinceId, deletedAt: null },
    select: {
      id: true,
      name: true,
    },
    orderBy: { name: "asc" },
  });
}

export const locationService = {
  async getProvinces() {
    if (env.CACHE_ENABLED) {
      const hit = await cacheGetJson<
        Awaited<ReturnType<typeof fetchProvinces>>
      >(CacheKeys.provinces);
      if (hit) return hit.filter((row) => !isHiddenLocation(row));
    }
    const rows = await fetchProvinces();
    if (env.CACHE_ENABLED) {
      await cacheSetJson(CacheKeys.provinces, rows, 43200);
    }
    return rows;
  },

  async getDistrictsByProvince(provinceId: number) {
    if (isNaN(provinceId)) throw new HttpException("Invalid ID", 400);
    if (env.CACHE_ENABLED) {
      const hit = await cacheGetJson<
        Awaited<ReturnType<typeof fetchDistricts>>
      >(CacheKeys.districts(provinceId));
      if (hit) return hit.filter((row) => !isHiddenLocation(row));
    }
    const district = (await fetchDistricts(provinceId)).filter(
      (row) => !isHiddenLocation(row),
    );
    if (env.CACHE_ENABLED) {
      await cacheSetJson(CacheKeys.districts(provinceId), district, 43200);
    }
    return district;
  },
  async validateProvinceDistrict(provinceId: number, districtId: number) {
    if (isNaN(provinceId) || isNaN(districtId))
      throw new HttpException("Invalid ID", 400);
    const district = await prisma.district.findFirst({
      where: {
        id: districtId,
        provinceId,
        deletedAt: null,
        province: { deletedAt: null },
      },
    });

    if (!district) {
      throw new HttpException("Quận/huyện không thuộc tỉnh đã chọn", 400);
    }
  },

  async listProvincesAdmin(query: Record<string, unknown>) {
    const take = Math.min(Number(query.limit) || 12, 100);
    const page = Math.max(1, Number(query.page) || 1);
    const search =
      query.search != null && String(query.search).trim() !== ""
        ? String(query.search).trim()
        : "";
    const where = {
      deletedAt: null,
      NOT: {
        OR: [
          { code: "UNKNOWN" },
          { name: "Chưa xác định" },
          { name: "Không xác định" },
        ],
      },
      ...(search
        ? {
            OR: [
              { name: { contains: search } },
              { code: { contains: search } },
            ],
          }
        : {}),
    };
    const skip = (page - 1) * take;
    const [provinces, total] = await Promise.all([
      prisma.province.findMany({
        where,
        skip,
        take,
        orderBy: { name: "asc" },
        include: {
          _count: {
            select: {
              districts: true,
              companies: true,
              candidates: true,
            },
          },
        },
      }),
      prisma.province.count({ where }),
    ]);
    return {
      provinces,
      pagination: {
        total,
        page,
        limit: take,
        totalPages: Math.max(1, Math.ceil(total / take)),
      },
    };
  },

  async createProvince(data: { name: string; code?: string }) {
    try {
      const row = await prisma.province.create({
        data: {
          name: data.name,
          ...(data.code ? { code: data.code } : {}),
        },
      });
      await invalidateLocationCaches();
      return row;
    } catch (e: unknown) {
      if (
        typeof e === "object" &&
        e !== null &&
        "code" in e &&
        (e as { code: string }).code === "P2002"
      ) {
        throw new HttpException("Mã tỉnh/thành đã tồn tại", 400);
      }
      throw e;
    }
  },

  async updateProvince(
    id: number,
    data: { name?: string; code?: string | null },
  ) {
    if (isNaN(id)) throw new HttpException("Invalid ID", 400);
    const existing = await prisma.province.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) throw new HttpException("Không tìm thấy tỉnh/thành", 404);
    const updateData: { name?: string; code?: string | null } = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.code !== undefined) updateData.code = data.code;
    try {
      const row = await prisma.province.update({
        where: { id },
        data: updateData,
      });
      await invalidateLocationCaches();
      return row;
    } catch (e: unknown) {
      if (
        typeof e === "object" &&
        e !== null &&
        "code" in e &&
        (e as { code: string }).code === "P2002"
      ) {
        throw new HttpException("Mã tỉnh/thành đã tồn tại", 400);
      }
      throw e;
    }
  },

  async deleteProvince(id: number) {
    if (isNaN(id)) throw new HttpException("Invalid ID", 400);
    const row = await prisma.province.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            districts: true,
            companies: true,
            candidates: true,
          },
        },
      },
    });
    if (!row) throw new HttpException("Không tìm thấy tỉnh/thành", 404);
    const pref = await prisma.candidatePreference.count({
      where: { preferredProvinceId: id },
    });
    if (row._count.districts > 0) {
      throw new HttpException(
        "Không thể xóa: vẫn còn quận/huyện. Xóa hoặc gộp quận/huyện trước.",
        400,
      );
    }
    if (row._count.companies > 0 || row._count.candidates > 0 || pref > 0) {
      throw new HttpException(
        "Không thể xóa: đang có công ty, ứng viên hoặc tùy chọn ưu tiên gắn tỉnh này.",
        400,
      );
    }
    await prisma.province.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    await invalidateLocationCaches();
  },

  async restoreProvince(id: number) {
    if (isNaN(id)) throw new HttpException("Invalid ID", 400);
    const row = await prisma.province.update({
      where: { id },
      data: { deletedAt: null },
    });
    await invalidateLocationCaches();
    return row;
  },

  async listDistrictsAdmin(provinceId: number) {
    if (isNaN(provinceId)) throw new HttpException("Invalid ID", 400);
    const p = await prisma.province.findFirst({
      where: { id: provinceId, deletedAt: null },
      select: { id: true, name: true },
    });
    if (!p) throw new HttpException("Không tìm thấy tỉnh/thành", 404);
    const districts = await prisma.district.findMany({
      where: { provinceId, deletedAt: null },
      orderBy: { name: "asc" },
      include: {
        _count: {
          select: { companies: true, candidates: true },
        },
      },
    });
    const ids = districts.map((d) => d.id);
    let prefMap = new Map<number, number>();
    if (ids.length) {
      const prefAgg = await prisma.candidatePreference.groupBy({
        by: ["preferredDistrictId"],
        where: { preferredDistrictId: { in: ids } },
        _count: { _all: true },
      });
      prefMap = new Map(
        prefAgg
          .filter(
            (r): r is (typeof r) & { preferredDistrictId: number } =>
              r.preferredDistrictId != null,
          )
          .map((r) => [r.preferredDistrictId, r._count._all]),
      );
    }
    const districtsOut = districts.map((d) => ({
      ...d,
      _count: {
        ...d._count,
        preferences: prefMap.get(d.id) ?? 0,
      },
    }));
    return { province: p, districts: districtsOut };
  },

  async createDistrict(data: { provinceId: number; name: string }) {
    const { provinceId, name } = data;
    if (isNaN(provinceId)) throw new HttpException("Invalid ID", 400);
    const p = await prisma.province.findFirst({
      where: { id: provinceId, deletedAt: null },
    });
    if (!p) throw new HttpException("Không tìm thấy tỉnh/thành", 404);
    const row = await prisma.district.create({
      data: { provinceId, name },
    });
    await invalidateLocationCachesForProvince(provinceId);
    return row;
  },

  async updateDistrict(id: number, data: { name: string }) {
    if (isNaN(id)) throw new HttpException("Invalid ID", 400);
    const existing = await prisma.district.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) throw new HttpException("Không tìm thấy quận/huyện", 404);
    const row = await prisma.district.update({
      where: { id },
      data: { name: data.name },
    });
    await invalidateLocationCachesForProvince(existing.provinceId);
    return row;
  },

  async deleteDistrict(id: number) {
    if (isNaN(id)) throw new HttpException("Invalid ID", 400);
    const row = await prisma.district.findUnique({
      where: { id },
      include: {
        _count: { select: { companies: true, candidates: true } },
      },
    });
    if (!row) throw new HttpException("Không tìm thấy quận/huyện", 404);
    const pref = await prisma.candidatePreference.count({
      where: { preferredDistrictId: id },
    });
    if (row._count.companies > 0 || row._count.candidates > 0 || pref > 0) {
      throw new HttpException(
        "Không thể xóa: đang có công ty, ứng viên hoặc tùy chọn ưu tiên gắn quận/huyện này.",
        400,
      );
    }
    const pid = row.provinceId;
    await prisma.district.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    await invalidateLocationCachesForProvince(pid);
  },

  async restoreDistrict(id: number) {
    if (isNaN(id)) throw new HttpException("Invalid ID", 400);
    const district = await prisma.district.findUnique({
      where: { id },
      include: { province: true },
    });
    if (!district) throw new HttpException("Không tìm thấy quận/huyện", 404);
    if (district.province.deletedAt) {
      throw new HttpException("Không thể khôi phục khi tỉnh/thành đã bị xóa", 400);
    }
    const row = await prisma.district.update({
      where: { id },
      data: { deletedAt: null },
    });
    await invalidateLocationCachesForProvince(row.provinceId);
    return row;
  },

  async invalidateAllCaches() {
    await invalidateLocationCaches();
  },

  async invalidateCachesForProvince(provinceId: number) {
    await invalidateLocationCachesForProvince(provinceId);
  },
};
