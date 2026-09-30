import express from "express";
import { authController } from "../controllers/auth.controller";
import { validate } from "../middlewares/validate.middleware";
import {
  emailOnlySchema,
  googleOAuthCodeSchema,
  loginSchema,
  refreshTokenSchema,
  registerSchema,
  resetPasswordSchema,
  twoFactorCodeSchema,
  twoFactorDisableSchema,
  twoFactorVerifySchema,
  verifyEmailSchema,
} from "../schemas/auth.schema";
import { authMiddleware } from "../middlewares/auth.middleware";
import {
  authRateLimiter,
  loginRateLimiter,
  tokenRateLimiter,
} from "../middlewares/rateLimit.middleware";

const router = express.Router();

router.get("/google", authController.googleRedirect);
router.get("/google/callback", authController.googleCallback);
router.post(
  "/google/login",
  authRateLimiter,
  validate(googleOAuthCodeSchema),
  authController.googleLogin,
);

router.post(
  "/register",
  authRateLimiter,
  validate(registerSchema),
  authController.register,
);
router.post(
  "/verify-email",
  authRateLimiter,
  validate(verifyEmailSchema),
  authController.verifyEmail,
);
router.post(
  "/resend-verification",
  authRateLimiter,
  validate(emailOnlySchema),
  authController.resendVerification,
);
router.post(
  "/forgot-password",
  authRateLimiter,
  validate(emailOnlySchema),
  authController.forgotPassword,
);
router.post(
  "/reset-password",
  authRateLimiter,
  validate(resetPasswordSchema),
  authController.resetPassword,
);
router.post(
  "/resend-reset-otp",
  authRateLimiter,
  validate(emailOnlySchema),
  authController.resendResetVerification,
);
router.post("/login", loginRateLimiter, validate(loginSchema), authController.login);
router.post(
  "/2fa/verify",
  loginRateLimiter,
  validate(twoFactorVerifySchema),
  authController.verifyAdminTotp,
);
router.post(
  "/2fa/setup",
  authMiddleware,
  authController.setupAdminTotp,
);
router.post(
  "/2fa/enable",
  authMiddleware,
  validate(twoFactorCodeSchema),
  authController.enableAdminTotp,
);
router.post(
  "/2fa/disable",
  authMiddleware,
  validate(twoFactorDisableSchema),
  authController.disableAdminTotp,
);

router.post(
  "/refresh-token",
  tokenRateLimiter,
  validate(refreshTokenSchema),
  authController.refreshToken,
);
router.post(
  "/logout",
  tokenRateLimiter,
  authMiddleware,
  validate(refreshTokenSchema),
  authController.logout,
);

export default router;
