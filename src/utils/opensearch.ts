import { Client } from "@opensearch-project/opensearch";
import { env } from "../config/env";
import { logger } from "./logger";

let client: Client | null = null;

export const isOpenSearchEnabled = () => {
  return Boolean(env.OPENSEARCH_ENABLED);
};

export const getOpenSearchClient = () => {
  if (!isOpenSearchEnabled()) {
    return null;
  }

  if (client) return client;

  const auth =
    env.OPENSEARCH_USERNAME && env.OPENSEARCH_PASSWORD
      ? { username: env.OPENSEARCH_USERNAME, password: env.OPENSEARCH_PASSWORD }
      : undefined;

  const opts: ConstructorParameters<typeof Client>[0] = {
    node: env.OPENSEARCH_NODE,
    requestTimeout: env.OPENSEARCH_REQUEST_TIMEOUT_MS,
    ssl: {
      rejectUnauthorized: env.OPENSEARCH_TLS_REJECT_UNAUTHORIZED,
    },
  };
  if (auth) {
    (opts as unknown as { auth: { username: string; password: string } }).auth = auth;
  }

  client = new Client(opts);

  logger.info("OpenSearch client initialized", {
    node: env.OPENSEARCH_NODE,
    jobsIndex: env.OPENSEARCH_JOBS_INDEX,
  });

  return client;
};
