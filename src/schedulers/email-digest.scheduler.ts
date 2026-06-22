import { emailQueue } from "../queues/email.queue";
import { env } from "../config/env";
import { logger } from "../utils/logger";
import { emailDigestService } from "../services/email_digest.service";

const tz = emailDigestService.digestTimezone;

if (env.DIGEST_EMAIL_ENABLED) {
  emailQueue.upsertJobScheduler(
    "daily-digest-followed-jobs",
    {
      pattern: "0 18 * * *",
      tz,
    },
    {
      name: "digest-followed-jobs",
      data: {},
      opts: {
        removeOnComplete: true,
        removeOnFail: true,
      },
    },
  );

  emailQueue.upsertJobScheduler(
    "daily-digest-recommended-jobs",
    {
      pattern: "30 18 * * *",
      tz,
    },
    {
      name: "digest-recommended-jobs",
      data: {},
      opts: {
        removeOnComplete: true,
        removeOnFail: true,
      },
    },
  );

  emailQueue.upsertJobScheduler(
    "daily-digest-employer-applications",
    {
      pattern: "30 7 * * *",
      tz,
    },
    {
      name: "digest-employer-applications",
      data: {},
      opts: {
        removeOnComplete: true,
        removeOnFail: true,
      },
    },
  );

  logger.info("Registered email digest schedulers (EMAIL_QUEUE)", {
    tz,
    followed: "18:00",
    recommended: "18:30",
    employerApplications: "07:30",
  });
} else {
  logger.info(
    "Email digest schedulers disabled (DIGEST_EMAIL_ENABLED=false)",
  );
}
