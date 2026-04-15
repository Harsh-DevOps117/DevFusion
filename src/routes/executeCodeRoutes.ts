import { Router } from "express";
import { executeCode } from "../controller/executeCodeController";
 
import {checkUsage} from "../middleware/checkUsage"


const router=Router()


router.post("/execute-code",checkUsage,executeCode)

export default router