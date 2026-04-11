import { Router } from "express";
import { getLeaderboard } from "../controller/leaderboardController";
import { isAuthenticated } from "../middleware/authMiddleware";

const router = Router();
router.get("/leader", isAuthenticated, getLeaderboard);
export default router;
