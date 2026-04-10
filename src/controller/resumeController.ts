import { Request, Response } from "express";
import path from "path";
import { resumeQueue } from "../queue/resumeQueue";

/**
 * UNIVERSAL CONTROLLER: Handles Image (Multer) or PDF Text (JSON)
 */
export const startResumeAnalysis = async (req: any, res: Response) => {
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
    // Add the job with explicit persistence settings
    const job = await resumeQueue.add(
      "resume-analysis", // Ensure this matches your worker's task name
      {
        userId,
        targetRole,
        intent,
        filePath: file ? path.resolve(file.path) : null,
        extractedText: extractedText || null,
        fileType: file ? file.mimetype : "application/pdf",
      },
      {
        // KEEP THE JOB IN REDIS SO WE CAN POLL IT
        removeOnComplete: {
          age: 3600, // Keep for 1 hour after finishing
          count: 100, // Keep last 100 jobs
        },
        removeOnFail: {
          age: 86400, // Keep for 24 hours on failure
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

/**
 * POLLING CONTROLLER: Checks job status
 */
export const getAnalysisStatus = async (req: Request, res: Response) => {
  const { jobId } = req.params;

  // Debug: Confirm the request is hitting this controller
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
