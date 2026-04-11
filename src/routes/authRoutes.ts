import { Router } from "express";
import { getAdminStats, login, logout, refresh, signup } from "../controller/authController";
import { sendOTP, verifyOTPAndReset } from "../controller/otpReset";
import { authorize, isAuthenticated } from "../middleware/authMiddleware";
import { UserRole } from "../../generated/prisma/enums";

const router = Router();

router.post("/signup", signup);
router.post("/login", login);
router.post("/logout", logout);
router.post("/refresh", refresh);
router.post("/forgot-password", sendOTP);
router.post("/reset-password", verifyOTPAndReset);
router.get("/stats",isAuthenticated,authorize(UserRole.ADMIN),getAdminStats)

export default router;
