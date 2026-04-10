import { Request, Response } from "express";
import Redis from "ioredis";
import { prisma } from "../utils/prismaAdapter";

const redis = new Redis(process.env.REDIS_URL || "redis://localhost:6379");
const LEADERBOARD_CACHE_KEY = "leaderboard:top10";

export const getLeaderboard = async (req: Request, res: Response) => {
  try {
    const cachedLeaderboard = await redis.get(LEADERBOARD_CACHE_KEY);
    if (cachedLeaderboard) {
      return res.status(200).json({
        success: true,
        data: JSON.parse(cachedLeaderboard),
        cached: true,
      });
    }

    const topUsers = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        image: true,
        _count: { select: { quizAttempts: true } },
        quizAttempts: {
          select: { score: true },
        },
      },
      orderBy: {
        quizAttempts: { _count: "desc" },
      },
    });
    const leaderboard = topUsers
      .map((user) => ({
        id: user.id,
        name: user.name,
        image: user.image,
        totalScore: user.quizAttempts.reduce(
          (sum, attempt) => sum + attempt.score,
          0,
        ),
        quizzesTaken: user._count.quizAttempts,
      }))
      .sort((a, b) => b.totalScore - a.totalScore)
      .slice(0, 10);
    await redis.setex(LEADERBOARD_CACHE_KEY, 3600, JSON.stringify(leaderboard));

    return res.status(200).json({
      success: true,
      data: leaderboard,
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};
