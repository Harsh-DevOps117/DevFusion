import { Router } from "express";
import {
  getAnalysisStatus,
  startResumeAnalysis,
} from "../controller/resumeController";
import { resumeUpload } from "../utils/multer";

const router = Router();

router.post("/analyze", resumeUpload.single("file"), startResumeAnalysis);
router.get("/status/:jobId", getAnalysisStatus);

export default router;
