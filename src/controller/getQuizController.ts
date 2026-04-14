//re
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
            // Notice: correctAnswer and explanation are intentionally left out to prevent cheating
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
    // 1. Fetch ALL fields for the questions so we can send them back to the frontend
    // We removed the 'select' restriction here so it grabs correctAnswer and explanation
    const questions = await prisma.quizQuestion.findMany({
      where: { quizId },
      orderBy: { order: "asc" }
    });

    let correctCount = 0;
    
    // 2. Calculate Score using robust string matching
    questions.forEach((q) => {
      const userAns = answers.find((a: any) => a.questionId === q.id);
      if (
        userAns &&
        String(userAns.selected).trim().toLowerCase() === String(q.correctAnswer).trim().toLowerCase()
      ) {
        correctCount++;
      }
    });

    const score = (correctCount / questions.length) * 100;

    // 3. Save the attempt
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

    // 4. Return the response including the full questions array
    return sendResponse(res, 201, true, "Quiz submitted", {
      attemptId: result.id,
      score,
      questions, // <-- This passes the correct answers back to your React component
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
