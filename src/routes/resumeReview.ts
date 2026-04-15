import { Router } from "express";
import {
  getAnalysisStatus,
  startResumeAnalysis,
} from "../controller/resumeController";
import { resumeUpload } from "../utils/multer";
import {checkUsage} from "../middleware/checkUsage"

const router = Router();

router.post("/analyze",checkUsage, resumeUpload.single("file"), startResumeAnalysis);
router.get("/status/:jobId", getAnalysisStatus);

export default router;
