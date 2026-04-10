import { Request, Response } from "express";
import { EmailParams, MailerSend, Recipient, Sender } from "mailersend";
import { prisma } from "../utils/prismaAdapter";
import redisClient from "../utils/redisClient";

const mailerSend = new MailerSend({ apiKey: process.env.MAILERSEND_API_KEY! });

export const sendOTP = async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const { randomBytes } = require("crypto");
    const otpBuffer = await randomBytes(4);
    const otp = otpBuffer.toString("hex");
    // 3. Store in Redis with a 5-minute TTL (120 seconds)
    // Key format: "otp:email_address"
    await redisClient.set(`otp:${email}`, otp, {
      EX: 120,
    });

    const sentFrom = new Sender(
      "MS_1o4Tap@test-r6ke4n1qeymgon12.mlsender.net",
      "PrepGrid Support",
    );
    const recipients = [new Recipient(email, user.name || "Developer")];
    const emailParams = new EmailParams()
      .setFrom(sentFrom)
      .setTo(recipients)
      .setSubject("Your PrepGrid Reset Code").setHtml(`
        <style>
          h1 {
            font-family: sans-serif;
            font-size: 2rem;
            font-weight: bold;
            color: #333;
          }
          p {
            font-family: sans-serif;
            font-size: 1rem;
            color: #666;
            margin-top: 0.5rem;
          }
        </style>
        <h1>${otp}</h1>
        <p>This code expires in 2 minutes.</p>
      `);

    await mailerSend.email.send(emailParams);

    res.status(200).json({
      success: true,
      message: "OTP sent to email",
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

export const verifyOTPAndReset = async (req: Request, res: Response) => {
  const { email, otp, newPassword } = req.body;
  const cachedOtp = await redisClient.get(`otp:${email}`);

  if (!cachedOtp || cachedOtp !== otp) {
    return res.status(400).json({
      success: false,
      message: "Invalid or expired OTP",
    });
  }
  // If valid, update Prisma and clear cache
  // (Assuming you've hashed the password here)
  await prisma.user.update({
    where: { email },
    data: { password: newPassword },
  });

  await redisClient.del(`otp:${email}`);

  res.status(200).json({
    message: "Password updated!",
  });
};
