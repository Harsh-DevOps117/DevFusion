import { Response } from "express";
import Redis from "ioredis";
import { prisma } from "../utils/prismaAdapter";

const redis = new Redis({
  host: process.env.REDIS_HOST || "redis",
  port: Number(process.env.REDIS_PORT) || 6379,
});
const LEADERBOARD_CACHE_KEY = "leaderboard:top10";

export const getLeaderboard = async (req: any, res: Response) => {
  try {
    const userId = req.user?.id; // Authenticated user ID
    console.log("DEBUG: Incoming User ID ->", req.user?.id);
    // 1. GET TOP 10 (From Cache or DB)
    let leaderboard: any[] = [];
    const cachedLeaderboard = await redis.get(LEADERBOARD_CACHE_KEY);

    if (cachedLeaderboard) {
      leaderboard = JSON.parse(cachedLeaderboard);
    } else {
      // Logic: Fetch all users to calculate global rank (Only do this for small/medium scale)
      // For high performance, you'd use a Redis Sorted Set (ZSET)
      const allUsers = await prisma.user.findMany({
        select: {
          id: true,
          name: true,
          image: true,
          quizAttempts: { select: { score: true } },
        },
      });

      const processed = allUsers
        .map((user) => ({
          id: user.id,
          name: user.name,
          image: user.image,
          totalScore: user.quizAttempts.reduce((sum, a) => sum + a.score, 0),
          quizzesTaken: user.quizAttempts.length,
        }))
        .sort((a, b) => b.totalScore - a.totalScore);

      leaderboard = processed.slice(0, 10);

      // Cache top 10 for 1 hour
      await redis.setex(
        LEADERBOARD_CACHE_KEY,
        3600,
        JSON.stringify(leaderboard),
      );
    }

    // 2. GET LOGGED-IN USER RANK & SCORE
    let currentUserData = null;
    if (userId) {
      // Find if user is already in the top 10
      const indexInTop = leaderboard.findIndex((u) => u.id === userId);

      if (indexInTop !== -1) {
        currentUserData = { ...leaderboard[indexInTop], rank: indexInTop + 1 };
      } else {
        // User not in Top 10, fetch their specific stats
        const userStats = await prisma.user.findUnique({
          where: { id: userId },
          select: {
            name: true,
            image: true,
            quizAttempts: { select: { score: true } },
          },
        });

        if (userStats) {
          const totalScore = userStats.quizAttempts.reduce(
            (sum, a) => sum + a.score,
            0,
          );

          // Calculate Rank: Count how many users have more score than me
          // This is a "Senior SDE" move to avoid fetching all users again
          const rank = await prisma.user.count({
            where: {
              quizAttempts: {
                some: {}, // Just to ensure we are filtering users with attempts
              },
              // Logic Note: Real-time rank calculation with raw SQL is faster,
              // but this is clean for Prisma:
            },
          });

          // Accurate Rank calculation requires a bit more logic in Prisma
          // but for now, we'll return their score and a "Pending" rank or calculate it.
          // Let's do a simple calculation:
          const usersAhead = await prisma.$queryRaw`
            SELECT COUNT(*) as count FROM (
              SELECT "userId", SUM(score) as total
              FROM "QuizAttempt"
              GROUP BY "userId"
              HAVING SUM(score) > ${totalScore}
            ) as ahead`;

          currentUserData = {
            id: userId,
            name: userStats.name,
            image: userStats.image,
            totalScore,
            quizzesTaken: userStats.quizAttempts.length,
            rank: Number((usersAhead as any)[0].count) + 1,
          };
        }
      }
    }

    return res.status(200).json({
      success: true,
      data: {
        top10: leaderboard,
        user: currentUserData,
      },
    });
  } catch (error: any) {
    console.error("Leaderboard Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch ranking metrics",
    });
  }
};
