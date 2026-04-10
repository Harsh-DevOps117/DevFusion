import { Router } from "express";
import { getUserFullProfile } from "../controller/userdataController";
import { isAuthenticated } from "../middleware/authMiddleware";

const router = Router();
router.get("/profile", isAuthenticated, getUserFullProfile);

export default router;
