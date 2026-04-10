import { Router } from "express";
import { isAuthenticated } from "../middleware/authMiddleware";
import { getAllSubmission, getAllSubmissionForProblem, getSubmissionForProblem } from "../controller/submisisonController";

const router=Router()


router.get("/get-all-submission",isAuthenticated,getAllSubmission)
router.get("/get-submission/:problemId",isAuthenticated,getSubmissionForProblem)
router.get("/get-submission-count/:problemId",isAuthenticated,getAllSubmissionForProblem)

export default router