import { Router } from "express";
import { login, logout, refresh, signup } from "../controller/authController";
import { sendOTP, verifyOTPAndReset } from "../controller/otpReset";

const router = Router();

router.post("/signup", signup);
router.post("/login", login);
router.post("/logout", logout);
router.post("/refresh", refresh);
router.post("/forgot-password", sendOTP);
router.post("/reset-password", verifyOTPAndReset);

export default router;
