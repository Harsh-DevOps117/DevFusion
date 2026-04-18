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

 
import Redis from "ioredis";
 

dotenv.config();

// ─── Redis client (shared with BullMQ) ───────────────────────────────────────
const redisClient = new Redis({
  host: process.env.REDIS_HOST || "redis",
  port: Number(process.env.REDIS_PORT) || 6379,
  maxRetriesPerRequest: null,
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
app.use("/v1", routesAuth);
app.use("/v1", getLeaderboard);

app.use("/v1/quiz/generate", isAuthenticated, quizRoutes);
app.use("/v1/interview/start", isAuthenticated, interviewRoutes);
app.use("/v1/resume", isAuthenticated, resumeReviewer);
app.use("/v1", isAuthenticated, routeExecuteCode);

app.use("/v1", isAuthenticated, quizAttempt);
app.use("/v1/problem", isAuthenticated, routesProblem);
app.use("/v1/playlist", isAuthenticated, routesPlaylist);
app.use("/v1", isAuthenticated, routeSubmission);
app.use("/v1", isAuthenticated, paymentRoutes);
app.use("/v1/user", isAuthenticated, userRoute);
// ─── Server start ─────────────────────────────────────────────────────────────
httpServer.listen(process.env.PORT, () => {
  logger.info(`Server is running on port ${process.env.PORT}`);
  console.log(`🚀 Server running on port ${process.env.PORT}`);
  require("./worker/interView");
});
