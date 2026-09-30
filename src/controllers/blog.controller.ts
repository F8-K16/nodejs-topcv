import { Request, Response } from "express";
import { blogService } from "../services/blog.service";

export const blogController = {
  listPublic: async (req: Request, res: Response) => {
    const data = await blogService.listPublic(req.query);
    res.json(data);
  },

  showPublic: async (req: Request, res: Response) => {
    const data = await blogService.getPublicBySlug(String(req.params.slug ?? ""));
    res.json({ post: data });
  },

  index: async (req: Request, res: Response) => {
    const data = await blogService.listAdmin(req.query);
    res.json(data);
  },

  show: async (req: Request, res: Response) => {
    const data = await blogService.getAdminById(Number(req.params.id));
    res.json({ post: data });
  },

  store: async (req: Request, res: Response) => {
    const post = await blogService.create(req.user!.id, req.body);
    res.status(201).json({ post });
  },

  update: async (req: Request, res: Response) => {
    const post = await blogService.update(Number(req.params.id), req.body);
    res.json({ post });
  },

  destroy: async (req: Request, res: Response) => {
    await blogService.remove(Number(req.params.id));
    res.json({ success: true, message: "Đã xóa bài viết" });
  },
};
