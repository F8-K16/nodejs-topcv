import { Request, Response } from "express";

import { accessControlService } from "../services/access_control.service";

export const accessControlController = {
  listPermissions: async (_req: Request, res: Response) => {
    const data = await accessControlService.listPermissionsGrouped();
    res.json(data);
  },

  listRoles: async (req: Request, res: Response) => {
    const data = await accessControlService.listRoles(req.query as Record<string, string>);
    res.json(data);
  },

  showRole: async (req: Request, res: Response) => {
    const data = await accessControlService.getRoleDetail(Number(req.params.id));
    res.json(data);
  },

  createRole: async (req: Request, res: Response) => {
    const data = await accessControlService.createRole(req.body);
    res.status(201).json(data);
  },

  updateRole: async (req: Request, res: Response) => {
    const data = await accessControlService.updateRole(
      Number(req.params.id),
      req.body,
    );
    res.json(data);
  },

  deleteRole: async (req: Request, res: Response) => {
    const data = await accessControlService.deleteRole(Number(req.params.id));
    res.json(data);
  },

  restoreRole: async (req: Request, res: Response) => {
    const data = await accessControlService.restoreRole(Number(req.params.id));
    res.json(data);
  },
};
