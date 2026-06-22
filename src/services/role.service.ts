import { prisma } from "../utils/prisma";
import { HttpException } from "../utils/exception";

export const roleService = {
  async getRoles() {
    return prisma.role.findMany({ where: { deletedAt: null } });
  },

  async resolveRoleIds(input: unknown): Promise<number[]> {
    if (input == null) return [];
    const raw = Array.isArray(input) ? input : [input];

    const numericIds: number[] = [];
    const nameKeys: string[] = [];

    for (const item of raw) {
      if (typeof item === "number" && Number.isFinite(item)) {
        numericIds.push(item);
        continue;
      }
      if (typeof item === "string") {
        const trimmed = item.trim();
        if (!trimmed) continue;
        const asNumber = Number(trimmed);
        if (Number.isFinite(asNumber) && String(asNumber) === trimmed) {
          numericIds.push(asNumber);
          continue;
        }
        nameKeys.push(trimmed.toUpperCase());
      }
    }

    const uniqueIds = Array.from(new Set(numericIds)).filter(
      (id) => Number.isInteger(id) && id > 0,
    );
    const uniqueNames = Array.from(new Set(nameKeys)).filter(Boolean);

    const [byId, byName] = await Promise.all([
      uniqueIds.length > 0
        ? prisma.role.findMany({
            where: { id: { in: uniqueIds }, deletedAt: null },
            select: { id: true },
          })
        : Promise.resolve([] as { id: number }[]),
      uniqueNames.length > 0
        ? prisma.role.findMany({
            where: { name: { in: uniqueNames }, deletedAt: null },
            select: { id: true, name: true },
          })
        : Promise.resolve([] as { id: number; name: string }[]),
    ]);

    const resolvedIds = Array.from(
      new Set([...byId.map((r) => r.id), ...byName.map((r) => r.id)]),
    );

    if (resolvedIds.length === 0 && raw.length > 0) {
      throw new HttpException("Vai trò không hợp lệ", 400, "VALIDATION_ERROR", {
        roles: ["Vai trò không hợp lệ"],
      });
    }

    if (uniqueIds.length > 0) {
      const found = new Set(byId.map((r) => r.id));
      const missing = uniqueIds.filter((id) => !found.has(id));
      if (missing.length > 0) {
        throw new HttpException("Vai trò không hợp lệ", 400, "VALIDATION_ERROR", {
          roles: ["Vai trò không hợp lệ"],
        });
      }
    }

    if (uniqueNames.length > 0) {
      const found = new Set(byName.map((r) => r.name));
      const missing = uniqueNames.filter((n) => !found.has(n));
      if (missing.length > 0) {
        throw new HttpException("Vai trò không hợp lệ", 400, "VALIDATION_ERROR", {
          roles: ["Vai trò không hợp lệ"],
        });
      }
    }

    return resolvedIds;
  },
};
