import { createClient } from "redis";
import { env } from "../config/env";
import { logger } from "./logger";

export const redisClient = createClient({
  url: env.REDIS_URL,
});

redisClient.on("error", (err) => {
  logger.error("Redis client error", { error: err });
});

let connecting: Promise<typeof redisClient> | null = null;

export const initRedis = async () => {
  if (redisClient.isReady) {
    return redisClient;
  }
  if (connecting) {
    return connecting;
  }
  connecting = (async () => {
    if (!redisClient.isOpen) {
      await redisClient.connect();
    }
    return redisClient;
  })();

  try {
    const client = await connecting;
    return client;
  } catch (err) {
    connecting = null;
    throw err;
  }
};

export const closeRedis = async () => {
  if (redisClient.isOpen) {
    await redisClient.quit();
  }
};
