import { Job } from "bullmq";

import { env } from "../config/env";
import { cvService } from "../services/cv.service";
import { jobService } from "../services/job.service";
import { notificationService } from "../services/notification.service";
import { logger } from "../utils/logger";
import { createWorkerWithHandlers } from "./factory.worker";

const maintenanceHandlers = {
  "cleanup-expired-jobs": async (job: Job) => {
    const r = await jobService.purgeExpiredJobs();
    if (r.deleted > 0) {
      logger.info("cleanup-expired-jobs: deleted expired jobs", {
        jobId: job.id,
        deleted: r.deleted,
      });
    }
  },
  "purge-expired-jobs": async (job: Job) => {
    const r = await jobService.purgeExpiredJobs();
    if (r.deleted > 0) {
      logger.info("purge-expired-jobs: deleted expired jobs", {
        jobId: job.id,
        deleted: r.deleted,
      });
    }
  },
  "purge-old-notifications": async (job: Job) => {
    if (!env.NOTIFICATION_PURGE_ENABLED) {
      return;
    }
    const r = await notificationService.purgeOldNotifications();
    if (r.deletedAncient > 0 || r.deletedOldRead > 0) {
      logger.info("purge-old-notifications completed", {
        jobId: job.id,
        deletedAncient: r.deletedAncient,
        deletedOldRead: r.deletedOldRead,
      });
    }
  },
  "purge-old-cv-drafts": async (job: Job) => {
    const days = Number(job.data?.days) || 30;
    const r = await cvService.purgeOldDraftCvs(days);
    if (r.deleted > 0) {
      logger.info("purge-old-cv-drafts: deleted old CV drafts", {
        jobId: job.id,
        deleted: r.deleted,
        days,
      });
    }
  },
};

export const maintenanceWorker = createWorkerWithHandlers(
  "MAINTENANCE_QUEUE",
  maintenanceHandlers,
);
