import { Router } from "express";
import { generateQuiz, getJobStatus } from "../controller/quizController";

const router = Router();

router.post("/generate", generateQuiz);
router.get("/status/:jobId", getJobStatus);

export default router;
