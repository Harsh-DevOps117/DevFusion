import { Router } from "express";
import { createProblem, getAllProblems, getAllProblemSolvedByUser, getProblemById } from "../controller/problemController";
import { authorize, isAuthenticated } from "../middleware/authMiddleware";

const router=Router()

router.post("/create-problem",authorize("ADMIN"),createProblem)
router.get("/get-all-problems",authorize("USER","ADMIN"),getAllProblems)
router.get("/get-problem/:id",authorize("USER","ADMIN"),getProblemById)
router.get("/get-solved-problems",authorize("USER","ADMIN"),getAllProblemSolvedByUser)

export default router