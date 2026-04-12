import { Response } from "express";
import Redis from "ioredis";
import { prisma } from "../utils/prismaAdapter";

const redis = new Redis({
  host: process.env.REDIS_HOST || "redis",
  port: Number(process.env.REDIS_PORT) || 6379,
});

export const getUserFullProfile = async (req: any, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const cacheKey = `user:profile:${userId}`;
    const cachedData = await redis.get(cacheKey);
    if (cachedData) {
      console.log("CACHE_HIT: Returning profile from Redis");
      return res.status(200).json({
        success: true,
        data: JSON.parse(cachedData),
        fromCache: true,
      });
    }

    console.log("CACHE_MISS: Fetching from Database");
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        subscription: true,
        _count: {
          select: {
            problemSolved: true,
            submissions: true,
            quizAttempts: true,
          },
        },
        problemSolved: {
          include: {
            problem: { select: { title: true, difficulty: true, tags: true } },
          },
          orderBy: { createdAt: "desc" },
          take: 10,
        },
        interviews: {
          select: {
            id: true,
            role: true,
            status: true,
            totalScore: true,
            createdAt: true,
          },
          orderBy: { createdAt: "desc" },
        },
        quizAttempts: {
          include: {
            quiz: { select: { topic: true } },
          },
          orderBy: { completedAt: "desc" },
          take: 5,
        },
        playlists: {
          include: {
            _count: { select: { problems: true } },
          },
        },
      },
    });

    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    const { password, ...safeUserData } = user;

    await redis.setex(cacheKey, 600, JSON.stringify(safeUserData));

    return res.status(200).json({
      success: true,
      data: safeUserData,
    });
  } catch (error: any) {
    console.error("Profile Retrieval Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch user profile",
      error: error.message,
    });
  }
};
