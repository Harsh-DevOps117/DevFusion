import { Router } from "express";
import { createOrder, verifyPayment } from "../controller/paymentController";

const router = Router();

router.post("/create-order", createOrder);
router.post("/verify-payment", verifyPayment);

export default router;