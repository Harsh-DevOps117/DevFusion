import bcrypt from "bcryptjs";
import type { Request, Response } from "express";
import jwt from "jsonwebtoken";
import logger from "../utils/logger";
import { loginSchema } from "../utils/LoginValidation";
import { prisma } from "../utils/prismaAdapter";
import { signupSchema } from "../utils/signupValidation";

// Environment Variables
const pepper = process.env.PEPPER || "";
const JWT_SECRET = process.env.JWT_SECRET!;
const REFRESH_TOKEN_SECRET = process.env.REFRESH_TOKEN_SECRET || JWT_SECRET;

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite:
    process.env.NODE_ENV === "production"
      ? ("strict" as const)
      : ("lax" as const),
  path: "/",
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
};

const generateTokens = (userId: string, role: string, plan?: string) => {
  const accessToken = jwt.sign({ id: userId, role, plan }, JWT_SECRET, {
    expiresIn: "15m",
  });

  const refreshToken = jwt.sign({ id: userId }, REFRESH_TOKEN_SECRET, {
    expiresIn: "7d",
  });

  return { accessToken, refreshToken };
};

export const signup = async (req: Request, res: Response) => {
  const validation = signupSchema.safeParse(req.body);
  if (!validation.success) {
    return res
      .status(400)
      .json({ success: false, message: "Validation Error" });
  }

  const { email, password, username } = validation.data;

  try {
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(409).json({ message: "Email already registered." });
    }

    const hashedPassword = await bcrypt.hash(password + pepper, 10);

    const user = await prisma.user.create({
      data: {
        email,
        name: username,
        password: hashedPassword,
        lastActive: new Date(),
      },
    });

    const { accessToken, refreshToken } = generateTokens(
      user.id,
      user.role,
      user.plan,
    );

    res.cookie("refreshToken", refreshToken, COOKIE_OPTIONS);

    return res.status(201).json({
      success: true,
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role, // ✅ Role included
        plan: user.plan,
      },
    });
  } catch (error) {
    logger.error("Signup error", { error });
    return res.status(500).json({ message: "Internal server error." });
  }
};

export const login = async (req: Request, res: Response) => {
  const validation = loginSchema.safeParse(req.body);
  if (!validation.success) {
    return res
      .status(400)
      .json({ success: false, errors: validation.error.flatten().fieldErrors });
  }

  const { email, password } = validation.data;

  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !(await bcrypt.compare(password + pepper, user.password))) {
      return res
        .status(401)
        .json({ success: false, message: "Invalid credentials." });
    }

    // Update last active
    await prisma.user.update({
      where: { id: user.id },
      data: { lastActive: new Date() },
    });

    const { accessToken, refreshToken } = generateTokens(
      user.id,
      user.role,
      user.plan,
    );

    res.cookie("refreshToken", refreshToken, COOKIE_OPTIONS);

    return res.json({
      success: true,
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role, // ✅ Role Added Here
        plan: user.plan,
      },
    });
  } catch (error) {
    logger.error("Login error", { error });
    return res.status(500).json({ message: "Internal server error." });
  }
};

export const refresh = async (req: Request, res: Response) => {
  const refreshToken = req.cookies?.refreshToken;
  if (!refreshToken) {
    return res.status(401).json({ message: "Refresh token missing" });
  }

  try {
    const decoded = jwt.verify(refreshToken, REFRESH_TOKEN_SECRET) as {
      id: string;
    };

    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      select: { id: true, role: true, plan: true },
    });

    if (!user) return res.status(403).json({ message: "User not found" });

    const accessToken = jwt.sign(
      { id: user.id, role: user.role, plan: user.plan },
      JWT_SECRET,
      { expiresIn: "15m" },
    );

    return res.json({
      success: true,
      accessToken,
    });
  } catch (error) {
    logger.warn("Invalid refresh token attempt");
    return res.status(403).json({
      success: false,
      message: "Invalid refresh token",
    });
  }
};

export const logout = async (req: Request, res: Response) => {
  res.clearCookie("refreshToken", { ...COOKIE_OPTIONS, maxAge: 0 });
  return res.json({
    success: true,
    message: "Logged out successfully",
  });
};

export const getAdminStats = async (req: Request, res: Response) => {
  try {
    const now = new Date();
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const last7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [totalUsers, totalProblems, totalSubmissions] = await Promise.all([
      prisma.user.count(),
      prisma.problem.count(),
      prisma.submission.count(),
    ]);

    const [activeUsers24h, activeUsers7d] = await Promise.all([
      prisma.user.count({ where: { lastActive: { gte: last24h } } }),
      prisma.user.count({ where: { lastActive: { gte: last7d } } }),
    ]);

    const leaderboardRaw = await prisma.problemSolved.groupBy({
      by: ["userId"],
      _count: { problemId: true },
      orderBy: { _count: { problemId: "desc" } },
      take: 10,
    });

    const leaderboard = await Promise.all(
      leaderboardRaw.map(async (entry) => {
        const user = await prisma.user.findUnique({
          where: { id: entry.userId },
          select: { id: true, name: true, email: true, role: true },
        });
        return { user, solved: entry._count.problemId };
      }),
    );

    const creatorsRaw = await prisma.problem.groupBy({
      by: ["userId"],
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
      take: 10,
    });

    const topCreators = await Promise.all(
      creatorsRaw.map(async (entry) => {
        const user = await prisma.user.findUnique({
          where: { id: entry.userId },
          select: { id: true, name: true, email: true, role: true },
        });
        return { user, problemsCreated: entry._count.id };
      }),
    );

    const mostAttemptedRaw = await prisma.submission.groupBy({
      by: ["problemId"],
      _count: { problemId: true },
      orderBy: { _count: { problemId: "desc" } },
      take: 5,
    });

    const mostAttempted = await Promise.all(
      mostAttemptedRaw.map(async (entry) => {
        const problem = await prisma.problem.findUnique({
          where: { id: entry.problemId },
          select: { id: true, title: true, difficulty: true },
        });
        return { problem, attempts: entry._count.problemId };
      }),
    );

    const difficultyStats = await prisma.problem.groupBy({
      by: ["difficulty"],
      _count: { difficulty: true },
    });

    const revenue = await prisma.payment.aggregate({
      _sum: { amount: true },
    });

    return res.json({
      success: true,
      stats: {
        totalUsers,
        totalProblems,
        totalSubmissions,
        activeUsers24h,
        activeUsers7d,
        revenue: revenue._sum.amount || 0,
      },
      leaderboard,
      topCreators,
      mostAttempted,
      difficultyStats,
    });
  } catch (error) {
    console.error("ADMIN_STATS_ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch admin stats",
    });
  }
};
