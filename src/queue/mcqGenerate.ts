import { Queue } from "bullmq";
import Redis from "ioredis";
import { redisOptions } from "../config/redisConfig";

const connection = new Redis({
  ...redisOptions,
  maxRetriesPerRequest: null,
});

export const quizQueue = new Queue("quiz-generation", {
  connection,
  defaultJobOptions: {
    removeOnComplete: 100,
    removeOnFail: 50,
  },
});
