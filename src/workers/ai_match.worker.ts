import { Job } from "bullmq";

import { prisma } from "../utils/prisma";
import { createWorkerWithHandlers } from "./factory.worker";
import { aiService } from "../services/ai.service";
import { invalidateCandidateApplicationCaches } from "../utils/cache";

const handlers = {
  "score-application": async (job: Job) => {
    const applicationId = Number(job.data?.applicationId);
    if (!Number.isFinite(applicationId) || applicationId <= 0) return;

    const row = await prisma.application.findUnique({
      where: { id: Math.trunc(applicationId) },
      select: {
        id: true,
        aiMatchStatus: true,
        jobId: true,
        resumeId: true,
        candidate: { select: { userId: true } },
      },
    });

    if (!row || !row.resumeId) return;
    if (row.aiMatchStatus === "DONE") return;

    await prisma.application.update({
      where: { id: row.id },
      data: {
        aiMatchStatus: "RUNNING",
        aiMatchError: null,
        aiMatchUpdatedAt: new Date(),
      },
    });
    await invalidateCandidateApplicationCaches(row.candidate.userId);

    try {
      const out = await aiService.scoreCvMatch(row.candidate.userId, {
        language: "vi",
        jobId: row.jobId,
        resumeId: row.resumeId,
      });

      const reasonText = out.reasons?.length
        ? out.reasons.map((x) => `- ${x}`).join("\n").slice(0, 4000)
        : null;

      await prisma.application.update({
        where: { id: row.id },
        data: {
          aiMatchStatus: "DONE",
          aiMatchScore: out.matchScore,
          aiMatchReason: reasonText,
          aiMatchModel: out.model,
          aiMatchError: null,
          aiMatchUpdatedAt: new Date(),
        },
      });
      await invalidateCandidateApplicationCaches(row.candidate.userId);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await prisma.application.update({
        where: { id: row.id },
        data: {
          aiMatchStatus: "FAILED",
          aiMatchError: msg.slice(0, 255),
          aiMatchUpdatedAt: new Date(),
        },
      });
      await invalidateCandidateApplicationCaches(row.candidate.userId);
      throw e;
    }
  },
};

export const aiMatchWorker = createWorkerWithHandlers("AI_MATCH_QUEUE", handlers);
