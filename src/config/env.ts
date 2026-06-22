import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  LOG_HTTP_REQUESTS: z.coerce.boolean().default(false),
  SLOW_REQUEST_MS: z.coerce.number().int().min(0).default(0),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  REDIS_URL: z.string().min(1, "REDIS_URL is required"),
  CACHE_ENABLED: z.coerce.boolean().default(true),
  CACHE_TTL_DASHBOARD_SEC: z.coerce.number().int().positive().default(90),
  CACHE_TTL_JOBS_PUBLIC_SEC: z.coerce.number().int().positive().default(240),
  /**
   * @deprecated
   */
  CACHE_TTL_JOBS_PUBLIC_CONSTANTS_SEC: z.coerce
    .number()
    .int()
    .positive()
    .default(3600),

  CACHE_DEBUG: z.coerce.boolean().default(false),
  /**
   * @deprecated
   */
  CACHE_TTL_SKILLS_LIST_SEC: z.coerce.number().int().positive().default(600),
  /**
   * @deprecated
   */
  CACHE_TTL_SITE_SETTINGS_SEC: z.coerce.number().int().positive().default(300),
  /**
   * @deprecated
   */
  CACHE_TTL_METADATA_SEC: z.coerce.number().int().positive().default(450),
  /**
   * @deprecated
   */
  CACHE_TTL_LOCATION_SEC: z.coerce.number().int().positive().default(1200),

  CACHE_TTL_COMPANIES_PUBLIC_SEC: z.coerce
    .number()
    .int()
    .positive()
    .default(180),

  CACHE_TTL_COMPANY_PUBLIC_DETAIL_SEC: z.coerce
    .number()
    .int()
    .positive()
    .default(120),

  CACHE_TTL_TOP_HIRING_SEC: z.coerce.number().int().positive().default(240),

  CACHE_TTL_JOB_DETAIL_PUBLIC_SEC: z.coerce
    .number()
    .int()
    .positive()
    .default(120),

  CACHE_TTL_JOBS_RECOMMENDED_SEC: z.coerce
    .number()
    .int()
    .positive()
    .default(120),

  JOBS_RECOMMENDED_POOL_SIZE: z.coerce
    .number()
    .int()
    .min(30)
    .max(300)
    .default(80),
  ALLOWED_ORIGINS: z.string().default("http://localhost:3001"),
  PRISMA_LOG_QUERY: z.coerce.boolean().default(false),

  AUTH_USER_CACHE_TTL_SEC: z.coerce.number().int().min(0).max(600).default(60),
  JWT_ACCESS_SECRET: z.string().min(32, "JWT_ACCESS_SECRET is too short"),
  JWT_ACCESS_EXPIRED: z.string().min(1, "JWT_ACCESS_EXPIRED is required"),
  JWT_REFRESH_SECRET: z.string().min(32, "JWT_REFRESH_SECRET is too short"),
  JWT_REFRESH_EXPIRED: z.string().min(1, "JWT_REFRESH_EXPIRED is required"),
  SMTP_HOST: z.string().min(1, "SMTP_HOST is required"),
  SMTP_PORT: z.coerce.number().int().positive("SMTP_PORT must be positive"),
  SMTP_USERNAME: z.string().min(1, "SMTP_USERNAME is required"),
  SMTP_PASSWORD: z.string().min(1, "SMTP_PASSWORD is required"),
  SMTP_FROM: z.string().min(1, "SMTP_FROM is required"),
  SMTP_FROM_NAME: z.string().min(1, "SMTP_FROM_NAME is required"),

  NOTIFICATION_PURGE_ENABLED: z.coerce.boolean().default(true),

  NOTIFICATION_PURGE_INTERVAL_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(86_400_000),

  NOTIFICATION_DELETE_READ_DAYS: z.coerce.number().int().positive().default(90),

  NOTIFICATION_DELETE_MAX_AGE_DAYS: z.coerce
    .number()
    .int()
    .positive()
    .default(730),

  GOOGLE_CLIENT_ID: z.string().default(""),
  GOOGLE_CLIENT_SECRET: z.string().default(""),
  GOOGLE_CALLBACK_URI: z.string().default(""),
  FRONTEND_URL: z.string().default("https://nextcv.io.vn"),

  DIGEST_EMAIL_ENABLED: z.preprocess((val) => {
    if (val === undefined || val === null || val === "") return true;
    if (typeof val === "boolean") return val;
    const s = String(val).trim().toLowerCase();
    if (["false", "0", "no", "off"].includes(s)) return false;
    return true;
  }, z.boolean()),

  OPENSEARCH_ENABLED: z.coerce.boolean().default(false),
  OPENSEARCH_NODE: z.string().default("http://localhost:9200"),
  OPENSEARCH_USERNAME: z.string().default(""),
  OPENSEARCH_PASSWORD: z.string().default(""),
  OPENSEARCH_JOBS_INDEX: z.string().default("jp_jobs_v1"),
  OPENSEARCH_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
  OPENSEARCH_TLS_REJECT_UNAUTHORIZED: z.coerce.boolean().default(true),

  AI_ENABLED: z.coerce.boolean().default(false),
  GEMINI_API_KEY: z.string().default(""),
  GEMINI_BASE_URL: z
    .string()
    .default("https://generativelanguage.googleapis.com/v1beta"),
  GEMINI_MODEL: z.string().default("gemini-2.5-flash-lite"),
  CACHE_TTL_AI_CV_SUGGEST_SEC: z.coerce.number().int().positive().default(86_400),
  CACHE_TTL_AI_RESUME_EXTRACT_SEC: z.coerce
    .number()
    .int()
    .positive()
    .default(604_800),

  CLOUDINARY_CLOUD_NAME: z.string().default(""),
  NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME: z.string().default(""),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const errors = parsed.error.issues
    .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
    .join("; ");
  throw new Error(`Invalid environment configuration: ${errors}`);
}

export const env = parsed.data;
