import type { Request,Response } from "express"
import { prisma } from "../utils/prismaAdapter"
import { success } from "zod"
import logger from "../utils/logger"


//get all submissions fppr a specific user
export const getAllSubmission=async (req:Request,res:Response)=>{
    try {
        const userId=req.user?.id

        const submissions=await prisma.submission.findMany({
            where:{
                userId
            }
        })

        res.status(200).json({
            success:true,
            message:"Problems solve by you",
            submissions
        })
    } catch (error) {
        console.log(error)
        res.status(500).json({
            message:"failed to fetch submissions"
        })
    }
}


//get submissions of a user for a specific user
export const getSubmissionForProblem=async (req:Request,res:Response)=>{
    try {
        const userId=req.user?.id
        const problemId=req.params.problemId as string
        const submissions=await prisma.submission.findMany({
            where:{
                userId,
                problemId
            }
        })

        res.status(200).json({
            success:true,
            message:"Submisisons for the problem fetched",
            submissions
        })
    } catch (error) {
        logger.error("Error fetching submissions for problem:", error);
        res.status(500).json({ error: "Failed to fetch submissions" });
    }
}


//get total submision for a problem (by all users)
export const getAllSubmissionForProblem = async (req:Request, res:Response) => {
    try {
        const problemId = req.params.problemId;
        
        if (typeof problemId!="string"){
            return res.status(400).json({
                message:"Invalid  problemid"
            })
        }

        const count = await prisma.submission.count({
            where: { problemId }
        });

        res.status(200).json({
            success: true,
            message: "Submission count fetched successfully",
            count
        });
    } catch (error) {
        logger.error("Error fetching submission count:", error);
        res.status(500).json({ error: "Failed to fetch submission count" });
    }
};