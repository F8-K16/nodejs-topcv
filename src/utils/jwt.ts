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
