import { JwtPayload } from "jsonwebtoken";

import { getOtpKeyLegacy, hashPassword, verifyPassword } from "../utils/hashing";
import QRCode from "qrcode";
import {
  createAccessToken,
  createRefreshToken,
  createTwoFactorChallengeToken,
  decodeToken,
  verifyAccessToken,
  verifyRefreshToken,
  verifyTwoFactorChallengeToken,
} from "../utils/jwt";
import {
  buildOtpauthUrl,
  generateTotpSecret,
  verifyTotp,
} from "../utils/totp";
import { userService } from "./user.service";
import { redisClient } from "../utils/redis";
import { HttpException } from "../utils/exception";
import { prisma, prismaTransaction } from "../utils/prisma";
import { emailQueue } from "../queues/email.queue";
import { generateOtp, getOtpKey, hashOtp } from "../utils/hashing";
import { RegisterDto } from "../types/auth.type";
import { employerService } from "./employer.service";
import { companyService } from "./company.service";
import {
  hashEmployerInviteToken,
  normalizeEmployerInviteEmail,
} from "./employer_invite.service";
import type { EmployerInviteRedisPayload } from "../utils/employer_invite_redis";
import {
  deleteEmployerInviteRedis,
  getEmployerInviteRedis,
  setEmployerInviteRedis,
} from "../utils/employer_invite_redis";
import { locationService } from "./location.service";
import { notificationService, NotificationType } from "./notification.service";
import { logger } from "../utils/logger";
import { env } from "../config/env";
import { roleService } from "./role.service";
import {
  authUserCacheKey,
  cacheGetJson,
  cacheSetJson,
  invalidateUserAuthDataCache,
} from "../utils/cache";
import {
  authBlacklistKey,
  authBlacklistKeyLegacy,
  authForgotPasswordKey,
  authForgotPasswordKeyLegacy,
  authPermissionsKey,
  authPermissionsKeyLegacy,
  authRefreshTokenKey,
  authRefreshTokenKeyLegacy,
  authResendResetKey,
  authResendResetKeyLegacy,
  authResendVerifyKey,
  authResendVerifyKeyLegacy,
} from "../utils/auth_redis_keys";

const GOOGLE_AVATAR_MAX_LENGTH = 512;

function normalizeGoogleAvatarUrl(raw: string | undefined): string | null {
  const value = raw?.trim() ?? "";
  if (!value || value.length > GOOGLE_AVATAR_MAX_LENGTH) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return null;
    const host = url.hostname.toLowerCase();
    if (
      host !== "googleusercontent.com" &&
      !host.endsWith(".googleusercontent.com")
    ) {
      return null;
    }
    return value;
  } catch {
    return null;
  }
}

function isGoogleHostedAvatar(raw: string | null | undefined): boolean {
  if (!raw) return false;
  try {
    const host = new URL(raw).hostname.toLowerCase();
    return (
      host === "googleusercontent.com" || host.endsWith(".googleusercontent.com")
    );
  } catch {
    return false;
  }
}

async function uniqueUsernameForUser(
  nameHint: string,
  userId: number,
): Promise<string> {
  const base = nameHint.replace(/\s+/g, " ").trim().slice(0, 30) || "user";
  let username = base;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const taken = await prisma.user.findFirst({
      where: { username, NOT: { id: userId } },
      select: { id: true },
    });
    if (!taken) return username;
    const suffix = ` ${attempt + 1}`;
    username = (base.slice(0, 30 - suffix.length) + suffix).slice(0, 30);
  }
  return base;
}

async function buildGoogleProfilePatch(
  user: {
    id: number;
    isVerified: boolean;
    avatar: string | null;
    username: string;
  },
  nameHint: string,
  googleAvatar: string | null,
) {
  const patch: {
    isVerified?: boolean;
    avatar?: string;
    username?: string;
  } = {};
  if (!user.isVerified) patch.isVerified = true;

  const avatarIsCustom = Boolean(user.avatar) && !isGoogleHostedAvatar(user.avatar);
  if (googleAvatar && !avatarIsCustom && user.avatar !== googleAvatar) {
    patch.avatar = googleAvatar;
  }
  if (nameHint && !avatarIsCustom) {
    const nextUsername = await uniqueUsernameForUser(nameHint, user.id);
    if (nextUsername !== user.username) patch.username = nextUsername;
  }
  return patch;
}

function asRedisUnavailable(e: unknown): HttpException {
  return new HttpException(
    "Hệ thống tạm thời bận, vui lòng thử lại",
    503,
    "REDIS_UNAVAILABLE",
    { error: String(e) },
  );
}

async function issueLoginSession(userId: number, roles: string[]) {
  const accessToken = createAccessToken({
    id: userId,
    roles,
  });
  const refreshToken = createRefreshToken({ id: userId });
  const decoded = decodeToken(refreshToken) as JwtPayload & {
    jti?: string;
    exp?: number;
  };
  if (!decoded.jti || !decoded.exp) {
    throw new HttpException(
      "Không tạo được phiên đăng nhập",
      500,
      "AUTH_SESSION_FAILED",
    );
  }
  const ttl = decoded.exp - Math.floor(Date.now() / 1000);
  try {
    await Promise.all([
      redisClient.setEx(authRefreshTokenKey(decoded.jti), ttl, userId.toString()),
      redisClient.setEx(
        authRefreshTokenKeyLegacy(decoded.jti),
        ttl,
        userId.toString(),
      ),
    ]);
  } catch (e) {
    throw asRedisUnavailable(e);
  }
  return { accessToken, refreshToken };
}

