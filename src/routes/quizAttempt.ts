import { Router } from "express";
import {
  getAttempts,
  getQuiz,
  getReview,
  submitQuiz,
} from "../controller/getQuizController";

const router = Router();

router.get("/:id", getQuiz);
router.post("/submit", submitQuiz);
router.get("/review/:attemptId", getReview);
router.get("/:id/attempts", getAttempts);

export default router;
