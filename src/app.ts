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
import interviewRoutes from "./routes/interviewRoute";
import quizAttempt from "./routes/quizAttempt";
import resumeReviewer from "./routes/resumeReview";
import routesProblem from "./routes/problemRoutes";
import routeExecuteCode from "./routes/executeCodeRoutes"
import routesPlaylist from "./routes/playlistRoutes"
import routeSubmission from "./routes/submissionRoutes"
import paymentRoutes from "./routes/paymentRoutes"

import userRoute from "./routes/userRoute";

import getLeaderboard from "./routes/leaderBoard";
import { initSocket } from "./utils/socket";

dotenv.config();

const app: Application = express();
const httpServer = createServer(app);
const io = initSocket(httpServer);

export { io };

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

app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('CORS Error'));
    }
  },
  credentials: true,
}));

app.set('trust proxy', 1);

app.use(express.json());
app.use(cookieParser());
app.use(express.urlencoded({ extended: false }));
app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));

app.use(express.static("public"));

app.use((req: Request, res: Response, next) => {
  const start = Date.now();

  res.on("finish", () => {
    const duration = (Date.now() - start) / 1000;

    httpRequestCounter.inc({
      method: req.method,
      route: req.route?.path || req.path,
      status: res.statusCode,
    });

    httpRequestDuration.observe(
      {
        method: req.method,
        route: req.route?.path || req.path,
        status: res.statusCode,
      },
      duration,
    );
  });

  next();
});

app.get("/", (req: Request, res: Response) => {
  res.status(200).json({
    status: "ok",
    success: true,
    message: "Server is running",
    date: new Date().toISOString(),
    data: null,
  });
});

app.get("/health", (req: Request, res: Response) => {
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

app.use((req, res, next) => {
  console.log("INCOMING REQUEST:", req.method, req.url);
  next();
});

io.on("connection", (socket) => {
  socket.on("join-interview", (interviewId: string) => {
    socket.join(interviewId);
    logger.info(`User joined interview room: ${interviewId}`);
  });
});

app.use("/v1", routesAuth);
app.use("/v1", getLeaderboard);
app.use("/v1", isAuthenticated, quizRoutes);
app.use("/v1", isAuthenticated, quizAttempt);
app.use("/v1", isAuthenticated, interviewRoutes);
app.use("/v1/resume", isAuthenticated, resumeReviewer);
app.use("/v1/problem",isAuthenticated,routesProblem)
app.use("/v1",isAuthenticated,routeExecuteCode)
app.use("/v1/playlist",isAuthenticated,routesPlaylist)
app.use("/v1",isAuthenticated,routeSubmission)
app.use("/v1",isAuthenticated,paymentRoutes)

app.use("/v1/user", isAuthenticated, userRoute);

// app.listen(process.env.PORT, () => {
//   logger.info(`Server is running on port ${process.env.PORT}`);
//   console.log(`Server is running on port ${process.env.PORT}`);
// });

httpServer.listen(process.env.PORT, () => {
  logger.info(`Server is running on port ${process.env.PORT}`);
  console.log(`Server is running on port ${process.env.PORT}`);
  require("./worker/interView");
});