async function completeAuthenticatedLogin(
  user: { id: number; totpEnabled: boolean; totpSecret: string | null },
  roles: string[],
  publicUser?: object,
) {
  const isAdmin = roles.includes("ADMIN");
  if (isAdmin && user.totpEnabled && user.totpSecret) {
    return {
      twoFactorRequired: true as const,
      challengeToken: createTwoFactorChallengeToken(user.id),
    };
  }
  const session = await issueLoginSession(user.id, roles);
  return {
    twoFactorRequired: false as const,
    twoFactorSetupRequired: isAdmin && !user.totpEnabled,
    ...session,
    ...(publicUser ? { user: publicUser } : {}),
  };
}

export const authService = {
  async register(userData: RegisterDto) {
    const roleIds = await roleService.resolveRoleIds(userData.roles);

    const roles = await prisma.role.findMany({
      where: { id: { in: roleIds } },
      select: { name: true },
    });

    const roleNames = roles.map((r) => r.name);
    const isEmployer = roleNames.includes("EMPLOYER");
    const inviteRaw = userData.inviteToken?.trim();
    const withEmployerInvite = Boolean(isEmployer && inviteRaw);

    if (isEmployer && !withEmployerInvite) {
      if (
        !userData.companyName?.trim() ||
        !userData.location?.trim() ||
        userData.provinceId == null ||
        userData.districtId == null
      ) {
        throw new HttpException("Một số trường dữ liệu chưa hợp lệ", 400, "VALIDATION_ERROR", {
          companyName: ["Thiếu thông tin công ty"],
        });
      }
    }

    let inviteForRegister: {
      companyId: number;
      company: { status: boolean };
    } | null = null;
    let inviteTokenHash: string | null = null;
    let inviteRedisRestore: EmployerInviteRedisPayload | null = null;

    if (withEmployerInvite) {
      inviteTokenHash = hashEmployerInviteToken(inviteRaw!);
      const redisPayload = await getEmployerInviteRedis(inviteTokenHash);
      if (!redisPayload) {
        throw new HttpException("Lời mời không hợp lệ hoặc đã hết hạn", 400);
      }
      if (
        normalizeEmployerInviteEmail(redisPayload.email) !==
        normalizeEmployerInviteEmail(userData.email)
      ) {
        throw new HttpException(
          "Email đăng ký phải trùng với email trong lời mời",
          400,
        );
      }
      const company = await prisma.company.findUnique({
        where: { id: redisPayload.companyId },
        select: { status: true },
      });
      if (!company) {
        throw new HttpException("Công ty không tồn tại", 400);
      }
      inviteForRegister = {
        companyId: redisPayload.companyId,
        company,
      };
      inviteRedisRestore = redisPayload;
      await deleteEmployerInviteRedis(inviteTokenHash);
    }

    let user;
    try {
      user = await prismaTransaction(async (tx) => {
        const createdUser = await userService.createUser(
          {
            ...userData,
            isVerified: false,
            isActive: true,
          },
          roleIds,
        );

        if (isEmployer) {
          if (withEmployerInvite && inviteForRegister) {
            const employerStatus = inviteForRegister.company.status
              ? "APPROVED"
              : "PENDING";

            await tx.employer.upsert({
              where: { userId: createdUser.id },
              update: {
                companyId: inviteForRegister.companyId,
                status: employerStatus,
              },
              create: {
                userId: createdUser.id,
                companyId: inviteForRegister.companyId,
                status: employerStatus,
              },
            });
          } else {
            const company = await companyService.createCompany(
              {
                name: userData.companyName!,
                location: userData.location!,
                provinceId: userData.provinceId!,
                districtId: userData.districtId!,
                status: false,
              },
              tx,
            );

            await tx.employer.upsert({
              where: { userId: createdUser.id },
              update: {
                companyId: company.id,
                status: "PENDING",
              },
              create: {
                userId: createdUser.id,
                companyId: company.id,
                status: "PENDING",
              },
            });
          }
        }

        return createdUser;
      });
    } catch (e) {
      if (withEmployerInvite && inviteTokenHash && inviteRedisRestore) {
        await setEmployerInviteRedis(inviteTokenHash, inviteRedisRestore);
      }
      throw e;
    }

    const code = generateOtp();
    try {
      await redisClient.setEx(
        getOtpKey("EMAIL_VERIFICATION", user.email),
        2 * 60,
        hashOtp(code),
      );
    } catch (e) {
      throw asRedisUnavailable(e);
    }

    await emailQueue.add("send-email-verify", {
      to: user.email,
      subject: "Xác thực tài khoản của bạn",
      template: "verify-register",
      options: { code, username: user.username },
    });

    if (isEmployer) {
      try {
        if (!withEmployerInvite) {
          const companyName = userData.companyName?.trim() ?? "";
          await notificationService.notifyAdmins({
            type: NotificationType.EMPLOYER_REGISTRATION_PENDING,
            title: "Nhà tuyển dụng mới đăng ký",
            body: [
              companyName && `Công ty: ${companyName}`,
              `Tài khoản: ${user.username} (${user.email})`,
              "Trạng thái: chờ xác thực email và duyệt hồ sơ.",
            ]
              .filter(Boolean)
              .join("\n"),
          });
        } else {
          const empRow = await prisma.employer.findUnique({
            where: { userId: user.id },
            include: { company: { select: { name: true } } },
          });
          if (empRow?.status === "PENDING") {
            await notificationService.notifyAdmins({
              type: NotificationType.EMPLOYER_REGISTRATION_PENDING,
              title: "Nhà tuyển dụng tham gia qua lời mời (chờ duyệt)",
              body: [
                empRow.company?.name && `Công ty: ${empRow.company.name}`,
                `Tài khoản: ${user.username} (${user.email})`,
                "Công ty chưa được kích hoạt — tài khoản chờ duyệt sau khi xác thực email.",
              ]
                .filter(Boolean)
                .join("\n"),
            });
          }
        }
      } catch (e) {
        logger.warn("notifyAdmins employer registration failed", {
          error: String(e),
          userId: user.id,
        });
      }
    }

    const { password, totpSecret, ...safeUser } = user;
    void password;
    void totpSecret;
    return safeUser;
  },

  async login(email: string, password: string) {
    const user = await userService.findByEmail(email);

    if (!user || !verifyPassword(password, user.password)) {
      throw new HttpException(
        "Email hoặc mật khẩu không chính xác",
        401,
        "AUTH_INVALID_CREDENTIALS",
      );
    }

    if (user.isVerified === false) {
      throw new HttpException(
        "Email chưa được xác thực",
        403,
        "AUTH_EMAIL_NOT_VERIFIED",
      );
    }

    if (user.isBlocked) {
      throw new HttpException(
        "Tài khoản đã bị khóa. Vui lòng liên hệ quản trị viên.",
        403,
        "AUTH_ACCOUNT_BLOCKED",
      );
    }

    const employer = await employerService.findEmployer(user.id);

    if (employer) {
      if (employer.status === "PENDING") {
        throw new HttpException(
          "Tài khoản đang chờ quản trị viên duyệt",
          403,
          "EMPLOYER_PENDING_APPROVAL",
        );
      }

      if (employer.status === "REJECTED") {
        throw new HttpException(
          "Tài khoản đã bị từ chối",
          403,
          "EMPLOYER_REJECTED",
        );
      }
    }

    const { roles } = await this.getUserPermissions(user.id);
    return completeAuthenticatedLogin(
      {
        id: user.id,
        totpEnabled: user.totpEnabled,
        totpSecret: user.totpSecret,
      },
      roles,
    );
  },

  async profile(token: string) {
    const decoded = verifyAccessToken(token) as JwtPayload & {
      id: number;
      roles: string[];
    };
    if (!decoded) {
      throw new HttpException("Token không hợp lệ", 400, "AUTH_INVALID_TOKEN");
    }

    if (await this.verifyBlacklist(decoded.jti!)) {
      throw new HttpException("Token không hợp lệ", 400, "AUTH_INVALID_TOKEN");
    }

    type ProfileUser = NonNullable<
      Awaited<ReturnType<typeof userService.findById>>
    >;
    let user: ProfileUser | null = null;
    if (env.CACHE_ENABLED && env.AUTH_USER_CACHE_TTL_SEC > 0) {
      user = await cacheGetJson<ProfileUser>(authUserCacheKey(decoded.id));
    }
    if (!user) {
      user = await userService.findById(decoded.id);
      if (user && env.CACHE_ENABLED && env.AUTH_USER_CACHE_TTL_SEC > 0) {
        await cacheSetJson(
          authUserCacheKey(decoded.id),
          user,
          env.AUTH_USER_CACHE_TTL_SEC,
        );
      }
    }
    if (!user) throw new HttpException("Unauthorized", 401, "UNAUTHORIZED");

    if (user.isBlocked) {
      throw new HttpException(
        "Tài khoản đã bị khóa",
        403,
        "AUTH_ACCOUNT_BLOCKED",
      );
    }

    const { roles, permissions } = await this.getUserPermissions(user.id);
    return {
      user: {
        ...user,
        roles,
        permissions,
      },
      decoded,
    };
  },

  async updateProfile(
    userId: number,
    payload: {
      username: string;
      email: string;
      avatar?: string;
      phone?: string;
      provinceId?: number | null;
      districtId?: number | null;
      receiveEmailNotifications?: boolean;
    },
  ) {
    const currentUser = await prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      include: {
        userPhone: true,
      },
    });

    if (!currentUser) {
      throw new HttpException("Unauthorized", 401, "UNAUTHORIZED");
    }

    if (payload.email !== currentUser.email) {
      throw new HttpException(
        "Không thể thay đổi email",
        400,
        "PROFILE_EMAIL_CHANGE_NOT_ALLOWED",
      );
    }

    const phone = payload.phone?.trim() ?? "";

    if (phone) {
      const phoneOwner = await prisma.userPhone.findFirst({
        where: {
          phone,
          NOT: {
            userId,
          },
        },
      });

      if (phoneOwner) {
        throw new HttpException(
          "Số điện thoại đã được sử dụng",
          400,
          "PROFILE_PHONE_ALREADY_USED",
        );
      }
    }

    const hasLocation =
      payload.provinceId != null &&
      payload.districtId != null &&
      !Number.isNaN(Number(payload.provinceId)) &&
      !Number.isNaN(Number(payload.districtId));

    if (hasLocation) {
      await locationService.validateProvinceDistrict(
        Number(payload.provinceId),
        Number(payload.districtId),
      );
    }

    const flags: { receiveEmailNotifications?: boolean } = {};
    if (typeof payload.receiveEmailNotifications === "boolean") {
      flags.receiveEmailNotifications = payload.receiveEmailNotifications;
    }

    await prismaTransaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: {
          username: payload.username,
          ...(payload.avatar !== undefined && {
            avatar: payload.avatar,
          }),
          ...flags,
        },
      });

      if (phone) {
        await tx.userPhone.upsert({
          where: { userId },
          update: { phone },
          create: { userId, phone },
        });
      } else {
        await tx.userPhone.deleteMany({ where: { userId } });
      }

      if (hasLocation) {
        const candidate = await tx.candidate.findUnique({
          where: { userId },
        });
        if (candidate) {
          await tx.candidate.update({
            where: { userId },
            data: {
              provinceId: Number(payload.provinceId),
              districtId: Number(payload.districtId),
            },
          });
        }
      }
    });

    await invalidateUserAuthDataCache(userId);

    const { roles, permissions } = await this.getUserPermissions(userId);
    const fresh = await userService.findById(userId);
    if (!fresh) {
      throw new HttpException("Unauthorized", 401, "UNAUTHORIZED");
    }

    return {
      data: {
        id: fresh.id,
        email: fresh.email,
        username: fresh.username,
        phone: fresh.phone || "",
        avatar: fresh.avatar,
        provinceId: fresh.provinceId,
        districtId: fresh.districtId,
        provinceName: fresh.provinceName,
        districtName: fresh.districtName,
        receiveEmailNotifications: fresh.receiveEmailNotifications,
        roles,
        permissions,
      },
    };
  },

  async changePassword(
    userId: number,
    oldPassword: string,
    newPassword: string,
  ) {
    const user = await prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
    });
    if (!user) {
      throw new HttpException("Unauthorized", 401, "UNAUTHORIZED");
    }
    if (!verifyPassword(oldPassword, user.password)) {
      throw new HttpException(
        "Mật khẩu hiện tại không đúng",
        400,
        "AUTH_INVALID_OLD_PASSWORD",
      );
    }
    await prisma.user.update({
      where: { id: userId },
      data: { password: hashPassword(newPassword) },
    });
    return true;
  },

  async logout(
    accessJti: string,
    accessExp: number,
    refreshToken: string,
    userId: number,
  ) {
    const decodedRefresh = verifyRefreshToken(refreshToken) as JwtPayload & {
      id: number;
    };

    if (!decodedRefresh)
      throw new HttpException(
        "Refresh token không hợp lệ",
        400,
        "AUTH_INVALID_REFRESH_TOKEN",
      );

    if (decodedRefresh.id !== userId) {
      throw new HttpException(
        "Refresh token không hợp lệ",
        400,
        "AUTH_INVALID_REFRESH_TOKEN",
      );
    }

    const refreshJti =
      typeof decodedRefresh.jti === "string" ? decodedRefresh.jti : null;
    if (!refreshJti) {
      throw new HttpException(
        "Refresh token không hợp lệ",
        400,
        "AUTH_INVALID_REFRESH_TOKEN",
      );
    }

    const ttlSeconds = Math.max(0, Math.floor(accessExp - Date.now() / 1000));
    try {
      await Promise.all([
        redisClient.setEx(authBlacklistKey(accessJti), ttlSeconds, "access"),
        redisClient.setEx(
          authBlacklistKeyLegacy(accessJti),
          ttlSeconds,
          "access",
        ),
      ]);
    } catch (e) {
      throw asRedisUnavailable(e);
    }

    let refreshTokenExisted = 0;
    try {
      refreshTokenExisted =
        (await redisClient.exists(authRefreshTokenKey(refreshJti))) ||
        (await redisClient.exists(
          authRefreshTokenKeyLegacy(refreshJti),
        ));
    } catch (e) {
      throw asRedisUnavailable(e);
    }
    if (!refreshTokenExisted)
      throw new HttpException(
        "Refresh token không hợp lệ",
        400,
        "AUTH_INVALID_REFRESH_TOKEN",
      );

    try {
      await Promise.all([
        redisClient.del(authRefreshTokenKey(refreshJti)),
        redisClient.del(authRefreshTokenKeyLegacy(refreshJti)),
        redisClient.del(authPermissionsKey(decodedRefresh.id)),
        redisClient.del(authPermissionsKeyLegacy(decodedRefresh.id)),
      ]);
    } catch (e) {
      throw asRedisUnavailable(e);
    }

    return true;
  },

  async verifyEmail(email: string, code: string) {
    const key = getOtpKey("EMAIL_VERIFICATION", email);
    const keyLegacy = getOtpKeyLegacy("EMAIL_VERIFICATION", email);
    let storedCode: string | null = null;
    try {
      storedCode =
        (await redisClient.get(key)) ?? (await redisClient.get(keyLegacy));
    } catch (e) {
      throw asRedisUnavailable(e);
    }

    if (storedCode !== hashOtp(code)) {
      throw new HttpException(
        "OTP không hợp lệ hoặc đã hết hạn",
        400,
        "AUTH_INVALID_OTP",
      );
    }

    const user = await prisma.user.update({
      where: { email },
      data: { isVerified: true },
    });

    try {
      await Promise.all([redisClient.del(key), redisClient.del(keyLegacy)]);
    } catch (e) {
      throw asRedisUnavailable(e);
    }
    const { roles, permissions } = await this.getUserPermissions(user.id);

    const employer = await employerService.findEmployer(+user.id);
    const isEmployer = roles.includes("EMPLOYER");

    if (isEmployer && employer?.status === "PENDING") {
      return {
        needsApproval: true,
        message: "Tài khoản đang chờ quản trị viên duyệt",
        isEmployer: true,
      };
    }

    const accessToken = createAccessToken({
      id: user.id,
      roles,
    });

    const refreshToken = createRefreshToken({ id: user.id });

    const { jti: jtiRefreshToken, exp: expRefreshToken } = decodeToken(
      refreshToken,
    ) as JwtPayload & { jti: string };

    const ttl = expRefreshToken! - Math.floor(Date.now() / 1000);
    try {
      await Promise.all([
        redisClient.setEx(
          authRefreshTokenKey(jtiRefreshToken),
          ttl,
          user.id.toString(),
        ),
        redisClient.setEx(
          authRefreshTokenKeyLegacy(jtiRefreshToken),
          ttl,
          user.id.toString(),
        ),
      ]);
    } catch (e) {
      throw asRedisUnavailable(e);
    }

    return {
      needsApproval: false,
      isEmployer,
      accessToken,
      refreshToken,
      user: {
        ...user,
        roles,
        permissions,
      },
    };
  },

  async verifyBlacklist(jti: string) {
    try {
      const blacklist =
        (await redisClient.get(authBlacklistKey(jti))) ??
        (await redisClient.get(authBlacklistKeyLegacy(jti)));
      return !!blacklist;
    } catch (e) {
      throw asRedisUnavailable(e);
    }
  },
  async refreshToken(oldRefreshToken: string) {
    const decoded = verifyRefreshToken(oldRefreshToken) as JwtPayload;
    if (!decoded)
      throw new HttpException(
        "Refresh token không hợp lệ",
        400,
        "AUTH_INVALID_REFRESH_TOKEN",
      );

    const jti = typeof decoded.jti === "string" ? decoded.jti : null;
    const id = Number(decoded.id);
    if (!jti || !Number.isFinite(id) || id <= 0) {
      throw new HttpException(
        "Refresh token không hợp lệ",
        400,
        "AUTH_INVALID_REFRESH_TOKEN",
      );
    }

    let refreshTokenExisted = 0;
    try {
      refreshTokenExisted =
        (await redisClient.exists(authRefreshTokenKey(jti))) ||
        (await redisClient.exists(authRefreshTokenKeyLegacy(jti)));
    } catch (e) {
      throw asRedisUnavailable(e);
    }
    if (!refreshTokenExisted)
      throw new HttpException(
        "Refresh token không hợp lệ",
        400,
        "AUTH_INVALID_REFRESH_TOKEN",
      );

    const { roles } = await this.getUserPermissions(id);
    const accessToken = createAccessToken({ id, roles });
    const refreshToken = createRefreshToken({ id });
    const newDecoded = decodeToken(refreshToken) as JwtPayload;

    const newJti = typeof newDecoded.jti === "string" ? newDecoded.jti : null;
    if (!newJti) {
      throw new HttpException(
        "Refresh token không hợp lệ",
        400,
        "AUTH_INVALID_REFRESH_TOKEN",
      );
    }

    const ttl = newDecoded.exp! - Math.floor(Date.now() / 1000);
    try {
      await Promise.all([
        redisClient.setEx(
          authRefreshTokenKey(newJti),
          ttl,
          id.toString(),
        ),
        redisClient.setEx(
          authRefreshTokenKeyLegacy(newJti),
          ttl,
          id.toString(),
        ),
      ]);
      await Promise.all([
        redisClient.del(authRefreshTokenKey(jti)),
        redisClient.del(authRefreshTokenKeyLegacy(jti)),
      ]);
    } catch (e) {
      throw asRedisUnavailable(e);
    }

    return {
      accessToken,
      refreshToken,
    };
  },

  async resendVerification(email: string) {
    const user = await userService.findByEmail(email);
    if (!user) return true;
    if (user.isVerified === true)
      throw new HttpException(
        "Email đã được xác thực",
        400,
        "AUTH_EMAIL_ALREADY_VERIFIED",
      );

    const key = authResendVerifyKey(user.id);
    const keyLegacy = authResendVerifyKeyLegacy(user.id);
    let count = 1;
    try {
      count = await redisClient.incr(key);
      if (count === 1) {
        await redisClient.expire(key, 2 * 60);
      }
      const legacyCount = await redisClient.incr(keyLegacy);
      if (legacyCount === 1) {
        await redisClient.expire(keyLegacy, 2 * 60);
      }
    } catch (e) {
      logger.warn("rateLimit resendVerification failed", { error: String(e) });
      count = 1;
    }

    if (count > 3) {
      throw new HttpException("Too many requests", 429, "AUTH_RATE_LIMITED");
    }

    const code = generateOtp();

    try {
      await redisClient.setEx(
        getOtpKey("EMAIL_VERIFICATION", email),
        2 * 60,
        hashOtp(code),
      );
    } catch (e) {
      throw asRedisUnavailable(e);
    }

    await emailQueue.add("send-email-verify", {
      to: user.email,
      subject: "Xác thực tài khoản của bạn",
      template: "verify-register",
      options: { code, username: user.username },
    });
    return true;
  },

  async forgotPassword(email: string) {
    const user = await userService.findByEmail(email);
    if (!user) return true;
    const key = authForgotPasswordKey(user.id);
    const keyLegacy = authForgotPasswordKeyLegacy(user.id);
    let count = 1;
    try {
      count = await redisClient.incr(key);
      if (count === 1) {
        await redisClient.expire(key, 2 * 60);
      }
      const legacyCount = await redisClient.incr(keyLegacy);
      if (legacyCount === 1) {
        await redisClient.expire(keyLegacy, 2 * 60);
      }
    } catch (e) {
      logger.warn("rateLimit forgotPassword failed", { error: String(e) });
      count = 1;
    }
    if (count > 3) {
      throw new HttpException("Too many requests", 429, "AUTH_RATE_LIMITED");
    }

    const code = generateOtp();

    try {
      await redisClient.setEx(
        getOtpKey("PASSWORD_RESET", email),
        2 * 60,
        hashOtp(code),
      );
    } catch (e) {
      throw asRedisUnavailable(e);
    }

    await emailQueue.add("send-email-verify", {
      to: user.email,
      subject: "Cập nhật mật khẩu mới",
      template: "reset-password",
      options: { code, username: user.username },
    });

    return true;
  },

  async resetPassword(email: string, code: string, newPassword: string) {
    const key = getOtpKey("PASSWORD_RESET", email);
    const keyLegacy = getOtpKeyLegacy("PASSWORD_RESET", email);

    let storedCode: string | null = null;
    try {
      storedCode =
        (await redisClient.get(key)) ?? (await redisClient.get(keyLegacy));
    } catch (e) {
      throw asRedisUnavailable(e);
    }

    if (storedCode !== hashOtp(code)) {
      throw new HttpException(
        "OTP không hợp lệ hoặc đã hết hạn",
        400,
        "AUTH_INVALID_OTP",
      );
    }

    const user = await userService.findByEmail(email);
    if (!user)
      throw new HttpException("User không tồn tại", 404, "USER_NOT_FOUND");

    const hashedPassword = hashPassword(newPassword);

    await prisma.user.update({
      where: { id: user.id },
      data: { password: hashedPassword },
    });

    try {
      await Promise.all([redisClient.del(key), redisClient.del(keyLegacy)]);
    } catch (e) {
      throw asRedisUnavailable(e);
    }
    return true;
  },

  async resendResetOtp(email: string) {
    const user = await userService.findByEmail(email);
    if (!user) return true;

    const key = authResendResetKey(user.id);
    const keyLegacy = authResendResetKeyLegacy(user.id);
    let count = 1;
    try {
      count = await redisClient.incr(key);
      if (count === 1) {
        await redisClient.expire(key, 2 * 60);
      }
      const legacyCount = await redisClient.incr(keyLegacy);
      if (legacyCount === 1) {
        await redisClient.expire(keyLegacy, 2 * 60);
      }
    } catch (e) {
      logger.warn("rateLimit resendResetOtp failed", { error: String(e) });
      count = 1;
    }
    if (count > 3) {
      throw new HttpException("Too many requests", 429, "AUTH_RATE_LIMITED");
    }

    const code = generateOtp();

    const keyOtp = getOtpKey("PASSWORD_RESET", email);
    try {
      await redisClient.setEx(keyOtp, 2 * 60, hashOtp(code));
    } catch (e) {
      throw asRedisUnavailable(e);
    }

    await emailQueue.add("send-email-verify", {
      to: user.email,
      subject: "Cập nhật mật khẩu mới",
      template: "reset-password",
      options: { code, username: user.username },
    });

    return true;
  },

  async loginWithGoogleProfile(body: { code: string }) {
    if (
      !env.GOOGLE_CLIENT_ID ||
      !env.GOOGLE_CLIENT_SECRET ||
      !env.GOOGLE_CALLBACK_URI
    ) {
      throw new HttpException(
        "Đăng nhập Google chưa được cấu hình trên server",
        503,
        "GOOGLE_OAUTH_NOT_CONFIGURED",
      );
    }

    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: body.code,
        client_id: env.GOOGLE_CLIENT_ID,
        client_secret: env.GOOGLE_CLIENT_SECRET,
        redirect_uri: env.GOOGLE_CALLBACK_URI,
      }),
    });

    const tokenJson = (await tokenRes.json()) as {
      access_token?: string;
      error?: string;
      error_description?: string;
    };

    if (!tokenJson.access_token) {
      const msg =
        tokenJson.error_description ||
        tokenJson.error ||
        "Mã xác thực Google không hợp lệ hoặc đã hết hạn";
      throw new HttpException(msg, 401, "GOOGLE_TOKEN_EXCHANGE_FAILED");
    }

    const userInfoRes = await fetch(
      "https://www.googleapis.com/oauth2/v1/userinfo",
      {
        headers: {
          Authorization: `Bearer ${tokenJson.access_token}`,
        },
      },
    );

    if (!userInfoRes.ok) {
      throw new HttpException(
        "Không lấy được thông tin tài khoản Google",
        401,
        "GOOGLE_USERINFO_FAILED",
      );
    }

    const g = (await userInfoRes.json()) as {
      id: string;
      email?: string;
      name?: string;
      picture?: string;
    };

    if (!g.email) {
      throw new HttpException(
        "Tài khoản Google thiếu email công khai",
        400,
        "GOOGLE_EMAIL_REQUIRED",
      );
    }

    const email = g.email.trim();
    const nameForUsername = (g.name || email.split("@")[0] || "user").trim();
    const googleAvatar = normalizeGoogleAvatarUrl(g.picture);

    let userRow = await userService.findByEmail(email);

    if (!userRow) {
      await userService.createGoogleUser({
        email,
        nameHint: nameForUsername,
        googleSub: g.id,
        avatar: googleAvatar,
      });
      userRow = await userService.findByEmail(email);
    } else {
      const profilePatch = await buildGoogleProfilePatch(
        userRow,
        nameForUsername,
        googleAvatar,
      );
      if (Object.keys(profilePatch).length > 0) {
        await prisma.user.update({
          where: { id: userRow.id },
          data: profilePatch,
        });
        await invalidateUserAuthDataCache(userRow.id);
        userRow = await userService.findByEmail(email);
      }
    }

    if (userRow) {
      await userService.clearSyntheticGooglePhone(userRow.id, email, g.id);
    }

    if (!userRow) {
      throw new HttpException(
        "Không tạo/đọc được người dùng",
        500,
        "USER_SYNC_FAILED",
      );
    }

    if (userRow.isBlocked) {
      throw new HttpException(
        "Tài khoản đã bị khóa. Vui lòng liên hệ quản trị viên.",
        403,
        "AUTH_ACCOUNT_BLOCKED",
      );
    }

    const employer = await employerService.findEmployer(userRow.id);

    if (employer) {
      if (employer.status === "PENDING") {
        throw new HttpException(
          "Tài khoản đang chờ quản trị viên duyệt",
          403,
          "EMPLOYER_PENDING_APPROVAL",
        );
      }

      if (employer.status === "REJECTED") {
        throw new HttpException(
          "Tài khoản đã bị từ chối",
          403,
          "EMPLOYER_REJECTED",
        );
      }
    }

    const user = await userService.findById(userRow.id);
    if (!user) {
      throw new HttpException("Unauthorized", 401, "UNAUTHORIZED");
    }

    const { roles, permissions } = await this.getUserPermissions(user.id);
    return completeAuthenticatedLogin(
      {
        id: userRow.id,
        totpEnabled: userRow.totpEnabled,
        totpSecret: userRow.totpSecret,
      },
      roles,
      {
        ...user,
        roles,
        permissions,
      },
    );
  },

  async requireAdminAccount(userId: number) {
    const user = await prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      include: {
        userRoles: { select: { role: { select: { name: true } } } },
      },
    });
    if (!user) {
      throw new HttpException("Unauthorized", 401, "UNAUTHORIZED");
    }
    const roles = user.userRoles.map((row) => row.role.name);
    if (!roles.includes("ADMIN")) {
      throw new HttpException(
        "Chỉ tài khoản quản trị mới dùng xác thực hai lớp",
        403,
        "FORBIDDEN",
      );
    }
    return user;
  },

  async setupAdminTotp(userId: number) {
    const user = await this.requireAdminAccount(userId);
    if (user.totpEnabled) {
      throw new HttpException(
        "Xác thực hai lớp đã được bật",
        409,
        "TWO_FACTOR_ALREADY_ENABLED",
      );
    }
    const secret = generateTotpSecret();
    await prisma.user.update({
      where: { id: userId },
      data: { totpSecret: secret, totpEnabled: false },
    });
    await invalidateUserAuthDataCache(userId);
    const otpauthUrl = buildOtpauthUrl({
      secret,
      account: user.email,
      issuer: "TopCV Admin",
    });
    const qrDataUrl = await QRCode.toDataURL(otpauthUrl);
    return { secret, otpauthUrl, qrDataUrl };
  },

  async enableAdminTotp(userId: number, code: string) {
    const user = await this.requireAdminAccount(userId);
    if (user.totpEnabled) {
      throw new HttpException(
        "Xác thực hai lớp đã được bật",
        409,
        "TWO_FACTOR_ALREADY_ENABLED",
      );
    }
    if (!user.totpSecret || !verifyTotp(user.totpSecret, code)) {
      throw new HttpException(
        "Mã xác thực không đúng",
        400,
        "TWO_FACTOR_INVALID_CODE",
      );
    }
    await prisma.user.update({
      where: { id: userId },
      data: { totpEnabled: true },
    });
    await invalidateUserAuthDataCache(userId);
    return { totpEnabled: true };
  },

  async disableAdminTotp(userId: number, password: string, code: string) {
    const user = await this.requireAdminAccount(userId);
    if (!user.totpEnabled || !user.totpSecret) {
      throw new HttpException(
        "Xác thực hai lớp chưa được bật",
        400,
        "TWO_FACTOR_NOT_ENABLED",
      );
    }
    if (!verifyPassword(password, user.password)) {
      throw new HttpException(
        "Mật khẩu không đúng",
        401,
        "AUTH_INVALID_CREDENTIALS",
      );
    }
    if (!verifyTotp(user.totpSecret, code)) {
      throw new HttpException(
        "Mã xác thực không đúng",
        400,
        "TWO_FACTOR_INVALID_CODE",
      );
    }
    await prisma.user.update({
      where: { id: userId },
      data: { totpEnabled: false, totpSecret: null },
    });
    await invalidateUserAuthDataCache(userId);
    return { totpEnabled: false };
  },

  async verifyAdminTotpLogin(challengeToken: string, code: string) {
    const challenge = verifyTwoFactorChallengeToken(challengeToken);
    if (!challenge) {
      throw new HttpException(
        "Phiên xác thực đã hết hạn. Hãy đăng nhập lại.",
        401,
        "TWO_FACTOR_CHALLENGE_EXPIRED",
      );
    }
    const user = await prisma.user.findFirst({
      where: { id: challenge.id, deletedAt: null },
    });
    if (!user || user.isBlocked || !user.totpEnabled || !user.totpSecret) {
      throw new HttpException(
        "Không thể xác thực hai lớp",
        401,
        "TWO_FACTOR_INVALID_CODE",
      );
    }
    if (!verifyTotp(user.totpSecret, code)) {
      throw new HttpException(
        "Mã xác thực không đúng",
        401,
        "TWO_FACTOR_INVALID_CODE",
      );
    }
    const { roles, permissions } = await this.getUserPermissions(user.id);
    if (!roles.includes("ADMIN")) {
      throw new HttpException("Forbidden", 403, "FORBIDDEN");
    }
    const session = await issueLoginSession(user.id, roles);
    const safe = await userService.findById(user.id);
    return {
      twoFactorRequired: false as const,
      twoFactorSetupRequired: false,
      ...session,
      user: safe ? { ...safe, roles, permissions } : undefined,
    };
  },

  async getUserPermissions(userId: number) {
    const cacheKey = authPermissionsKey(userId);
    const cacheKeyLegacy = authPermissionsKeyLegacy(userId);

    try {
      const cache =
        (await redisClient.get(cacheKey)) ?? (await redisClient.get(cacheKeyLegacy));
      if (cache) {
        return JSON.parse(cache);
      }
    } catch (e) {
      logger.warn("getUserPermissions cache read failed", {
        userId,
        error: String(e),
      });
    }

    const [userRoles, userPermissions] = await Promise.all([
      prisma.userRole.findMany({
        where: { userId },
        select: {
          role: {
            select: {
              name: true,
              rolePermissions: {
                select: {
                  permission: {
                    select: { name: true },
                  },
                },
              },
            },
          },
        },
      }),
      prisma.userPermission.findMany({
        where: { userId },
        select: { permission: { select: { name: true } } },
      }),
    ]);

    const roles = userRoles.map((r) => r.role.name);
    const permissions = [
      ...userRoles.flatMap((r) =>
        r.role.rolePermissions.map((p) => p.permission.name),
      ),
      ...userPermissions.map((p) => p.permission.name),
    ];

    const deduped = Array.from(new Set(permissions));

    const data = { roles, permissions: deduped };
    try {
      await Promise.all([
        redisClient.setEx(cacheKey, 60 * 60, JSON.stringify(data)),
        redisClient.setEx(cacheKeyLegacy, 60 * 60, JSON.stringify(data)),
      ]);
    } catch (e) {
      logger.warn("getUserPermissions cache write failed", {
        userId,
        error: String(e),
      });
    }
    return data;
  },
};
