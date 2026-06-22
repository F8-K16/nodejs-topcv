import { maintenanceQueue } from "../queues/maintenance.queue";

maintenanceQueue.upsertJobScheduler(
  "cleanup-expired-jobs-scheduler",
  {
    pattern: "0 * * * *",
  },
  {
    name: "cleanup-expired-jobs",
    data: {},
    opts: {
      removeOnComplete: true,
      removeOnFail: true,
    },
  },
);

maintenanceQueue.upsertJobScheduler(
  "purge-expired-jobs-scheduler",
  {
    pattern: "30 */6 * * *",
  },
  {
    name: "purge-expired-jobs",
    data: {},
    opts: {
      removeOnComplete: true,
      removeOnFail: true,
    },
  },
);

maintenanceQueue.upsertJobScheduler(
  "purge-old-cv-drafts-scheduler",
  {
    pattern: "0 2 * * *",
  },
  {
    name: "purge-old-cv-drafts",
    data: { days: 30 },
    opts: {
      removeOnComplete: true,
      removeOnFail: true,
    },
  },
);
