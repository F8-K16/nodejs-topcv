import { Request, Response } from "express";
import { categoryService } from "../services/category.service";

export const categoryController = {
  create: async (req: Request, res: Response) => {
    const { name, slug, parentCategoryId } = req.body;
    const category = await categoryService.create({ name, slug, parentCategoryId });
    res.status(201).json(category);
  },

  findAll: async (req: Request, res: Response) => {
    const { page, search, all, parentCategoryId } = req.query;
    const parentCategoryIdVal =
      parentCategoryId === undefined ||
      parentCategoryId === null ||
      String(parentCategoryId) === ""
        ? undefined
        : Number(parentCategoryId);
    const parentCategoryIdSafe =
      parentCategoryIdVal !== undefined && Number.isFinite(parentCategoryIdVal)
        ? parentCategoryIdVal
        : undefined;
    const data = await categoryService.getAll({
      page: Number(page) || 1,
      search: search as string,
      all: all === "true" || all === "1",
      ...(parentCategoryIdSafe !== undefined
        ? { parentCategoryId: parentCategoryIdSafe }
        : {}),
    });

    res.json(data);
  },

  findOne: async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    const category = await categoryService.findById(id);
    res.json(category);
  },

  update: async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    const { name, slug, parentCategoryId } = req.body;
    const category = await categoryService.update(id, {
      name,
      slug,
      parentCategoryId,
    });

    res.json(category);
  },

  delete: async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    await categoryService.delete(id);
    res.json({ message: "Xóa thành công" });
  },

  restore: async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    const category = await categoryService.restore(id);
    res.json({ message: "Khôi phục thành công", category });
  },

  getByCompany: async (req: Request, res: Response) => {
    const companyId = Number(req.params.id);
    const data = await categoryService.getCategoriesByCompany(companyId);
    res.json(data);
  },
};
