import "dotenv/config";

import { env } from "../config/env";
import { prisma } from "../utils/prisma";
import { getOpenSearchClient, isOpenSearchEnabled } from "../utils/opensearch";
import { recreateJobsIndex, ensureJobsIndex } from "../search/jobs.index";
import { shouldIndexPublicJob, toJobSearchDocument, JobWithIndexRelations } from "../search/jobs.document";
import type { Bulk_RequestBody } from "@opensearch-project/opensearch/api/_core/bulk";

const main = async () => {
  if (!isOpenSearchEnabled()) {
    throw new Error("OPENSEARCH_ENABLED=false");
  }
  const client = getOpenSearchClient();
  if (!client) {
    throw new Error("OpenSearch client is not initialized");
  }

  const shouldRecreate = process.argv.includes("--recreate");
  if (shouldRecreate) {
    await recreateJobsIndex();
  } else {
    await ensureJobsIndex();
  }

  const index = env.OPENSEARCH_JOBS_INDEX;
  const batchSize = 200;
  let cursorId: number | null = null;
  let indexed = 0;

  for (;;) {
    const rows: JobWithIndexRelations[] = await prisma.job.findMany({
      ...(cursorId != null
        ? { cursor: { id: cursorId }, skip: 1 }
        : {}),
      take: batchSize,
      orderBy: { id: "asc" },
      include: {
        company: { include: { province: true, district: true } },
        category: true,
        jobSkills: { include: { skill: true } },
      },
    });

    if (!rows.length) break;
    cursorId = rows[rows.length - 1]!.id;

    const body: Record<string, unknown>[] = [];
    for (const job of rows) {
      if (!shouldIndexPublicJob(job)) continue;
      const doc = toJobSearchDocument(job);
      body.push({ index: { _id: String(doc.id) } });
      body.push(doc as unknown as Record<string, unknown>);
      indexed += 1;
    }

    if (body.length) {
      await client.bulk({ index, body: body as unknown as Bulk_RequestBody });
    }
  }

  await client.indices.refresh({ index });
  process.stdout.write(`Indexed ${indexed} jobs into ${index}\n`);
};

main().catch((err) => {
  process.stderr.write(`${String(err)}\n`);
  process.exitCode = 1;
});
