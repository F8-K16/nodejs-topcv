import { requestContext } from "./request-context";
import { env } from "../config/env";

type LogLevel = "debug" | "info" | "warn" | "error";

type LogMeta = Record<string, unknown> | undefined;

const levels: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const minLevel = env.LOG_LEVEL as LogLevel;

const shouldLog = (level: LogLevel) => {
  return levels[level] >= levels[minLevel];
};

const write = (level: LogLevel, message: string, meta?: LogMeta) => {
  if (!shouldLog(level)) {
    return;
  }

  const payload: Record<string, unknown> = {
    level,
    message,
    timestamp: new Date().toISOString(),
    traceId: requestContext.getTraceId(),
  };

  if (meta && Object.keys(meta).length > 0) {
    payload.meta = meta;
  }

  const line = JSON.stringify(payload);
  if (level === "error") {
    process.stderr.write(`${line}\n`);
    return;
  }
  process.stdout.write(`${line}\n`);
};

export const logger = {
  debug: (message: string, meta?: LogMeta) => write("debug", message, meta),
  info: (message: string, meta?: LogMeta) => write("info", message, meta),
  warn: (message: string, meta?: LogMeta) => write("warn", message, meta),
  error: (message: string, meta?: LogMeta) => write("error", message, meta),
};
