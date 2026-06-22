import { env } from "../config/env";
import { maintenanceQueue } from "../queues/maintenance.queue";
import { logger } from "../utils/logger";


if (env.NOTIFICATION_PURGE_ENABLED) {
  maintenanceQueue.upsertJobScheduler(
    "purge-old-notifications-scheduler",
    {
      every: env.NOTIFICATION_PURGE_INTERVAL_MS,
    },
    {
      name: "purge-old-notifications",
      data: {},
      opts: {
        removeOnComplete: true,
        removeOnFail: true,
      },
    },
  );

  logger.info("Registered purge-old-notifications scheduler", {
    everyMs: env.NOTIFICATION_PURGE_INTERVAL_MS,
    readDays: env.NOTIFICATION_DELETE_READ_DAYS,
    maxAgeDays: env.NOTIFICATION_DELETE_MAX_AGE_DAYS,
  });
} else {
  logger.info(
    "Notification purge scheduler disabled (NOTIFICATION_PURGE_ENABLED=false)",
  );
}
