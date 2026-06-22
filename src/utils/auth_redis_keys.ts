export const AUTH_REDIS_PREFIX = "jp:auth:v1:";

export function authRefreshTokenKey(jti: string): string {
  return `${AUTH_REDIS_PREFIX}refresh:${jti}`;
}

export function authRefreshTokenKeyLegacy(jti: string): string {
  return `refreshToken:${jti}`;
}

export function authBlacklistKey(jti: string): string {
  return `${AUTH_REDIS_PREFIX}blacklist:${jti}`;
}

export function authBlacklistKeyLegacy(jti: string): string {
  return `blacklist:${jti}`;
}

export function authPermissionsKey(userId: number): string {
  return `${AUTH_REDIS_PREFIX}perm:${userId}`;
}

export function authPermissionsKeyLegacy(userId: number): string {
  return `user_permissions:${userId}`;
}

export function authResendVerifyKey(userId: number): string {
  return `${AUTH_REDIS_PREFIX}rl:resend_verify:${userId}`;
}

export function authResendVerifyKeyLegacy(userId: number): string {
  return `resend_verify:${userId}`;
}

export function authForgotPasswordKey(userId: number): string {
  return `${AUTH_REDIS_PREFIX}rl:forgot_password:${userId}`;
}

export function authForgotPasswordKeyLegacy(userId: number): string {
  return `forgot_password:${userId}`;
}

export function authResendResetKey(userId: number): string {
  return `${AUTH_REDIS_PREFIX}rl:resend_reset:${userId}`;
}

export function authResendResetKeyLegacy(userId: number): string {
  return `resend_reset:${userId}`;
}

