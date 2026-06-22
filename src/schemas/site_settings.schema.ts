import { z } from "zod";

export const updateSiteSettingsSchema = z.object({
  siteName: z.string().trim().min(1).max(200).optional(),
  logoUrl: z.string().max(500).optional().nullable(),
  bannerUrl: z.string().max(500).optional().nullable(),
  seoTitle: z.string().max(200).optional().nullable(),
  seoDescription: z.string().max(2000).optional().nullable(),
  maintenanceMode: z.boolean().optional(),
  smtpHost: z.string().max(200).optional().nullable(),
  smtpPort: z.number().int().min(1).max(65535).optional().nullable(),
  smtpUser: z.string().max(200).optional().nullable(),
  smtpPass: z.string().max(200).optional().nullable(),
  smtpFrom: z.string().max(200).optional().nullable(),
});
