import { Request, Response } from "express";
import { locationService } from "../services/location.service";

export const locationAdminController = {
  listProvinces: async (req: Request, res: Response) => {
    const data = await locationService.listProvincesAdmin(req.query);
    res.json(data);
  },

  createProvince: async (req: Request, res: Response) => {
    const row = await locationService.createProvince(req.body);
    res.status(201).json(row);
  },

  updateProvince: async (req: Request, res: Response) => {
    const row = await locationService.updateProvince(
      Number(req.params.id),
      req.body,
    );
    res.json(row);
  },

  deleteProvince: async (req: Request, res: Response) => {
    await locationService.deleteProvince(Number(req.params.id));
    res.json({ success: true, message: "Đã xóa tỉnh/thành" });
  },

  restoreProvince: async (req: Request, res: Response) => {
    const row = await locationService.restoreProvince(Number(req.params.id));
    res.json({ success: true, message: "Đã khôi phục tỉnh/thành", province: row });
  },

  listDistricts: async (req: Request, res: Response) => {
    const data = await locationService.listDistrictsAdmin(
      Number(req.params.provinceId),
    );
    res.json(data);
  },

  createDistrict: async (req: Request, res: Response) => {
    const row = await locationService.createDistrict(req.body);
    res.status(201).json(row);
  },

  updateDistrict: async (req: Request, res: Response) => {
    const row = await locationService.updateDistrict(
      Number(req.params.id),
      req.body,
    );
    res.json(row);
  },

  deleteDistrict: async (req: Request, res: Response) => {
    await locationService.deleteDistrict(Number(req.params.id));
    res.json({ success: true, message: "Đã xóa quận/huyện" });
  },

  restoreDistrict: async (req: Request, res: Response) => {
    const row = await locationService.restoreDistrict(Number(req.params.id));
    res.json({ success: true, message: "Đã khôi phục quận/huyện", district: row });
  },
};
