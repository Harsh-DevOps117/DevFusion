import cookieParser from "cookie-parser";
import cors from "cors";
import dotenv from "dotenv";
import type { Application, Request, Response } from "express";
import express from "express";
import helmet from "helmet";
import { isAuthenticated } from "./middleware/authMiddleware";

import "./worker/interView";
import "./worker/mcqGenerationAI";
import "./worker/resumeWorker";

import { createServer } from "http";

import quizRoutes from "./routes/quizRoutes";
import logger from "./utils/logger";

import client from "prom-client";
import routesAuth from "./routes/authRoutes";
import routeExecuteCode from "./routes/executeCodeRoutes";
import interviewRoutes from "./routes/interviewRoute";
import getLeaderboard from "./routes/leaderBoard";
import paymentRoutes from "./routes/paymentRoutes";
import routesPlaylist from "./routes/playlistRoutes";
import routesProblem from "./routes/problemRoutes";
import quizAttempt from "./routes/quizAttempt";
import resumeReviewer from "./routes/resumeReview";
import routeSubmission from "./routes/submissionRoutes";
import userRoute from "./routes/userRoute";
import { initSocket } from "./utils/socket";

// ─── Rate Limiters ────────────────────────────────────────────────────────────
import rateLimit from "express-rate-limit";
import Redis from "ioredis";
import RedisStore from "rate-limit-redis";

dotenv.config();

// ─── Redis client (shared with BullMQ) ───────────────────────────────────────
const redisClient = new Redis({
  host: process.env.REDIS_HOST || "redis",
  port: Number(process.env.REDIS_PORT) || 6379,
  maxRetriesPerRequest: null,
});

// ─── Limiter factory ──────────────────────────────────────────────────────────
function createLimiter(opts: {
  windowMs: number;
  max: number;
  message: string;
  keyPrefix: string;
}) {
  return rateLimit({
    windowMs: opts.windowMs,
    max: opts.max,
    standardHeaders: true,
    legacyHeaders: false,
    // use real IP even behind nginx / vercel proxy
    keyGenerator: (req) =>
      (req.headers["x-forwarded-for"] as string)?.split(",")[0].trim() ||
      req.ip ||
      "unknown",
    store: new RedisStore({
      sendCommand: (...args: string[]) => {
        return redisClient.call(args[0], ...args.slice(1)) as any;
      },
    }),
    handler: (_req, res) => {
      res.status(429).json({
        success: false,
        error: opts.message,
        retryAfter: Math.ceil(opts.windowMs / 1000),
      });
    },
  });
}

// 100 req / 15 min  — broad API protection
const apiLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: "Too many requests. Please try again in 15 minutes.",
  keyPrefix: "rl:api:",
});

// 10 req / 15 min  — brute-force protection on auth
const authLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: "Too many auth attempts. Please try again in 15 minutes.",
  keyPrefix: "rl:auth:",
});

// 5 req / hour  — expensive OpenAI call
const quizGenerationLimiter = createLimiter({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message:
    "Quiz generation limit reached. You can generate 5 quizzes per hour.",
  keyPrefix: "rl:quiz:",
});

// 3 req / hour  — interview session is heaviest resource
const interviewLimiter = createLimiter({
  windowMs: 60 * 60 * 1000,
  max: 3,
  message: "Interview limit reached. You can start 3 interviews per hour.",
  keyPrefix: "rl:interview:",
});

// 10 req / hour  — resume review (OpenAI + S3)
const resumeLimiter = createLimiter({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: "Resume review limit reached. Try again in an hour.",
  keyPrefix: "rl:resume:",
});

// 20 req / min  — code execution (sandboxed but still expensive)
const codeExecutionLimiter = createLimiter({
  windowMs: 60 * 1000,
  max: 20,
  message: "Code execution limit reached. Max 20 runs per minute.",
  keyPrefix: "rl:code:",
});

// ─── App bootstrap ────────────────────────────────────────────────────────────
const app: Application = express();
const httpServer = createServer(app);
const io = initSocket(httpServer);

export { io };

// ─── Prometheus ───────────────────────────────────────────────────────────────
const register = new client.Registry();
client.collectDefaultMetrics({ register });

