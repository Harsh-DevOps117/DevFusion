import { createClient, RedisClientType } from "redis";
import { redisOptions } from "../config/redisConfig";

const redisClient: RedisClientType = createClient({
  socket: {
    host: redisOptions.host,
    port: redisOptions.port
  }
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
