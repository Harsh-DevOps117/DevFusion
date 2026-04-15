import { Router } from "express";
import { generateQuiz, getJobStatus } from "../controller/quizController";
import {checkUsage} from "../middleware/checkUsage"

const router = Router();

router.post("/generate",checkUsage, generateQuiz);
router.get("/status/:jobId", getJobStatus);

export default router;
