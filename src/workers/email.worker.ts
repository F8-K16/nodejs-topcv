import { Job } from "bullmq";
import { sendMailTemplate } from "../utils/mail";
import { emailDigestService } from "../services/email_digest.service";
import { createWorkerWithHandlers } from "./factory.worker";

const emailHandlers = {
  "send-email-verify": async (job: Job) => {
    const { to, subject, template, options } = job.data;
    await sendMailTemplate(to, subject, template, options);
  },
  "send-email-notification": async (job: Job) => {
    const { to, subject, template, options } = job.data;
    await sendMailTemplate(to, subject, template, options);
  },
  "digest-followed-jobs": async (_job: Job) => {
    await emailDigestService.runFollowedCompaniesJobsDigest();
  },
  "digest-recommended-jobs": async (_job: Job) => {
    await emailDigestService.runRecommendedJobsDigest();
  },
  "digest-employer-applications": async (_job: Job) => {
    await emailDigestService.runEmployerNewApplicationsDigest();
  },
};

export const emailWorker = createWorkerWithHandlers(
  "EMAIL_QUEUE",
  emailHandlers,
);
