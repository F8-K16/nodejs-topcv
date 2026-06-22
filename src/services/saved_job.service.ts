import { HttpException } from "../utils/exception";
import { prisma } from "../utils/prisma";
import { cacheDelRecommendedJobsForUser } from "../utils/cache";

export const SavedJobService = {
  async saveJob(userId: number, jobId: number) {
    if (!userId) throw new HttpException("Unauthorized", 401);
    if (isNaN(jobId)) throw new HttpException("Invalid ID", 400);

    const candidate = await prisma.candidate.findUnique({
      where: { userId },
    });

    if (!candidate) {
      throw new HttpException(
        "Chỉ ứng viên mới lưu được việc làm",
        403,
        "SAVED_JOB_CANDIDATE_ONLY",
      );
    }

    const job = await prisma.job.findFirst({
      where: {
        id: jobId,
        deletedAt: null,
        company: { deletedAt: null, status: true },
        category: { deletedAt: null },
      },
      select: { id: true },
    });
    if (!job) throw new HttpException("Việc làm không khả dụng", 404);

    const existed = await prisma.savedJob.findUnique({
      where: {
        candidateId_jobId: {
          candidateId: candidate.id,
          jobId,
        },
      },
    });

    if (existed) return existed;

    const row = await prisma.savedJob.create({
      data: {
        candidateId: candidate.id,
        jobId,
      },
    });
    await cacheDelRecommendedJobsForUser(userId);
    return row;
  },

  async unsaveJob(userId: number, jobId: number) {
    if (!userId) throw new HttpException("Unauthorized", 401);
    if (isNaN(jobId)) throw new HttpException("Invalid ID", 400);
    const candidate = await prisma.candidate.findUnique({
      where: { userId },
    });

    if (!candidate) {
      throw new HttpException(
        "Chỉ ứng viên mới lưu được việc làm",
        403,
        "SAVED_JOB_CANDIDATE_ONLY",
      );
    }

    try {
      await prisma.savedJob.deleteMany({
        where: {
          candidateId: candidate.id,
          jobId,
        },
      });
      await cacheDelRecommendedJobsForUser(userId);
    } catch {
      throw new HttpException("Bỏ lưu thất bại", 500);
    }
  },

  async getSavedJobs(userId: number) {
    if (!userId) throw new HttpException("Unauthorized", 401);
    const candidate = await prisma.candidate.findUnique({
      where: { userId },
    });

    if (!candidate) {
      return [];
    }

    return prisma.savedJob.findMany({
      where: {
        candidateId: candidate.id,
        job: {
          deletedAt: null,
          company: { deletedAt: null, status: true },
          category: { deletedAt: null },
        },
      },
      include: {
        job: {
          include: {
            company: {
              include: {
                province: true,
                district: true,
              },
            },
            category: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });
  },

  async checkSaved(userId: number, jobId: number) {
    if (!userId) throw new HttpException("Unauthorized", 401);
    if (isNaN(jobId)) throw new HttpException("Invalid ID", 400);
    const candidate = await prisma.candidate.findUnique({
      where: { userId },
    });

    if (!candidate) {
      return { isSaved: false };
    }

    const saved = await prisma.savedJob.findFirst({
      where: {
        candidateId: candidate.id,
        jobId,
        job: {
          deletedAt: null,
          company: { deletedAt: null, status: true },
          category: { deletedAt: null },
        },
      },
    });

    return { isSaved: !!saved };
  },
};
