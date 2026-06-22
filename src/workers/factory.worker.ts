/* eslint-disable no-unused-vars */
import { Job } from "bullmq";
import { bullMq } from "../utils/bullmq";
import { logger } from "../utils/logger";

export const createWorkerWithHandlers = (
  queueName: string,
  handlers: Record<string, (job: Job) => Promise<void> | void>,
) => {
  return bullMq.createWorker(queueName, async (job: Job) => {
    const handler = handlers[job.name];

    logger.info("Worker processing job", {
      queueName,
      jobName: job.name,
      jobId: job.id,
    });

    if (!handler) {
      throw new Error(`No handler for job: ${job.name}`);
    }

    try {
      await handler(job);
      logger.info("Worker completed job", {
        queueName,
        jobName: job.name,
        jobId: job.id,
      });
    } catch (err) {
      logger.error("Worker failed job", {
        queueName,
        jobName: job.name,
        jobId: job.id,
        error: err,
      });
      throw err;
    }
  });
};
