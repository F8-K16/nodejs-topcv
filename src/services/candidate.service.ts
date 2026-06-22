import { prisma } from "../utils/prisma";

export const candidateService = {
  async getAllCandidates() {
    return await prisma.candidate.findMany({
      select: {
        id: true,
        user: {
          select: {
            username: true,
            email: true,
          },
        },
      },
    });
  },
};
