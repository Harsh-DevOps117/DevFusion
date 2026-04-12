import dotenv from "dotenv";
import type { Request, Response } from "express";
import Redis from "ioredis";
import { prisma } from "../utils/prismaAdapter";

dotenv.config();

const redis = new Redis(process.env.REDIS_URL || "redis://redis:6379", {
  maxRetriesPerRequest: null,
});

const sendResponse = (
  res: Response,
  status: number,
  success: boolean,
  message: string,
  data: any = null,
) => {
  return res
    .status(status)
    .json({ success, message, data, timestamp: new Date().toISOString() });
};

export const getQuiz = async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const cacheKey = `quiz:${id}`;

  try {
    const cachedData = await redis.get(cacheKey);
    if (cachedData)
      return sendResponse(
        res,
        200,
        true,
        "Quiz fetched (Cache)",
        JSON.parse(cachedData),
      );

    const quiz = await prisma.quiz.findUnique({
      where: { id },
      include: {
        questions: {
          orderBy: { order: "asc" },
          select: {
            id: true,
            question: true,
            options: true,
            order: true,
          },
        },
      },
    });

    if (!quiz) return sendResponse(res, 404, false, "Quiz not found");

    await redis.setex(cacheKey, 3600, JSON.stringify(quiz));
    return sendResponse(res, 200, true, "Quiz fetched (DB)", quiz);
  } catch (error: any) {
    return sendResponse(
      res,
      500,
      false,
      "Internal Server Error",
      error.message,
    );
  }
};

export const submitQuiz = async (req: Request, res: Response) => {
  const { quizId, answers } = req.body;
  const userId = req.user?.id as string;

  try {
    const questions = await prisma.quizQuestion.findMany({
      where: { quizId },
      select: { id: true, correctAnswer: true },
    });

    let correctCount = 0;
    questions.forEach((q) => {
      const userAns = answers.find((a: any) => a.questionId === q.id);
      if (userAns?.selected === q.correctAnswer) correctCount++;
    });

    const score = (correctCount / questions.length) * 100;

    const result = await prisma.$transaction(async (tx) => {
      const lastAttempt = await tx.quizAttempt.findFirst({
        where: { userId, quizId },
        orderBy: { attemptNumber: "desc" },
      });

      return await tx.quizAttempt.create({
        data: {
          userId,
          quizId,
          score,
          totalQuestions: questions.length,
          attemptNumber: (lastAttempt?.attemptNumber || 0) + 1,
          answers: {
            create: answers.map((a: any) => ({
              questionId: a.questionId,
              selected: a.selected,
            })),
          },
        },
      });
    });

    return sendResponse(res, 201, true, "Quiz submitted", {
      attemptId: result.id,
      score,
    });
  } catch (error: any) {
    return sendResponse(res, 500, false, "Submission failed", error.message);
  }
};

export const getReview = async (req: Request, res: Response) => {
  try {
    const attemptId = req.params.attemptId as string;
    const userId = req.user?.id as string;

    const review = await prisma.quizAttempt.findFirst({
      where: { id: attemptId, userId },
      include: {
        quiz: true,
        answers: {
          include: { question: true },
        },
      },
    });

    if (!review)
      return sendResponse(res, 404, false, "Review not found or unauthorized");
    return sendResponse(res, 200, true, "Review fetched", review);
  } catch (error: any) {
    return sendResponse(res, 500, false, "Error", error.message);
  }
};

export const getAttempts = async (req: Request, res: Response) => {
  try {
    const quizId = req.params.id as string;
    const userId = req.user?.id as string;

    const attempts = await prisma.quizAttempt.findMany({
      where: { quizId, userId },
      orderBy: { completedAt: "desc" },
    });
    return sendResponse(res, 200, true, "History fetched", attempts);
  } catch (error: any) {
    return sendResponse(res, 500, false, "Error", error.message);
  }
};
