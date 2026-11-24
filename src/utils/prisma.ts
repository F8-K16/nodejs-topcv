import "dotenv/config";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "../generated/prisma/client";
import { env } from "../config/env";

const databaseUrl = new URL(env.DATABASE_URL);

const adapter = new PrismaMariaDb({
  host: databaseUrl.hostname,
  port: Number(databaseUrl.port || 3306),
  user: decodeURIComponent(databaseUrl.username),
  password: decodeURIComponent(databaseUrl.password),
  database: databaseUrl.pathname.replace(/^\//, ""),
  // MySQL 8 caching_sha2_password refuses the pool without this on a fresh container.
  allowPublicKeyRetrieval: true,
  connectionLimit: 10,
});
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
  fn: (...args: [PrismaTransactionClient]) => Promise<T>,
  options?: Parameters<typeof prisma.$transaction>[1],
): Promise<T> => {
  return prisma.$transaction((tx) => fn(tx as PrismaTransactionClient), options);
};

export { prisma, prismaTransaction };
