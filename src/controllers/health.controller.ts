import { Request, Response } from "express";
import { prisma } from "../utils/prisma";
import { redisClient } from "../utils/redis";

export const healthController = {
  live: (_req: Request, res: Response) => {
    return res.status(200).json({
      status: "ok",
      service: "backend",
    });
  },
  ready: async (_req: Request, res: Response) => {
    let db = false;
    let redis = false;

    try {
      await prisma.$queryRawUnsafe("SELECT 1");
      db = true;
    } catch {
      db = false;
    }

    try {
      if (redisClient.isReady) {
        const ping = redisClient.ping();
        const timeout = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error("Redis ping timeout")), 800);
        });
        await Promise.race([ping, timeout]);
        redis = true;
      } else {
        redis = false;
      }
    } catch {
      redis = false;
    }

    const ready = db && redis;
    return res.status(ready ? 200 : 503).json({
      status: ready ? "ready" : "not_ready",
      checks: { db, redis },
    });
  },
};
