import type { NextFunction, Request, Response } from "express";
import jwt, { JwtPayload } from "jsonwebtoken";
import { prisma } from "../utils/prismaAdapter";
import { UserRole } from "../../generated/prisma/enums";

export const isAuthenticated = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const secret = process.env.JWT_SECRET;

    if (!secret) {
      console.error("AUTH_ERROR: JWT secrets are missing in .env");
      return res
        .status(500)
        .json({ success: false, message: "Server configuration error" });
    }
    let token = req.cookies?.refreshToken;

    if (!token) {
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith("Bearer ")) {
        token = authHeader.split(" ")[1]?.trim();
      }
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Authentication token missing. Please login again.",
      });
    }
    const decoded = jwt.verify(token, secret) as JwtPayload;
    if (!decoded || typeof decoded !== "object" || !decoded.id) {
      console.log("AUTH_ERROR: Token payload is missing 'id'", decoded);
      return res.status(401).json({
        success: false,
        message: "Invalid token payload",
      });
    }
    const userId = decoded.id as string;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        role: true,
      },
    });

    if (!user) {
      console.log(
        `AUTH_ERROR: User ID ${userId} from token not found in Postgres`,
      );
      return res.status(401).json({
        success: false,
        message: "User no longer exists",
      });
    }

    req.user = {
      id: user.id,
      email: user.email,
      role: user.role,
    };

    console.log(`AUTH_SUCCESS: User ${user.email} authenticated`);
    return next();
  } catch (error: any) {
    if (error.name === "TokenExpiredError") {
      return res.status(401).json({ success: false, message: "Token expired" });
    }

    if (error.name === "JsonWebTokenError") {
      console.log("AUTH_ERROR: JWT Signature Mismatch. Check your Secrets!");
      return res
        .status(401)
        .json({ success: false, message: "Invalid token structure" });
    }

    console.error("INTERNAL_AUTH_ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Authentication failed",
    });
  }
};


export const authorize = (...allowedRoles: UserRole[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Not authenticated",
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: "Forbidden: insufficient permissions",
      });
    }

    next();
  };
};