const httpRequestCounter = new client.Counter({
  name: "http_requests_total",
  help: "Total number of HTTP requests",
  labelNames: ["method", "route", "status"],
});

const httpRequestDuration = new client.Histogram({
  name: "http_request_duration_seconds",
  help: "Duration of HTTP requests in seconds",
  labelNames: ["method", "route", "status"],
  buckets: [0.1, 0.3, 0.5, 1, 2, 5],
});

register.registerMetric(httpRequestCounter);
register.registerMetric(httpRequestDuration);

const allowedOrigins = ['https://prepgrid-pearl.vercel.app','http://localhost:5173'];

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("CORS Error"));
      }
    },
    credentials: true,
  }),
);

app.set("trust proxy", 1);

// ─── Core middleware ──────────────────────────────────────────────────────────
app.use(express.json());
app.use(cookieParser());
app.use(express.urlencoded({ extended: false }));
app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(express.static("public"));

// ─── Prometheus request tracking ──────────────────────────────────────────────
app.use((req: Request, res: Response, next) => {
  const start = Date.now();
  res.on("finish", () => {
    const duration = (Date.now() - start) / 1000;
    const labels = {
      method: req.method,
      route: req.route?.path || req.path,
      status: res.statusCode,
    };
    httpRequestCounter.inc(labels);
    httpRequestDuration.observe(labels, duration);
  });
  next();
});

// ─── Request logger ───────────────────────────────────────────────────────────
app.use((req, _res, next) => {
  logger.info(`${req.method} ${req.url}`);
  next();
});

// ─── System routes (no rate limit) ───────────────────────────────────────────
app.get("/", (_req: Request, res: Response) => {
  res.status(200).json({
    status: "ok",
    success: true,
    message: "Server is running",
    date: new Date().toISOString(),
    data: null,
  });
});

app.get("/health", (_req: Request, res: Response) => {
  res.status(200).json({
    status: "ok",
    success: true,
    message: "Server is healthy",
    date: new Date().toISOString(),
    data: null,
  });
});

app.get("/metrics", async (_req: Request, res: Response) => {
  res.set("Content-Type", register.contentType);
  res.end(await register.metrics());
});

// ─── Socket.IO ────────────────────────────────────────────────────────────────
io.on("connection", (socket) => {
  socket.on("join-interview", (interviewId: string) => {
    socket.join(interviewId);
    logger.info(`User joined interview room: ${interviewId}`);
  });
});

// ─── Routes with rate limiting ────────────────────────────────────────────────

// Auth — tight limit, no auth middleware needed
app.use("/v1", authLimiter, routesAuth);

// Leaderboard — public, covered by global apiLimiter
app.use("/v1", apiLimiter, getLeaderboard);

// AI-heavy routes — strictest limits, must be BEFORE the generic apiLimiter
app.use(
  "/v1/quiz/generate",
  isAuthenticated,
  quizGenerationLimiter,
  quizRoutes,
);
app.use(
  "/v1/interview/start",
  isAuthenticated,
  interviewLimiter,
  interviewRoutes,
);
app.use("/v1/resume", isAuthenticated, resumeLimiter, resumeReviewer);
app.use("/v1", isAuthenticated, codeExecutionLimiter, routeExecuteCode);

// Standard authenticated routes — general API limit
app.use("/v1", isAuthenticated, apiLimiter, quizAttempt);
app.use("/v1/problem", isAuthenticated, apiLimiter, routesProblem);
app.use("/v1/playlist", isAuthenticated, apiLimiter, routesPlaylist);
app.use("/v1", isAuthenticated, apiLimiter, routeSubmission);
app.use("/v1", isAuthenticated, apiLimiter, paymentRoutes);
app.use("/v1/user", isAuthenticated, apiLimiter, userRoute);

// ─── Server start ─────────────────────────────────────────────────────────────
httpServer.listen(process.env.PORT, () => {
  logger.info(`Server is running on port ${process.env.PORT}`);
  console.log(`🚀 Server running on port ${process.env.PORT}`);
  require("./worker/interView");
});
