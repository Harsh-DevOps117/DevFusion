import { Request, Response, NextFunction } from "express";
import { prisma } from "../utils/prismaAdapter";  

export const checkUsage = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user?.id;

    
    if (!userId) {
      return res.status(401).json({
        error: "Unauthorized: User not found in request",
      });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return res.status(404).json({
        error: "User not found",
      });
    }

    
    if (user.plan === "PRO" || user.role === "ADMIN") {
      return next();
    }

     
    if ((user as any).credits <= 0) {
      return res.status(403).json({
        error: "Free limit reached. Upgrade to PRO ",
      });
    }

     const updatedUser = await prisma.user.update({
      where: {
        id: userId,
      },
      data: {
        credits: {
          decrement: 1,
        },
      },
    });

     if ((updatedUser as any).credits < 0) {
      return res.status(403).json({
        error: "Usage limit exceeded",
      });
    }

    next();
  } catch (error) {
    console.error("checkUsage error:", error);

    return res.status(500).json({
      error: "Internal server error",
    });
  }
};