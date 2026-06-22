import { redisClient } from "./redis";

export const EMPLOYER_INVITE_REDIS_TTL_SEC = 3600;

export type EmployerInviteRedisPayload = {
  companyId: number;
  email: string;
  createdByEmployerId: number;
};

export function employerInviteRedisKey(tokenHash: string): string {
  return `jp:auth:v1:employer_invite:active:${tokenHash}`;
}

export function employerInviteRedisKeyLegacy(tokenHash: string): string {
  return `employer_invite:active:${tokenHash}`;
}

export async function setEmployerInviteRedis(
  tokenHash: string,
  payload: EmployerInviteRedisPayload,
): Promise<void> {
  const raw = JSON.stringify(payload);
  await Promise.all([
    redisClient.setEx(employerInviteRedisKey(tokenHash), EMPLOYER_INVITE_REDIS_TTL_SEC, raw),
    redisClient.setEx(
      employerInviteRedisKeyLegacy(tokenHash),
      EMPLOYER_INVITE_REDIS_TTL_SEC,
      raw,
    ),
  ]);
}

export async function getEmployerInviteRedis(
  tokenHash: string,
): Promise<EmployerInviteRedisPayload | null> {
  const raw =
    (await redisClient.get(employerInviteRedisKey(tokenHash))) ??
    (await redisClient.get(employerInviteRedisKeyLegacy(tokenHash)));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as EmployerInviteRedisPayload;
  } catch {
    return null;
  }
}

export async function deleteEmployerInviteRedis(
  tokenHash: string,
): Promise<void> {
  await Promise.all([
    redisClient.del(employerInviteRedisKey(tokenHash)),
    redisClient.del(employerInviteRedisKeyLegacy(tokenHash)),
  ]);
}
