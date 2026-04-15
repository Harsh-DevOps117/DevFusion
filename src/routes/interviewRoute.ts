import { Router } from "express";
import {
  handleUserResponse,
  startInterview,
} from "../controller/interViewcontroller";

import { getAnalytics } from "../controller/interviewAnalystController";
import {checkUsage} from "../middleware/checkUsage"

const router = Router();

router.post("/start",checkUsage, startInterview);
router.post("/respond", handleUserResponse);
router.get("/analytics/:interviewId", getAnalytics);

export default router;
