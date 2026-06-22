import { searchIndexQueue } from "../queues/search_index.queue";
import { isOpenSearchEnabled } from "../utils/opensearch";

export const enqueueUpsertJobIndex = async (jobId: number) => {
  if (!isOpenSearchEnabled()) return;
  const id = Number(jobId);
  if (!Number.isFinite(id) || id <= 0) return;
  await searchIndexQueue.add("upsert-job", { jobId: Math.trunc(id) });
};

export const enqueueDeleteJobIndex = async (jobId: number) => {
  if (!isOpenSearchEnabled()) return;
  const id = Number(jobId);
  if (!Number.isFinite(id) || id <= 0) return;
  await searchIndexQueue.add("delete-job", { jobId: Math.trunc(id) });
};

