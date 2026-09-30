import { Request, Response } from "express";
import { contactService } from "../services/contact.service";

export const contactController = {
  submit: async (req: Request, res: Response) => {
    await contactService.submit(req.body);
    res.status(201).json({
      success: true,
      message: "Đã gửi liên hệ. Chúng tôi sẽ phản hồi qua email.",
    });
  },

  index: async (req: Request, res: Response) => {
    const data = await contactService.listAdmin(req.query);
    res.json(data);
  },
};
