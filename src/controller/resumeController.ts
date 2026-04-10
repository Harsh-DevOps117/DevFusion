import { Request, Response } from "express";
import { resumeQueue } from "../queue/resumeQueue";
import path from "path";

export const startResumeAnalysis = async (req: any, res: Response) => {
  const file = req.file;
  const userId = req.user?.id;

  if (!file) {
    return res
      .status(400)
      .json({ success: false, message: "Please upload a resume file." });
  }

  try {
    const job = await resumeQueue.add("resume-analysis-task", {
      userId,
      filePath: path.resolve(file.path),
      fileType: file.mimetype,
      originalName: file.originalname,
    });

    return res.status(202).json({
      success: true,
      message: "Resume upload successful. Analysis started.",
      data: { jobId: job.id },
    });
  } catch (error: any) {
    return res
      .status(500)
      .json({ success: false, message: "Queue error", error: error.message });
  }
};

export const getAnalysisStatus = async (req: Request, res: Response) => {
  const { jobId } = req.params;
  const job = await resumeQueue.getJob(jobId);

  if (!job)
    return res.status(404).json({ success: false, message: "Job not found" });

  const state = await job.getState();
  return res.status(200).json({
    success: true,
    data: {
      id: job.id,
      state,
      progress: job.progress,
      result: state === "completed" ? job.returnvalue : null,
      error: state === "failed" ? job.failedReason : null,
    },
  });
};
