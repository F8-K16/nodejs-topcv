import { Resume } from "../types/resume.type";
import { HttpException } from "../utils/exception";
import { prisma, prismaTransaction } from "../utils/prisma";

export const resumeService = {
  async getAll({
    page = 1,
    limit = 12,
    search = "",
  }: {
    page?: number;
    limit?: number;
    search?: string;
  }) {
    const safePage = Math.max(1, Number(page) || 1);
    const safeLimit = Math.max(1, Number(limit) || 12);
    const skip = (safePage - 1) * safeLimit;
    const where = search
      ? {
          deletedAt: null,
          OR: [
            {
              title: {
                contains: search,
              },
            },
            {
              fileUrl: {
                contains: search,
              },
            },
            {
              candidate: {
                user: {
                  email: {
                    contains: search,
                  },
                },
              },
            },
            {
              candidate: {
                user: {
                  username: {
                    contains: search,
                  },
                },
              },
            },
            {
              candidate: {
                user: {
                  userPhone: {
                    phone: {
                      contains: search,
                    },
                  },
                },
              },
            },
          ],
        }
      : { deletedAt: null };

    const [resumes, totalItems] = await Promise.all([
      prisma.resume.findMany({
        where,
        include: {
          candidate: {
            include: {
              user: {
                include: {
                  userPhone: true,
                  cvs: {
                    where: { status: "COMPLETED" },
                    include: {
                      template: {
                        select: {
                          id: true,
                          name: true,
                        },
                      },
                    },
                    orderBy: {
                      updatedAt: "desc",
                    },
                  },
                },
              },
            },
          },
          applications: true,
        },
        orderBy: {
          createdAt: "desc",
        },
        skip,
        take: safeLimit,
      }),

      prisma.resume.count({
        where,
      }),
    ]);

    return {
      resumes,
      pagination: {
        page: safePage,
        limit: safeLimit,
        totalItems,
        totalPages: Math.ceil(totalItems / safeLimit),
      },
    };
  },

  async createResume(data: Resume) {
    return await prisma.resume.create({
      data: {
        title: data.title,
        fileUrl: data.fileUrl,
        candidateId: data.candidateId,
      },
    });
  },

  async uploadMyResume(
    userId: number,
    data: { title: string; fileUrl: string },
  ) {
    const candidate = await prisma.candidate.findUnique({
      where: { userId },
    });

    if (!candidate) {
      throw new HttpException("Không tìm thấy hồ sơ ứng viên", 404);
    }

    return await prisma.resume.create({
      data: {
        title: data.title,
        fileUrl: data.fileUrl,
        candidateId: candidate.id,
      },
    });
  },

  async getResumeById(id: number) {
    if (isNaN(id)) throw new HttpException("Invalid ID", 400);
    return await prisma.resume.findMany({
      where: {
        deletedAt: null,
        candidate: {
          userId: id,
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });
  },

  async updateResume(id: number, data: Resume) {
    if (isNaN(id)) throw new HttpException("Invalid ID", 400);
    return await prisma.resume.update({
      where: { id },
      data: {
        title: data.title,
        fileUrl: data.fileUrl,
        candidateId: data.candidateId,
      },
    });
  },

  async deleteResume(id: number) {
    if (isNaN(id)) throw new HttpException("Invalid ID", 400);
    return await prismaTransaction(async (tx) => {
      await tx.application.updateMany({
        where: { resumeId: Number(id) },
        data: { resumeId: null },
      });
      return tx.resume.update({
        where: { id: Number(id) },
        data: { deletedAt: new Date() },
      });
    });
  },

  async deleteMyResume(userId: number, resumeId: number) {
    if (isNaN(userId) || isNaN(resumeId)) {
      throw new HttpException("Invalid ID", 400);
    }

    const candidate = await prisma.candidate.findUnique({
      where: { userId },
    });

    if (!candidate) {
      throw new HttpException("Candidate not found", 404);
    }

    const resume = await prisma.resume.findFirst({
      where: {
        id: resumeId,
        candidateId: candidate.id,
        deletedAt: null,
      },
    });

    if (!resume) {
      throw new HttpException("Resume not found", 404);
    }

    return await prisma.resume.update({
      where: { id: resumeId },
      data: { deletedAt: new Date() },
    });
  },

  async restoreResume(id: number) {
    if (isNaN(id)) throw new HttpException("Invalid ID", 400);
    return prisma.resume.update({
      where: { id },
      data: { deletedAt: null },
    });
  },
};
