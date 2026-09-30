/* eslint-disable no-unused-vars */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { Prisma } from "../generated/prisma/client";
import { SalaryRange, SalaryRangeType } from "../types/job.type";

export const normalizeUrl = (url?: string) => url?.trim().replace(/\/$/, "");
export const buildSalaryFilter = (
  range?: SalaryRangeType,
): Prisma.JobWhereInput => {
  if (!range) return {};

  switch (range) {
    case SalaryRange.UNDER_10:
      return { maxSalary: { lt: 10000000 } };

    case SalaryRange.FROM_10_15:
      return {
        AND: [
          { minSalary: { gte: 10000000 } },
          { maxSalary: { lte: 15000000 } },
        ],
      };

    case SalaryRange.FROM_15_20:
      return {
        AND: [
          { minSalary: { gte: 15000000 } },
          { maxSalary: { lte: 20000000 } },
        ],
      };

    case SalaryRange.FROM_20_25:
      return {
        AND: [
          { minSalary: { gte: 20000000 } },
          { maxSalary: { lte: 25000000 } },
        ],
      };

    case SalaryRange.FROM_25_30:
      return {
        AND: [
          { minSalary: { gte: 25000000 } },
          { maxSalary: { lte: 30000000 } },
        ],
      };

    case SalaryRange.FROM_30_50:
      return {
        AND: [
          { minSalary: { gte: 30000000 } },
          { maxSalary: { lte: 50000000 } },
        ],
      };

    case SalaryRange.OVER_50:
      return { minSalary: { gt: 50000000 } };

    case SalaryRange.NEGOTIABLE:
      return {
        AND: [
          {
            OR: [{ minSalary: null }, { maxSalary: null }],
          },
        ],
      };

    default:
      return {};
  }
};

// PARSE QUERY
export const toNumber = (value: any): number | undefined => {
  if (!value) return undefined;
  const num = Number(value);
  return isNaN(num) ? undefined : num;
};

export const toString = (value: any): string | undefined => {
  return typeof value === "string" ? value : undefined;
};

export const toNumberArray = (value: any): number[] | undefined => {
  if (!value) return undefined;

  if (Array.isArray(value)) {
    return value.map(Number).filter((n) => !isNaN(n));
  }

  if (typeof value === "string") {
    return value
      .split(",")
      .map(Number)
      .filter((n) => !isNaN(n));
  }

  return undefined;
};

export const cleanObject = <T extends object>(obj: T) => {
  return Object.fromEntries(
    Object.entries(obj).filter(([_, value]) => value !== undefined),
  );
};
