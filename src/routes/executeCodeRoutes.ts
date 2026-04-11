import { Router } from "express";
import { executeCode } from "../controller/executeCodeController";
import { isAuthenticated } from "../middleware/authMiddleware";

const router=Router()


router.post("/execute-code",executeCode)

export default router