import { Prisma } from "../generated/prisma/client";
import { env } from "../config/env";
import type {
  CreateCvTemplateInput,
  CvUpdateInput,
  UpdateCvTemplateInput,
} from "../schemas/cv.schema";
import { HttpException } from "../utils/exception";
import { prisma } from "../utils/prisma";
import {
  CacheKeys,
  cacheGetJson,
  cacheSetJsonPersistent,
  invalidateCvTemplateCaches,
} from "../utils/cache";

type TemplateBlock = {
  id: string;
  type: "text" | "multiline";
  bindingPath: string;
  defaultValue?: string;
};

type TemplateSection = {
  id: string;
  label: string;
  bindingPath: string;
  itemBlocks?: TemplateBlock[];
  defaultItem?: Record<string, string>;
};

type TemplateData = {
  layout?: string;
  meta?: Record<string, unknown>;
  blocks?: TemplateBlock[];
  sections?: TemplateSection[];
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value != null && typeof value === "object" && !Array.isArray(value);

const isTemplateBlock = (value: unknown): value is TemplateBlock => {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    (value.type === "text" || value.type === "multiline") &&
    typeof value.bindingPath === "string" &&
    value.bindingPath.length > 0
  );
};

const isTemplateSection = (value: unknown): value is TemplateSection => {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    typeof value.label === "string" &&
    typeof value.bindingPath === "string" &&
    value.bindingPath.length > 0
  );
};

const normalizeTemplateData = (value: unknown): TemplateData => {
  if (!isRecord(value)) return {};
  const templateData: TemplateData = {};
  if (typeof value.layout === "string") templateData.layout = value.layout;
  if (isRecord(value.meta)) templateData.meta = value.meta;
  if (Array.isArray(value.blocks)) {
    templateData.blocks = value.blocks.filter(isTemplateBlock);
  }
  if (Array.isArray(value.sections)) {
    templateData.sections = value.sections
      .filter(isTemplateSection)
      .map((section) => {
        const itemBlocks = Array.isArray(section.itemBlocks)
          ? section.itemBlocks.filter(isTemplateBlock)
          : undefined;
        const defaultItem = isRecord(section.defaultItem)
          ? Object.fromEntries(
              Object.entries(section.defaultItem).map(([key, itemValue]) => [
                key,
                typeof itemValue === "string" ? itemValue : String(itemValue ?? ""),
              ]),
            )
          : undefined;
        return {
          ...section,
          ...(itemBlocks ? { itemBlocks } : {}),
          ...(defaultItem ? { defaultItem } : {}),
        };
      });
  }
  return templateData;
};

const setByPath = (
  obj: Record<string, unknown>,
  path: string,
  value: unknown,
) => {
  const parts = path.split(".");
  let cursor = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i]!;
    if (
      cursor[key] === undefined ||
      cursor[key] === null ||
      typeof cursor[key] !== "object" ||
      Array.isArray(cursor[key])
    ) {
      cursor[key] = {};
    }
    cursor = cursor[key] as Record<string, unknown>;
  }
  cursor[parts[parts.length - 1]!] = value;
};

export const buildDefaultContentFromTemplate = (
  templateData: TemplateData,
): Record<string, unknown> => {
  const safeTemplateData = normalizeTemplateData(templateData);
  const content: Record<string, unknown> = {
    meta: safeTemplateData.meta ?? {},
  };

  for (const block of safeTemplateData.blocks ?? []) {
    setByPath(content, block.bindingPath, block.defaultValue ?? "");
  }

  for (const section of safeTemplateData.sections ?? []) {
    if (section.defaultItem && Object.keys(section.defaultItem).length > 0) {
      setByPath(content, section.bindingPath, [{ ...section.defaultItem }]);
      continue;
    }
    const fallbackItem: Record<string, string> = {};
    for (const block of section.itemBlocks ?? []) {
      fallbackItem[block.bindingPath] = block.defaultValue ?? "";
    }
    setByPath(
      content,
      section.bindingPath,
      Object.keys(fallbackItem).length > 0 ? [fallbackItem] : [],
    );
  }

  return content;
};

