import { HttpException } from "../utils/exception";
import { prisma } from "../utils/prisma";

async function requireCandidate(userId: number) {
  const candidate = await prisma.candidate.findUnique({
    where: { userId },
  });
  if (!candidate) {
    throw new HttpException(
      "Chỉ ứng viên mới theo dõi được công ty",
      403,
      "COMPANY_FOLLOW_CANDIDATE_ONLY",
    );
  }
  return candidate;
}

async function requirePublicCompany(companyId: number) {
  if (Number.isNaN(companyId)) {
    throw new HttpException("Invalid id", 400);
  }
  const company = await prisma.company.findFirst({
    where: { id: companyId, status: true },
    select: { id: true },
  });
  if (!company) {
    throw new HttpException("Công ty không tồn tại", 404);
  }
}

export const companyFollowService = {
  async follow(userId: number, companyId: number) {
    const candidate = await requireCandidate(userId);
    await requirePublicCompany(companyId);

    const existing = await prisma.companyFollow.findUnique({
      where: {
        candidateId_companyId: {
          candidateId: candidate.id,
          companyId,
        },
      },
    });
    if (existing) return { following: true, id: existing.id };

    await prisma.companyFollow.create({
      data: {
        candidateId: candidate.id,
        companyId,
      },
    });
    return { following: true };
  },

  async unfollow(userId: number, companyId: number) {
    const candidate = await requireCandidate(userId);
    if (Number.isNaN(companyId)) {
      throw new HttpException("Invalid id", 400);
    }
    await prisma.companyFollow.deleteMany({
      where: {
        candidateId: candidate.id,
        companyId,
      },
    });
    return { following: false };
  },

  async status(userId: number, companyId: number) {
    if (Number.isNaN(companyId)) {
      throw new HttpException("Invalid id", 400);
    }
    const candidate = await prisma.candidate.findUnique({
      where: { userId },
    });
    if (!candidate) {
      return { following: false };
    }
    const row = await prisma.companyFollow.findUnique({
      where: {
        candidateId_companyId: {
          candidateId: candidate.id,
          companyId,
        },
      },
    });
    return { following: !!row };
  },

  async listFollowedCompanies(userId: number) {
    const candidate = await prisma.candidate.findUnique({
      where: { userId },
    });
    if (!candidate) {
      return [];
    }

    const follows = await prisma.companyFollow.findMany({
      where: {
        candidateId: candidate.id,
        company: { status: true },
      },
      orderBy: { createdAt: "desc" },
      include: {
        company: {
          include: {
            province: true,
            district: true,
            categories: { include: { parentCategory: true } },
            _count: { select: { jobs: true } },
          },
        },
      },
    });

    return follows.map((f) => ({
      followedAt: f.createdAt,
      company: f.company,
    }));
  },
};
