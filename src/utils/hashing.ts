import bcrypt from "bcrypt";
import { createHash } from "crypto";

export const generateOtp = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

export const hashOtp = (otp: string) =>
  createHash("sha256").update(otp).digest("hex");

export const getOtpKey = (type: string, email: string) => {
  return `jp:auth:v1:otp:${type}:${email}`;
};

export const getOtpKeyLegacy = (type: string, email: string) => {
  return `otp:${type}:${email}`;
};

const SALT_ROUND = 10;
export const hashPassword = (password: string) => {
  return bcrypt.hashSync(password, SALT_ROUND);
};

export const verifyPassword = (plainPassword: string, hashPassword: string) => {
  return bcrypt.compareSync(plainPassword, hashPassword);
};
