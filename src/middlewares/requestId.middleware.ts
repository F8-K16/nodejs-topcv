import { NextFunction, Request, Response } from "express";
import { requestContext } from "../utils/request-context";

export const requestIdMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const requestId = req.get("x-request-id") || crypto.randomUUID();
  req.requestId = requestId;
  res.setHeader("x-request-id", requestId);
  requestContext.run({ traceId: requestId }, () => {
    next();
  });
};
