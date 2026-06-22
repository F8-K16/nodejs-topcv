import rateLimit from "express-rate-limit";

export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    code: "TOO_MANY_REQUESTS",
    message: "Too many requests, please try again later.",
  },
});

export const loginRateLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    code: "AUTH_RATE_LIMITED",
    message: "Too many login attempts, please try again later.",
  },
});

export const tokenRateLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 30,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    code: "AUTH_RATE_LIMITED",
    message: "Too many token operations, please try again later.",
  },
});

export const aiRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 15,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    code: "AI_RATE_LIMITED",
    message: "Bạn gọi AI hơi nhanh. Vui lòng đợi khoảng một phút rồi thử lại.",
  },
});
