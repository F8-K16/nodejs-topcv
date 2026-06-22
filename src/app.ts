import http from "http";
import express, { NextFunction, Request, Response } from "express";
import "dotenv/config";
import path from "path";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";

import expressLayouts from "express-ejs-layouts";
import indexRoute from "./routes/index.route";
import { errorHandlingMiddleware } from "./middlewares/errorHandling.middleware";
import methodOverride from "method-override";
import { requestIdMiddleware } from "./middlewares/requestId.middleware";
import { requestTimingMiddleware } from "./middlewares/requestTiming.middleware";
import { env } from "./config/env";
import { initRedis } from "./utils/redis";
import { prisma } from "./utils/prisma";
import { logger } from "./utils/logger";
import { initSocketIo } from "./socket/chat.socket";
import { sendError } from "./utils/response";

const PORT = env.PORT || 3000;
const app = express();
const allowedOrigins = env.ALLOWED_ORIGINS.split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(requestIdMiddleware);
app.use(requestTimingMiddleware);
app.use(helmet());
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));
app.use(methodOverride("_method"));

app.use((req: Request, res: Response, next: NextFunction) => {
  const origin = req.headers.origin;
  if (!origin) {
    return next();
  }
  if (allowedOrigins.includes(origin)) {
    return next();
  }
  return sendError(res, 403, {
    code: "CORS_NOT_ALLOWED",
    message: "CORS not allowed",
    traceId: req.requestId,
  });
});

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
  }),
);
app.use(cookieParser());

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(expressLayouts);
app.set("layout", "layouts/admin");
app.use(express.static(path.join(__dirname, "..", "public")));

app.use("/api", indexRoute);
app.use(errorHandlingMiddleware);

const startServer = async () => {
  await prisma.$connect();
  await initRedis();

  const httpServer = http.createServer(app);
  initSocketIo(httpServer, allowedOrigins);

  httpServer.listen(PORT, () => {
    logger.info("Server started", { port: PORT });
  });
};

startServer().catch((err) => {
  logger.error("Failed to start server", { error: err });
  process.exit(1);
});
