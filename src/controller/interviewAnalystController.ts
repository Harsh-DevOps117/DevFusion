import type { Request, Response } from "express";
import { prisma } from "../utils/prismaAdapter";

interface TopicStats {
  total: number;
  count: number;
  average: number;
}

export const getAnalytics = async (req: Request, res: Response) => {
  const interviewId = req.params.interviewId as string;
  if (!interviewId) {
    return res.status(400).json({ error: "Interview ID is required" });
  }

  try {
    const chats = await prisma.interviewChat.findMany({
      where: { interviewId },
      select: {
        topic: true,
        score: true,
      },
    });

    const analysis = chats.reduce<Record<string, TopicStats>>((acc, chat) => {
      const topicName = chat.topic || "General";
      if (!acc[topicName]) {
        acc[topicName] = { total: 0, count: 0, average: 0 };
      }

      acc[topicName].total += chat.score || 0;
      acc[topicName].count += 1;
      acc[topicName].average = Number(
        (acc[topicName].total / acc[topicName].count).toFixed(2),
      );

      return acc;
    }, {});

    res.json({
      interviewId,
      stats: analysis,
      totalQuestions: chats.length,
    });
  } catch (error) {
    console.error("Analytics Error:", error);
    res.status(500).json({ error: "Failed to fetch analytics" });
  }
};
