import { bullMq } from "../utils/bullmq";

export const searchIndexQueue = bullMq.createQueue("SEARCH_INDEX_QUEUE");

