import { Queue } from "bullmq";
import Redis from "ioredis";

const connection = new Redis({
  host: "localhost",
  port: 6379,
  maxRetriesPerRequest: null,
});

export const quizQueue = new Queue("quiz-generation", {
  connection,
  defaultJobOptions: {
    removeOnComplete: 100,
    removeOnFail: 50,
  },
});
