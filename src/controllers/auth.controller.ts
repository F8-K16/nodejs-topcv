import { randomBytes } from "node:crypto";
import { Request, Response } from "express";
import { env } from "../config/env";
import { authService } from "../services/auth.service";

const OAUTH_GOOGLE_STATE_COOKIE = "oauth_google_state";

export const authController = {
  async register(req: Request, res: Response) {
    const user = await authService.register(req.body);
    return res.status(201).json({
      success: true,
      message: "Đăng ký tài khoản thành công",
      data: user,
    });
  },
  async verifyEmail(req: Request, res: Response) {
    const { email, code } = req.body;
    const data = await authService.verifyEmail(email, code);
    return res.json({
      success: true,
      message: "Xác thực email thành công",
      data,
    });
  },
  async resendVerification(req: Request, res: Response) {
    const { email } = req.body;
    await authService.resendVerification(email);
    return res.json({
      message: "Mã xác thực đã được gửi thành công",
    });
  },
  async login(req: Request, res: Response) {
    const { email, password } = req.body;
    const data = await authService.login(email, password);

    return res.json({
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
    });
  },

  googleRedirect(_req: Request, res: Response) {
    if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CALLBACK_URI) {
      return res.status(503).json({
        code: "GOOGLE_OAUTH_NOT_CONFIGURED",
        message: "Đăng nhập Google chưa được cấu hình trên server",
      });
    }
    const state = randomBytes(32).toString("hex");
    res.cookie(OAUTH_GOOGLE_STATE_COOKIE, state, {
      httpOnly: true,
      sameSite: "lax",
      secure: env.NODE_ENV === "production",
      maxAge: 10 * 60 * 1000,
      path: "/",
    });
    const q = new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      redirect_uri: env.GOOGLE_CALLBACK_URI,
      response_type: "code",
      scope: "openid email profile",
      access_type: "offline",
      prompt: "consent",
      state,
    });
    return res.redirect(
      `https://accounts.google.com/o/oauth2/v2/auth?${q.toString()}`,
    );
  },

  googleCallback(req: Request, res: Response) {
    const base = env.FRONTEND_URL.replace(/\/$/, "");
    const oauthError = req.query.error;
    if (typeof oauthError === "string" && oauthError) {
      res.clearCookie(OAUTH_GOOGLE_STATE_COOKIE, { path: "/" });
      return res.redirect(
        `${base}/auth/login?error=${encodeURIComponent(`oauth_${oauthError}`)}`,
      );
    }

    const code = req.query.code;
    const state = req.query.state;
    const stored = req.cookies?.[OAUTH_GOOGLE_STATE_COOKIE] as
      | string
      | undefined;
    res.clearCookie(OAUTH_GOOGLE_STATE_COOKIE, { path: "/" });

    if (
      typeof code !== "string" ||
      !code ||
      typeof state !== "string" ||
      !state ||
      !stored ||
      state !== stored
    ) {
      return res.redirect(`${base}/auth/login?error=oauth_invalid_state`);
    }

    return res.redirect(`${base}/auth/login?code=${encodeURIComponent(code)}`);
  },

  async googleLogin(req: Request, res: Response) {
    const data = await authService.loginWithGoogleProfile(req.body);
    return res.json({
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
      user: data.user,
    });
  },
  async profile(req: Request, res: Response) {
    return res.json({
      success: true,
      message: "Lấy thông tin user thành công",
      data: req.user,
    });
  },
  async updateProfile(req: Request, res: Response) {
    const user = req.user;
    const payload = req.body;
    const result = await authService.updateProfile(user!.id, payload);
    return res.json({
      success: true,
      message: "Cập nhật thông tin thành công",
      data: result.data,
    });
  },
  async changePassword(req: Request, res: Response) {
    const { oldPassword, newPassword } = req.body;
    await authService.changePassword(req.user!.id, oldPassword, newPassword);
    return res.json({
      success: true,
      message: "Đổi mật khẩu thành công",
    });
  },
  async forgotPassword(req: Request, res: Response) {
    const { email } = req.body;
    await authService.forgotPassword(email);
    return res.status(200).json({
      message: "Mã xác thực đã được gửi thành công",
    });
  },
  async resetPassword(req: Request, res: Response) {
    const { email, code, newPassword } = req.body;
    await authService.resetPassword(email, code, newPassword);
    return res.status(200).json({
      message: "Tạo lại mật khẩu thành công",
    });
  },
  async resendResetVerification(req: Request, res: Response) {
    const { email } = req.body;
    await authService.resendResetOtp(email);
    return res.status(200).json({
      message: "Mã xác thực đã được gửi thành công",
    });
  },
  logout: async (req: Request, res: Response) => {
    const { refreshToken } = req.body;

    await authService.logout(
      req.tokenJti!,
      req.tokenExp!,
      refreshToken,
      req.user!.id,
    );
    return res.json({
      message: "Logout device thành công",
    });
  },

  // logoutDevice: async (req: Request, res: Response) => {
  //   const deviceId = req.cookies.deviceId;
  //   const refreshToken = req.cookies.refreshToken;
  //   await authService.logoutDevice(deviceId, req.user!.id, refreshToken);
  //   return res.json({
  //     message: "Logout device thành công",
  //   });
  // },
  // logoutAllDeviceByUser: async (req: Request, res: Response) => {
  //   await authService.logoutAllDeviceByUser(req.user!.id);
  //   return res.json({});
  // },
  async refreshToken(req: Request, res: Response) {
    const { refreshToken } = req.body;
    const newToken = await authService.refreshToken(refreshToken);

    return res.json({
      message: "Refresh token thành công",
      data: newToken,
    });
  },
};
