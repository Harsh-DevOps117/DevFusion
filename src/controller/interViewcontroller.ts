import { Queue } from "bullmq";
import { Request, Response } from "express";
import Redis from "ioredis";
import { prisma } from "../utils/prismaAdapter";

const connection = new Redis({
  host: process.env.REDIS_HOST || "redis",
  port: Number(process.env.REDIS_PORT) || 6379,
});

const interviewQueue = new Queue("interview-queue", { connection });

export const handleUserResponse = async (req: Request, res: Response) => {
  const { interviewId, userInput } = req.body;

  try {
    const job = await interviewQueue.add("process-response", {
      interviewId,
      userInput,
    });

    res.status(202).json({ jobId: job.id, message: "AI is thinking..." });
  } catch (error) {
    res.status(500).json({ error: "Failed to queue response" });
  }
};

export const startInterview = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const { role } = req.body;

    if (!userId) {
      return res.status(401).json({ error: "User not authenticated" });
    }

    const interview = await prisma.interview.create({
      data: {
        userId,
        role,
        status: "IN_PROGRESS",
      },
    });

    res.status(201).json(interview);
  } catch (error) {
    res.status(500).json({ error: "Failed to start" });
  }
};
