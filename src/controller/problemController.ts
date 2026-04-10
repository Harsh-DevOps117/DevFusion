import { getJudge0LanguageId, pollBatchResults, submitBatch } from "../utils/judge0";
import logger from "../utils/logger";
import { prisma } from "../utils/prismaAdapter";
import type { Request,Response } from "express";
 

export const createProblem = async (req: Request, res: Response) => {
    const {
        title,
        description,
        difficulty,
        tags,
        examples,
        constraints,
        testcases,
        codeSnippets,
        referenceSolutions,
    } = req.body;

    try {

        if (!referenceSolutions || Object.keys(referenceSolutions).length === 0) {
            return res.status(400).json({
                error: "Reference solutions are required",
            });
        }

        if (!testcases || testcases.length === 0) {
            return res.status(400).json({
                error: "Testcases are required",
            });
        }


        for (const [language, solutionCode] of Object.entries(referenceSolutions)) {
            const languageId = getJudge0LanguageId(language);

            if (!languageId) {
                return res.status(400).json({
                    error: `Language ${language} is not supported`,
                });
            }

            const submissions = testcases.map(({ input, output }: any) => ({
                source_code: solutionCode,
                language_id: languageId,
                stdin: input,
                expected_output: output,
            }));


            const submissionResults = await submitBatch(submissions);

            if (!submissionResults || submissionResults.length === 0) {
                return res.status(500).json({
                    error: "Failed to submit to Judge0",
                });
            }

            const tokens: string[] = submissionResults.map((res: any) => res.token);


            const results = await pollBatchResults(tokens);

            if (!results || results.length === 0) {
                return res.status(500).json({
                    error: "No results returned from Judge0",
                });
            }


            for (let i = 0; i < results.length; i++) {
                const result = results[i];

                if (!result || !result.status) {
                    logger.error("Bad result:", result);
                    continue;  
                }

                if (result.status.id !== 3) {
                    return res.status(400).json({
                        error: `Testcase ${i + 1} failed`,
                    });
                }
            }
        }


        const newProblem = await prisma.problem.create({
            data: {
                title,
                description,
                difficulty,
                tags,
                examples,
                constraints,
                testcases,
                codeSnippets,
                referenceSolutions,
                userId:req.user?.id,
            },
        });

        return res.status(201).json({
            success: true,
            message: "Problem created successfully",
            problem: newProblem,
        });
    } catch (error) {
        logger.error("Create Problem Error:", error);

        return res.status(500).json({
            error: "Error while creating Problem",
        });
    }
};

export const getAllProblems=async (req:Request,res:Response)=>{
    console.log("hi")
    try {
        const problems=await prisma.problem.findMany()
        if(!problems){
            return res.status(404).json({
                error:"No problem found"
            })
        }
        res.status(200).json({
            success: true,
            message: "Problems fetched successfully",
            problems,
        });
    } catch (error) {
        logger.error(error)
        return res.status(500).json({
            error:"error while fetching problem"
        })
    }
}

export const getProblemById=async (req:Request,res:Response)=>{
    const {id}=req.params
    if(typeof id!="string"){
        return res.status(400).json({
            message:"Invalid problem id"
        })
    }
    try {
        const problem=await prisma.problem.findUnique({
            where:{
                id
            }
        })

        return res.status(200).json(({
            success:true,
            message:"problem fetched",
            problem
        }))
    } catch (error) {
        logger.error(error)
        res.status(500).json({
            error:"error while fetching"
        })
    }
}

export const getAllProblemSolvedByUser = async (req: Request, res: Response) => {
  try {
    const problems = await prisma.problem.findMany({
      where: {
        solvedBy: {
          some: {
            userId: req.user?.id,
          },
        },
      },
      include: {
        solvedBy: {
          where: {
            userId: req.user?.id,
          },
        },
      },
    });

    if (problems.length === 0) {
      return res.status(404).json({
        message: "No problem solved yet",
      });
    }

    res.status(200).json({
      success: true,
      message: "problems fetched",
      problems,
    });
  } catch (error) {
    logger.error(error);
    res.status(500).json({
      error: "failed to fetch problems",
    });
  }
};