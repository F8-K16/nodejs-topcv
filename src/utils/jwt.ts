import jsonwebtoken, { JwtPayload } from "jsonwebtoken";
import { StringValue } from "ms";
import { env } from "../config/env";

const JWT_ACCESS_SECRET = env.JWT_ACCESS_SECRET;
const JWT_ACCESS_EXPIRED = env.JWT_ACCESS_EXPIRED as StringValue;
const JWT_REFRESH_SECRET = env.JWT_REFRESH_SECRET;
const JWT_REFRESH_EXPIRED = env.JWT_REFRESH_EXPIRED as StringValue;

export const createAccessToken = (payload: JwtPayload) => {
  return jsonwebtoken.sign(
    { ...payload, jti: crypto.randomUUID() },
    JWT_ACCESS_SECRET,
    {
      expiresIn: JWT_ACCESS_EXPIRED,
    },
  );
};

export const createRefreshToken = (payload: JwtPayload) => {
  return jsonwebtoken.sign(
    { ...payload, jti: crypto.randomUUID() },
    JWT_REFRESH_SECRET,
    { expiresIn: JWT_REFRESH_EXPIRED },
  );
};

export const verifyAccessToken = (token: string) => {
  try {
    const decoded = jsonwebtoken.verify(token, JWT_ACCESS_SECRET);
    return decoded;
  } catch {
    return false;
  }
};

export const verifyRefreshToken = (token: string) => {
  try {
    const decoded = jsonwebtoken.verify(token, JWT_REFRESH_SECRET);
    return decoded;
  } catch {
    return false;
  }
};

export const decodeToken = (token: string) => {
  return jsonwebtoken.decode(token);
};

export const createTwoFactorChallengeToken = (userId: number) => {
  return jsonwebtoken.sign(
    { id: userId, purpose: "admin_2fa" },
    JWT_ACCESS_SECRET,
    { expiresIn: "5m" },
  );
};

export const verifyTwoFactorChallengeToken = (token: string) => {
  try {
    const decoded = jsonwebtoken.verify(token, JWT_ACCESS_SECRET);
    if (typeof decoded === "string" || decoded.purpose !== "admin_2fa") {
      return null;
    }
    const id = Number(decoded.id);
    if (!Number.isInteger(id) || id <= 0) return null;
    return { id };
  } catch {
    return null;
  }
};
