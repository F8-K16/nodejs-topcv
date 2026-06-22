import { Response } from "express";

type ErrorPayload = {
  code: string;
  message: string;
  details?: unknown | undefined;
  traceId?: string | undefined;
};

export const sendError = (
  res: Response,
  status: number,
  payload: ErrorPayload,
) => {
  return res.status(status).json(payload);
};
