import { Queue } from "bullmq";
import Redis from "ioredis";
import { redisOptions } from "../config/redisConfig";

const connection = new Redis({
  ...redisOptions,
  maxRetriesPerRequest: null,
});

export const resumeQueue = new Queue("resume-analysis", {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 1000,
    },
    removeOnComplete: true,
  },
});
