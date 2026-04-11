import { Router } from "express";
import { authorize, isAuthenticated } from "../middleware/authMiddleware";
import { getAllSubmission, getAllSubmissionForProblem, getSubmissionForProblem } from "../controller/submisisonController";

const router=Router()


router.get("/get-all-submission",authorize("USER","ADMIN"),isAuthenticated,getAllSubmission)
router.get("/get-submission/:problemId",authorize("USER","ADMIN"),isAuthenticated,getSubmissionForProblem)
router.get("/get-submission-count/:problemId",authorize("USER","ADMIN"),isAuthenticated,getAllSubmissionForProblem)

export default router