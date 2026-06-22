import { Request, Response } from "express";
import { roleService } from "../services/role.service";
import { userService } from "../services/user.service";
import { auditService } from "../services/audit.service";

export const userController = {
  index: async (req: Request, res: Response) => {
    const result = await userService.getUsers(req.query);
    const roles = await roleService.getRoles();
    res.json({
      users: result.users,
      pagination: result.pagination,
      query: req.query,
      roles,
    });
  },
  show: async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    const user = await userService.getUserById(id);
    if (!user) {
      return res.status(404).json({ message: "Không tìm thấy người dùng" });
    }
    res.json(user);
  },

  store: async (req: Request, res: Response) => {
    const { email, username, password, phone, roles } = req.body;
    const roleIds = await roleService.resolveRoleIds(roles);

    const user = await userService.createUser(
      { email, username, password, phone },
      roleIds,
    );
    await auditService.log(req, {
      action: "admin:users:create",
      entityType: "User",
      entityId: user.id,
      metadata: { roleIds },
    });

    return res.status(201).json({
      message: "Tạo tài khoản thành công",
      user,
    });
  },

  update: async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    const { email, username, password, phone, roles, isVerified, isBlocked } =
      req.body;
    const roleIds = await roleService.resolveRoleIds(roles);

    const user = await userService.updateUser(
      id,
      { email, username, phone, password, isVerified, isBlocked },
      roleIds,
    );
    await auditService.log(req, {
      action: "admin:users:update",
      entityType: "User",
      entityId: id,
      metadata: { roleIds },
    });

    return res.json({
      message: "Cập nhật tài khoản thành công",
      user,
    });
  },
  delete: async (req: Request, res: Response) => {
    const id = Number(req.params.id);

    await userService.deleteUser(id);
    await auditService.log(req, {
      action: "admin:users:delete",
      entityType: "User",
      entityId: id,
    });
    return res.json({
      message: "Xóa tài khoản thành công",
    });
  },

  restore: async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    const user = await userService.restoreUser(id);
    await auditService.log(req, {
      action: "admin:users:restore",
      entityType: "User",
      entityId: id,
    });
    return res.json({
      message: "Khôi phục tài khoản thành công",
      user,
    });
  },
};
