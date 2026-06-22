import { Job } from "bullmq";

import { env } from "../config/env";
import { prisma } from "../utils/prisma";
import { getOpenSearchClient, isOpenSearchEnabled } from "../utils/opensearch";
import { createWorkerWithHandlers } from "./factory.worker";
import { ensureJobsIndex } from "../search/jobs.index";
import { shouldIndexPublicJob, toJobSearchDocument, JobWithIndexRelations } from "../search/jobs.document";
import { logger } from "../utils/logger";

const getStatusCode = (err: unknown): number | undefined => {
  if (!err || typeof err !== "object") return undefined;
  const e = err as Record<string, unknown>;
  if (typeof e.statusCode === "number") return e.statusCode;
  const meta = e.meta;
  if (!meta || typeof meta !== "object") return undefined;
  const m = meta as Record<string, unknown>;
  if (typeof m.statusCode === "number") return m.statusCode;
  return undefined;
};

const handlers = {
  "upsert-job": async (job: Job) => {
    if (!isOpenSearchEnabled()) return;
    const client = getOpenSearchClient();
    if (!client) return;

    const jobId = Number(job.data?.jobId);
    if (!Number.isFinite(jobId) || jobId <= 0) return;

    await ensureJobsIndex();

    const row: JobWithIndexRelations | null = await prisma.job.findUnique({
      where: { id: Math.trunc(jobId) },
      include: {
        company: { include: { province: true, district: true } },
        category: true,
        jobSkills: { include: { skill: true } },
      },
    });

    if (!row || !shouldIndexPublicJob(row)) {
      try {
        await client.delete({ index: env.OPENSEARCH_JOBS_INDEX, id: String(Math.trunc(jobId)) });
      } catch (err) {
        const status = getStatusCode(err);
        if (status !== 404) {
          logger.error("OpenSearch delete failed", { error: err, jobId });
        }
      }
      return;
    }

    const doc = toJobSearchDocument(row);
    await client.index({
      index: env.OPENSEARCH_JOBS_INDEX,
      id: String(doc.id),
      body: doc,
    });
  },
  "delete-job": async (job: Job) => {
    if (!isOpenSearchEnabled()) return;
    const client = getOpenSearchClient();
    if (!client) return;

    const jobId = Number(job.data?.jobId);
    if (!Number.isFinite(jobId) || jobId <= 0) return;

    await ensureJobsIndex();

    try {
      await client.delete({ index: env.OPENSEARCH_JOBS_INDEX, id: String(Math.trunc(jobId)) });
    } catch (err) {
      const status = getStatusCode(err);
      if (status !== 404) {
        logger.error("OpenSearch delete failed", { error: err, jobId });
      }
    }
  },
};

export const searchIndexWorker = createWorkerWithHandlers(
  "SEARCH_INDEX_QUEUE",
  handlers,
);
