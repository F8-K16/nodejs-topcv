import { NextFunction, Request, Response } from "express";

import { env } from "../config/env";
import { logger } from "../utils/logger";

export const requestTimingMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const start = process.hrtime.bigint();
  res.on("finish", () => {
    const end = process.hrtime.bigint();
    const durationMs = Number(end - start) / 1_000_000;
    const method = req.method;
    const path = req.originalUrl || req.url;
    const status = res.statusCode;
    const trace = req.requestId;

    if (env.LOG_HTTP_REQUESTS) {
      logger.info("http.request", {
        method,
        path,
        status,
        durationMs: Math.round(durationMs * 10) / 10,
        traceId: trace,
      });
    } else if (env.SLOW_REQUEST_MS > 0 && durationMs >= env.SLOW_REQUEST_MS) {
      logger.warn("http.slow", {
        method,
        path,
        status,
        durationMs: Math.round(durationMs * 10) / 10,
        traceId: trace,
      });
    }
  });
  next();
};
