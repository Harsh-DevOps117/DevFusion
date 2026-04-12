import Redis from "ioredis";
const redis = new Redis({
  host: process.env.REDIS_HOST || "redis",
  port: Number(process.env.REDIS_PORT) || 6379,
});

export const clearUserCache = async (userId: string) => {
  await redis.del(`user:profile:${userId}`);
};

export const updateLeaderboardCache = async (newScore: number) => {
  const LEADERBOARD_CACHE_KEY = "leaderboard:top10";
  const cachedData = await redis.get(LEADERBOARD_CACHE_KEY);

  if (!cachedData) return;
  const top10 = JSON.parse(cachedData);
  const lowestTopScore =
    top10.length >= 10 ? top10[top10.length - 1].totalScore : 0;
  if (newScore > lowestTopScore || top10.length < 10) {
    console.log("LEADERBOARD_INVALIDATED: High score detected");
    await redis.del(LEADERBOARD_CACHE_KEY);
  }
};
