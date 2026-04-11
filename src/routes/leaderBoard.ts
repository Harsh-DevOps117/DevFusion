import { Router } from "express";
import { getLeaderboard } from "../controller/leaderboardController";

const router = Router();
router.get("/leader", getLeaderboard);
export default router;
