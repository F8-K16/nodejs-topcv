/* eslint-disable no-unused-vars */
import { ConnectionOptions, Job, Queue, Worker } from "bullmq";
import IORedis from "ioredis";
import { env } from "../config/env";

const connectionQueue = new IORedis(env.REDIS_URL, {
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
});

const connectionWorker = new IORedis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: true,
});

export const bullMq = {
  createQueue: (name: string) => {
    const queue = new Queue(name, {
      connection: connectionQueue as ConnectionOptions,
      defaultJobOptions: {
        removeOnComplete: true,
        removeOnFail: true,
      },
    });
    return queue;
  },
  createWorker: (name: string, callback: (job: Job) => Promise<unknown>) => {
    return new Worker(name, callback, {
      connection: connectionWorker as ConnectionOptions,
    });
  },
};
