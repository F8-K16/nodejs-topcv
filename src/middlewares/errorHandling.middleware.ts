import { NextFunction, Request, Response } from "express";
import { HttpException } from "../utils/exception";
import { logger } from "../utils/logger";
import { sendError } from "../utils/response";

export const errorHandlingMiddleware = (
  err: HttpException | Error,
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  if (res.headersSent) {
    return next(err);
  }

  const status = err instanceof HttpException ? err.status : 500;
  const code = err instanceof HttpException ? err.code : "INTERNAL_ERROR";
  const details = err instanceof HttpException ? err.details : undefined;

  const isServerError = status >= 500;
  const message =
    err instanceof HttpException
      ? err.message || "Server Error"
      : isServerError
        ? "Internal Server Error"
        : err.message || "Server Error";

  if (isServerError) {
    logger.error("Unhandled error", {
      method: req.method,
      path: req.originalUrl,
      status,
      code,
      errorName: err.name,
      errorMessage: err.message,
      stack: err.stack,
    });
  } else {
    logger.warn("Request error", {
      method: req.method,
      path: req.originalUrl,
      status,
      code,
      errorName: err.name,
      errorMessage: err.message,
    });
  }

  return sendError(res, status, {
    code,
    message,
    details,
    traceId: req.requestId,
  });
};
