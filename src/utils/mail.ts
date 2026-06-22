import nodemailer from "nodemailer";
import SMTPTransport from "nodemailer/lib/smtp-transport";
import ejs from "ejs";
import path from "node:path";
import fs from "node:fs/promises";
import { env } from "../config/env";

const DEFAULT_PUBLIC_SITE_URL = "https://nextcv.io.vn";

function getPublicSiteUrl(): string {
  const raw = String(env.FRONTEND_URL ?? "").trim();
  if (!raw) return DEFAULT_PUBLIC_SITE_URL;
  return raw.replace(/\/$/, "");
}

let transporterInstance: nodemailer.Transporter<
  SMTPTransport.SentMessageInfo,
  SMTPTransport.Options
> | null = null;

export const mailTransporter = () => {
  if (!transporterInstance) {
    transporterInstance = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465, // use STARTTLS (upgrade connection to TLS after connecting)
      auth: {
        user: env.SMTP_USERNAME,
        pass: env.SMTP_PASSWORD,
      },
    });
  }
  return transporterInstance;
};

export const sendMail = async (
  to: string,
  subject: string,
  message: string,
) => {
  const transporter = mailTransporter();
  const info = await transporter.sendMail({
    from: `"${env.SMTP_FROM_NAME}" <${env.SMTP_FROM}>`,
    to,
    subject,
    html: message,
  });
  return info;
};

export const sendMailTemplate = async <T>(
  to: string,
  subject: string,
  template: string,
  data: T = {} as T,
) => {
  const templateFile = `${template}.ejs`;
  const candidates = [
    path.join(__dirname, "..", "templates", templateFile),
    path.join(process.cwd(), "src", "templates", templateFile),
  ];

  let templatePath: string | null = null;
  for (const candidatePath of candidates) {
    try {
      await fs.access(candidatePath);
      templatePath = candidatePath;
      break;
    } catch {
      continue;
    }
  }

  if (!templatePath) {
    throw new Error(`Email template not found: ${templateFile}`);
  }

  const templatesRoot = path.join(__dirname, "..", "templates");
  const siteUrl = getPublicSiteUrl();
  const merged = {
    appName: "TopCV",
    siteUrl,
    loginUrl: `${siteUrl}/auth/login`,
    signupUrl: `${siteUrl}/auth/sign-up`,
    verifyEmailUrl: `${siteUrl}/auth/verify-email`,
    forgotPasswordUrl: `${siteUrl}/auth/forgot-password`,
    resetPasswordUrl: `${siteUrl}/auth/reset-password`,
    pendingApprovalUrl: `${siteUrl}/auth/pending-approval`,
    jobsUrl: `${siteUrl}/jobs`,
    employerPortalUrl: `${siteUrl}/employer`,
    employerApplicationsUrl: `${siteUrl}/employer/applications`,
    ...data,
  };

  const html = await ejs.renderFile(templatePath, merged, {
    views: [templatesRoot],
  });
  return sendMail(to, subject, html);
};
