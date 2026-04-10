import { Router } from "express";
import { createProblem, getAllProblems, getAllProblemSolvedByUser, getProblemById } from "../controller/problemController";
import { isAuthenticated } from "../middleware/authMiddleware";

const router=Router()

router.post("/create-problem",isAuthenticated,createProblem)
router.get("/get-all-problems",isAuthenticated,getAllProblems)
router.get("/get-problem/:id",isAuthenticated,getProblemById)
router.get("/get-solved-problems",isAuthenticated,getAllProblemSolvedByUser)

export default router