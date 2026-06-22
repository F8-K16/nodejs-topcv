import "dotenv/config";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "../generated/prisma/client";
import { env } from "../config/env";

const adapter = new PrismaMariaDb(env.DATABASE_URL);
const prisma = new PrismaClient({
  adapter,
  log: env.PRISMA_LOG_QUERY ? [{ emit: "stdout", level: "query" }] : [],
});

type TransactionDenyList =
  | "$connect"
  | "$disconnect"
  | "$on"
  | "$transaction"
  | "$extends";

export type PrismaTransactionClient = Omit<typeof prisma, TransactionDenyList>;

const prismaTransaction = <T>(
  // eslint-disable-next-line no-unused-vars
  fn: (...args: [PrismaTransactionClient]) => Promise<T>,
  options?: Parameters<typeof prisma.$transaction>[1],
): Promise<T> => {
  return prisma.$transaction((tx) => fn(tx as PrismaTransactionClient), options);
};

export { prisma, prismaTransaction };
