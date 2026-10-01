import { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { sendError } from "../utils/response";

export const validate =
  <T extends z.ZodTypeAny>(schema: T | ((req: Request) => T)) =>
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const finalSchema = typeof schema === "function" ? schema(req) : schema;
      const data = await finalSchema.parseAsync(req.body);

      req.body = data;
      next();
    } catch (err) {
      if (err instanceof z.ZodError) {
        const errors = err.flatten().fieldErrors;

        return sendError(res, 400, {
          code: "VALIDATION_ERROR",
          message: "Một số trường dữ liệu chưa hợp lệ",
          details: errors,
          traceId: req.requestId,
        });
      }
      next(err);
    }
  };
