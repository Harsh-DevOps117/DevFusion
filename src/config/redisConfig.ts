// GOOD: Uses environment variables with a safe fallback
export const redisOptions = {
    host: process.env.REDIS_HOST || 'redis', 
    port: Number(process.env.REDIS_PORT) || 6379
};
