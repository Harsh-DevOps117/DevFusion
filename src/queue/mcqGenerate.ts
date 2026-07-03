import { Queue } from "bullmq";
import Redis from "ioredis";
import { redisOptions } from "../config/redisConfig";

export const quizQueue = new Queue("quiz-generation", {
  connection: redisOptions,
  defaultJobOptions: {
    removeOnComplete: 100,
    removeOnFail: 50,
  },
});
