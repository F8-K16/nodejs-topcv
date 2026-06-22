import { bullMq } from "../utils/bullmq";

export const maintenanceQueue = bullMq.createQueue("MAINTENANCE_QUEUE");
