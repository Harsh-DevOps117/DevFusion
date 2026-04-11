import { Request, Response } from "express";
import path from "path";
import { resumeQueue } from "../queue/resumeQueue";

export const startResumeAnalysis = async (req: Request, res: Response) => {
  const file = req.file;
  const { extractedText, targetRole, intent } = req.body;
  const userId = req.user?.id;

  if (!file && !extractedText) {
    return res.status(400).json({
      success: false,
      message: "Analysis failed: No resume content detected.",
    });
  }

  try {
    const job = await resumeQueue.add(
      "resume-analysis",
      {
        userId,
        targetRole,
        intent,
        filePath: file ? path.resolve(file.path) : null,
        extractedText: extractedText || null,
        fileType: file ? file.mimetype : "application/pdf",
      },
      {
        removeOnComplete: {
          age: 3600,
          count: 100,
        },
        removeOnFail: {
          age: 86400,
        },
      },
    );

    console.log(`Job Created: ${job.id} for user ${userId}`);

    return res.status(202).json({
      success: true,
      message: "Resume analysis initiated successfully.",
      data: { jobId: job.id },
    });
  } catch (error: any) {
    console.error("Queueing Error:", error);
    return res.status(500).json({
      success: false,
      message: "System Error: Failed to queue the analysis task.",
      error: error.message,
    });
  }
};

export const getAnalysisStatus = async (req: Request, res: Response) => {
  const jobId = req.params.jobId as string;
  console.log(`Polling status for Job ID: ${jobId}`);

  try {
    const job = await resumeQueue.getJob(jobId);

    if (!job) {
      console.error(`Job ID ${jobId} not found in Redis.`);
      return res.status(404).json({
        success: false,
        message: `Job ${jobId} not found in queue. It may have expired or was never created.`,
      });
    }

    const state = await job.getState();
    const progress = job.progress;
    const result = state === "completed" ? job.returnvalue : null;
    const error = state === "failed" ? job.failedReason : null;

    return res.status(200).json({
      success: true,
      data: {
        id: job.id,
        state,
        progress,
        result,
        error,
      },
    });
  } catch (error: any) {
    console.error(`Status Check Error for Job ${jobId}:`, error);
    return res.status(500).json({
      success: false,
      message: "Internal server error during status check.",
    });
  }
};
