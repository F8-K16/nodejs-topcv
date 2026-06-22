import { Request, Response } from "express";
import { locationService } from "../services/location.service";

export const locationController = {
  province: async (req: Request, res: Response) => {
    const data = await locationService.getProvinces();
    return res.json(data);
  },

  district: async (req: Request, res: Response) => {
    const provinceId = Number(req.params.id);
    const data = await locationService.getDistrictsByProvince(provinceId);
    return res.json(data);
  },
};
