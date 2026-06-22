import { Request, Response } from "express";
import { categoryParentService } from "../services/category.service";

export const categoryParentController = {
  create: async (req: Request, res: Response) => {
    const { name, slug } = req.body;
    const row = await categoryParentService.create({ name, slug });
    res.status(201).json(row);
  },

  findAll: async (req: Request, res: Response) => {
    const { page, search, all } = req.query;
    const data = await categoryParentService.getAll({
      page: Number(page) || 1,
      search: search as string,
      all: all === "true" || all === "1",
    });
    res.json(data);
  },

  findOne: async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    const row = await categoryParentService.findById(id);
    res.json(row);
  },

  update: async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    const { name, slug } = req.body;
    const row = await categoryParentService.update(id, { name, slug });
    res.json(row);
  },

  delete: async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    await categoryParentService.delete(id);
    res.json({ message: "Xóa thành công" });
  },

  restore: async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    const row = await categoryParentService.restore(id);
    res.json({ message: "Khôi phục thành công", categoryParent: row });
  },
};
