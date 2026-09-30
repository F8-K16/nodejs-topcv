import { z } from "zod";

export const createBlogPostSchema = z.object({
  title: z.string().trim().min(4).max(200),
  excerpt: z.string().trim().min(8).max(500),
  content: z.string().trim().min(20).max(50_000),
  coverUrl: z.string().trim().max(500).optional(),
  slug: z.string().trim().max(180).optional(),
  published: z.boolean().optional(),
});

export const updateBlogPostSchema = createBlogPostSchema;

export const contactMessageSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(160),
  subject: z.string().trim().min(4).max(200),
  message: z.string().trim().min(10).max(4000),
  website: z.string().max(200).optional(),
});
