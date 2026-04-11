import crypto from "crypto";
import { Request, Response } from "express";
import { prisma } from "../utils/prismaAdapter";
import { razorpayInstance } from "../utils/razorpay";

export const createOrder = async (req: Request, res: Response) => {
  try {
    const { amount } = req.body;
    const userId = req.user?.id as string;

    const order = await razorpayInstance.orders.create({
      amount: amount * 100,
      currency: "INR",
      receipt: `receipt_${Date.now()}`,
    });

    await prisma.payment.create({
      data: {
        userId,
        amount: Number(amount),
        currency: "INR",
        status: "CREATED",
        providerId: order.id,
      },
    });

    return res.json({
      success: true,
      order,
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      success: false,
      message: "Order creation failed",
    });
  }
};

export const verifyPayment = async (req: Request, res: Response) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } =
      req.body;

    const userId = req.user?.id as string;

    const body = razorpay_order_id + "|" + razorpay_payment_id;

    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET!)
      .update(body)
      .digest("hex");

    if (expectedSignature !== razorpay_signature) {
      return res.status(400).json({
        success: false,
        message: "Invalid signature",
      });
    }

    await prisma.payment.update({
      where: {
        providerId: razorpay_order_id,
      },
      data: {
        status: "SUCCESS",
      },
    });

    await prisma.user.update({
      where: { id: userId },
      data: {
        plan: "PRO",
      },
    });

    return res.json({
      success: true,
      message: "Payment successful",
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Verification failed",
    });
  }
};
