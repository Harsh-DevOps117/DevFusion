import { Response } from "express";
import { quizQueue } from "../queue/mcqGenerate";

const sendResponse = (
  res: Response,
  status: number,
  success: boolean,
  message: string,
  data: any = null,
) => {
  return res.status(status).json({
    success,
    message,
    data,
    timestamp: new Date().toISOString(),
  });
};

export const generateQuiz = async (req: any, res: Response) => {
  const { topic, difficulty } = req.body;
  const userId = req.user?.id;
  if (!topic || !difficulty) {
    return sendResponse(
      res,
      400,
      false,
      "Missing required fields: topic or difficulty",
    );
  }
  if (!userId) {
    return sendResponse(res, 401, false, "Unauthorized: No user found");
  }

  try {
    const job = await quizQueue.add(
      "generate-quiz-task",
      { userId, topic, difficulty },
      {
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 2000,
        },
        jobId: `${userId}-${topic}-${difficulty}`,
      },
    );

    return sendResponse(
      res,
      202,
      true,
      "Quiz generation task queued successfully",
      { jobId: job.id },
    );
  } catch (error: any) {
    return sendResponse(
      res,
      500,
      false,
      "Failed to queue quiz generation",
      error.message,
    );
  }
};
export const getJobStatus = async (req: any, res: Response) => {
  const { jobId } = req.params;
  const userId = req.user?.id;

  if (!userId) {
    return sendResponse(res, 401, false, "Unauthorized");
  }

  try {
    const job = await quizQueue.getJob(String(jobId));

    if (!job) {
      return sendResponse(res, 404, false, "Job not found");
    }

    if (job.data.userId !== userId) {
      return sendResponse(res, 403, false, "Forbidden");
    }

    const state = await job.getState();

    return sendResponse(res, 200, true, "Job status fetched", {
      id: job.id,
      state,
      progress: job.progress,
      result: state === "completed" ? job.returnvalue : null,
      error: state === "failed" ? job.failedReason : null,
    });
  } catch (error: any) {
    return sendResponse(
      res,
      500,
      false,
      "Error fetching job status",
      error.message,
    );
  }
};