export const cvService = {
  async listTemplatesForAdmin() {
    const cacheKey = CacheKeys.cvTemplatesAdminList;
    const cached = await cacheGetJson<Awaited<ReturnType<typeof prisma.cvTemplate.findMany>>>(
      cacheKey,
    );
    if (cached) return cached;

    const data = await prisma.cvTemplate.findMany({
      where: { deletedAt: null },
      orderBy: { updatedAt: "desc" },
    });
    await cacheSetJsonPersistent(cacheKey, data);
    return data;
  },

  async listTemplates() {
    const cacheKey = CacheKeys.cvTemplatesPublicList;
    const cached = await cacheGetJson<
      Awaited<ReturnType<typeof prisma.cvTemplate.findMany>>
    >(cacheKey);
    if (cached) return cached;

    const templates = await prisma.cvTemplate.findMany({
      where: { isActive: true, deletedAt: null },
      orderBy: { id: "asc" },
      select: {
        id: true,
        name: true,
        description: true,
        thumbnailUrl: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    await cacheSetJsonPersistent(cacheKey, templates);
    return templates;
  },

  async getTemplate(id: number) {
    if (!Number.isFinite(id)) {
      throw new HttpException("Mẫu CV không hợp lệ", 400);
    }
    const cacheKey = CacheKeys.cvTemplatePublicDetail(id);
    const cached = await cacheGetJson<Awaited<ReturnType<typeof prisma.cvTemplate.findFirst>>>(
      cacheKey,
    );
    if (cached) return cached;

    const template = await prisma.cvTemplate.findFirst({
      where: { id, isActive: true, deletedAt: null },
    });
    if (!template) {
      throw new HttpException("Không tìm thấy mẫu CV", 404);
    }
    await cacheSetJsonPersistent(cacheKey, template);
    return template;
  },

  async createTemplate(input: CreateCvTemplateInput) {
    const created = await prisma.cvTemplate.create({
      data: {
        name: input.name.trim(),
        description: input.description?.trim() || null,
        thumbnailUrl: input.thumbnailUrl?.trim() || null,
        templateData: input.templateData as unknown as Prisma.InputJsonValue,
        isActive: input.isActive ?? true,
      },
    });
    await invalidateCvTemplateCaches(created.id);
    return created;
  },

  async updateTemplate(id: number, input: UpdateCvTemplateInput) {
    if (!Number.isFinite(id)) {
      throw new HttpException("Mẫu CV không hợp lệ", 400);
    }
    const existing = await prisma.cvTemplate.findFirst({
      where: { id, deletedAt: null },
      select: { id: true },
    });
    if (!existing) {
      throw new HttpException("Không tìm thấy mẫu CV", 404);
    }
    const updated = await prisma.cvTemplate.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(input.description !== undefined
          ? { description: input.description?.trim() || null }
          : {}),
        ...(input.thumbnailUrl !== undefined
          ? { thumbnailUrl: input.thumbnailUrl?.trim() || null }
          : {}),
        ...(input.templateData !== undefined
          ? {
              templateData:
                input.templateData as unknown as Prisma.InputJsonValue,
            }
          : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      },
    });
    await invalidateCvTemplateCaches(updated.id);
    return updated;
  },

  async deleteTemplate(id: number) {
    if (!Number.isFinite(id)) {
      throw new HttpException("Mẫu CV không hợp lệ", 400);
    }
    const deleted = await prisma.cvTemplate.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });
    await invalidateCvTemplateCaches(id);
    return deleted;
  },

  async restoreTemplate(id: number) {
    if (!Number.isFinite(id)) {
      throw new HttpException("Mẫu CV không hợp lệ", 400);
    }
    const restored = await prisma.cvTemplate.update({
      where: { id },
      data: { deletedAt: null, isActive: true },
    });
    await invalidateCvTemplateCaches(id);
    return restored;
  },

  async createCv(
    userId: number,
    input: { templateId: number; title?: string },
  ) {
    const template = await this.getTemplate(input.templateId);
    const templateData = template.templateData as unknown as TemplateData;
    const content = buildDefaultContentFromTemplate(templateData);

    const title =
      input.title?.trim() || `CV - ${template.name}`;

    const cv = await prisma.cv.create({
      data: {
        userId,
        templateId: template.id,
        title,
        status: "DRAFT",
        content: content as unknown as Prisma.InputJsonValue,
      },
      include: { template: true },
    });
    return cv;
  },

  async listMyCvs(userId: number) {
    return prisma.cv.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        title: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        lastEditedAt: true,
        template: {
          select: { id: true, name: true, thumbnailUrl: true },
        },
      },
    });
  },

  async getMyCv(userId: number, cvId: number) {
    if (!Number.isFinite(cvId)) {
      throw new HttpException("CV không hợp lệ", 400);
    }
    const cv = await prisma.cv.findUnique({
      where: { id: cvId },
      include: { template: true },
    });
    if (!cv || cv.userId !== userId) {
      throw new HttpException("Không tìm thấy CV", 404);
    }
    return cv;
  },

  async updateMyCv(userId: number, cvId: number, input: CvUpdateInput) {
    const existing = await this.getMyCv(userId, cvId);

    const data: Prisma.CvUpdateInput = { lastEditedAt: new Date() };
    if (input.title !== undefined) data.title = input.title;
    if (input.status !== undefined) data.status = input.status;
    if (input.content !== undefined) {
      data.content = input.content as unknown as Prisma.InputJsonValue;
    }

    const updated = await prisma.cv.update({
      where: { id: existing.id },
      data,
      include: { template: true },
    });
    return updated;
  },

  async deleteMyCv(userId: number, cvId: number) {
    const existing = await this.getMyCv(userId, cvId);
    const candidate = await prisma.candidate.findUnique({
      where: { userId },
      select: { id: true },
    });

    if (candidate) {
      const publishedUrl = `${env.FRONTEND_URL.replace(/\/$/, "")}/resumes/shared/${existing.id}`;
      await prisma.resume.deleteMany({
        where: {
          candidateId: candidate.id,
          fileUrl: publishedUrl,
        },
      });
    }

    await prisma.cv.delete({ where: { id: existing.id } });
    return { id: existing.id };
  },

  async getPublicCv(cvId: number) {
    if (!Number.isFinite(cvId)) {
      throw new HttpException("CV không hợp lệ", 400);
    }
    const cv = await prisma.cv.findUnique({
      where: { id: cvId },
      include: {
        template: true,
      },
    });
    if (!cv || cv.status !== "COMPLETED") {
      throw new HttpException("Không tìm thấy CV", 404);
    }
    return cv;
  },

 
  async getCvForAdmin(cvId: number) {
    if (!Number.isFinite(cvId)) {
      throw new HttpException("CV không hợp lệ", 400);
    }
    const cv = await prisma.cv.findUnique({
      where: { id: cvId },
      include: {
        template: true,
      },
    });
    if (!cv) {
      throw new HttpException("Không tìm thấy CV", 404);
    }
    return cv;
  },

  async publishCvAsResume(userId: number, cvId: number) {
    const candidate = await prisma.candidate.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!candidate) {
      throw new HttpException("Không tìm thấy hồ sơ ứng viên", 404);
    }

    const cv = await this.getMyCv(userId, cvId);
    const publishedUrl = `${env.FRONTEND_URL.replace(/\/$/, "")}/resumes/shared/${cv.id}`;

    const existing = await prisma.resume.findFirst({
      where: {
        candidateId: candidate.id,
        fileUrl: publishedUrl,
      },
    });

    if (existing) {
      return prisma.resume.update({
        where: { id: existing.id },
        data: {
          title: cv.title,
        },
      });
    }

    return prisma.resume.create({
      data: {
        candidateId: candidate.id,
        title: cv.title,
        fileUrl: publishedUrl,
      },
    });
  },

  async purgeOldDraftCvs(days = 30) {
    const cutoffMs = Date.now() - days * 24 * 60 * 60 * 1000;
    const cutoff = new Date(cutoffMs);
    const r = await prisma.cv.deleteMany({
      where: {
        status: "DRAFT",
        lastEditedAt: {
          lt: cutoff,
        },
      },
    });
    return { deleted: r.count };
  },
};
