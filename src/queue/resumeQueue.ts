import { Queue } from "bullmq";
import Redis from "ioredis";
import { redisOptions } from "../config/redisConfig";

export const resumeQueue = new Queue("resume-analysis", {
  connection: redisOptions,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 1000,
    },
    removeOnComplete: true,
  },
});
