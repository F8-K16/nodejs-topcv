import { NextFunction, Request, Response } from "express";
import { authService } from "../services/auth.service";
import { sendError } from "../utils/response";

export const authMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const authHeader = req.get("Authorization");
  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.split(" ")[1]
    : undefined;

  if (!token) {
    return sendError(res, 401, {
      code: "UNAUTHORIZED",
      message: "Missing bearer token",
      traceId: req.requestId,
    });
  }

  try {
    const { user, decoded } = await authService.profile(token);
    if (user) {
      req.user = user;
    }
    if (decoded) {
      req.tokenJti = decoded.jti as string;
      req.tokenExp = decoded.exp as number;
    }
    next();
  } catch {
    return sendError(res, 401, {
      code: "UNAUTHORIZED",
      message: "Unauthorized",
      traceId: req.requestId,
    });
  }
};

export const requirePermission = (permission: string) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = req.user;
    if (!user) {
      return sendError(res, 401, {
        code: "UNAUTHORIZED",
        message: "Unauthorized",
        traceId: req.requestId,
      });
    }

    if (user.roles.includes("ADMIN")) {
      return next();
    }

    if (!user.permissions.includes(permission)) {
      return sendError(res, 403, {
        code: "FORBIDDEN",
        message: "Forbidden",
        traceId: req.requestId,
      });
    }
    next();
  };
};

export const requireRole = (...roles: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return sendError(res, 401, {
        code: "UNAUTHORIZED",
        message: "Unauthorized",
        traceId: req.requestId,
      });
    }

    const hasRole = req.user.roles.some((r) => roles.includes(r));

    if (!hasRole) {
      return sendError(res, 403, {
        code: "FORBIDDEN",
        message: "Forbidden",
        traceId: req.requestId,
      });
    }

    next();
  };
};
