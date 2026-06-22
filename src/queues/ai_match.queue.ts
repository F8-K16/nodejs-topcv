import { bullMq } from "../utils/bullmq";

export const aiMatchQueue = bullMq.createQueue("AI_MATCH_QUEUE");
