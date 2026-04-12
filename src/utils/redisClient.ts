import { createClient, RedisClientType } from "redis";

const redisClient: RedisClientType = createClient({
  url: process.env.REDIS_URL || "redis://redis:6379",
});

// new Redis(process.env.REDIS_URL || "redis://redis:6379");

redisClient.on("error", (err) => console.error("Redis Client Error", err));

const connectRedis = async () => {
  if (!redisClient.isOpen) {
    await redisClient.connect();
    console.log("Connected to Redis successfully");
  }
};

connectRedis();

export default redisClient;
