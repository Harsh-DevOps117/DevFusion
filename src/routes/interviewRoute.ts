import { Router } from "express";
import {
  handleUserResponse,
  startInterview,
} from "../controller/interViewcontroller";

import { getAnalytics } from "../controller/interviewAnalystController";

const router = Router();

router.post("/start", startInterview);
router.post("/respond", handleUserResponse);
router.get("/analytics/:interviewId", getAnalytics);

export default router;
