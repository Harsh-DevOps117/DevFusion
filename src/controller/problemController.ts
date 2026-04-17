import type { Request, Response } from "express";
import {
  getJudge0LanguageId,
  pollBatchResults,
  submitBatch,
} from "../utils/judge0";
import logger from "../utils/logger";
import { prisma } from "../utils/prismaAdapter";
import { success } from "zod";
import Redis from "ioredis";

const redis = new Redis(process.env.REDIS_URL || "redis://redis:6379", {
  maxRetriesPerRequest: null,
});

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
      return res
        .status(400)
        .json({ error: "Reference solutions are required" });
    }

    // Cast testcases to any[] so .length and .map work under strict mode
    const tc = testcases as any[];

    if (!tc || tc.length === 0) {
      return res.status(400).json({ error: "Testcases are required" });
    }

    const normalize = (str: string) =>
      (str || "").trim().replace(/\r\n/g, "\n");

    const sortLines = (str: string) =>
      normalize(str)
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .sort()
        .join("\n");

    for (const [language, solutionCode] of Object.entries(referenceSolutions)) {
      const languageId = getJudge0LanguageId(language);

      if (!languageId) {
        return res
          .status(400)
          .json({ error: `Language ${language} is not supported` });
      }

      const submissions = tc.map(({ input, output }: any) => ({
        source_code: solutionCode,
        language_id: languageId,
        stdin: input,
        expected_output: output,
      }));

      const submissionResults = (await submitBatch(submissions)) as any[];

      if (!submissionResults || submissionResults.length === 0) {
        return res.status(500).json({ error: "Failed to submit to Judge0" });
      }

      const tokens: string[] = submissionResults.map((r: any) => r.token);

      const results = (await pollBatchResults(tokens)) as any[];

      if (!results || results.length === 0) {
        return res
          .status(500)
          .json({ error: "No results returned from Judge0" });
      }

      for (let i = 0; i < results.length; i++) {
        const result = results[i];

        if (!result || !result.status) {
          logger.error("Bad result:", result);
          continue;
        }

        const actualRaw = result.stdout || "";
        const expectedRaw = tc[i].output || "";

        const actual = normalize(actualRaw);
        const expected = normalize(expectedRaw);

        const actualSorted = sortLines(actual);
        const expectedSorted = sortLines(expected);

        if (actualSorted !== expectedSorted) {
          console.log("Testcase Failed");
          console.log("Language:", language);
          console.log("Input:", tc[i].input);
          console.log("Actual:", JSON.stringify(actual));
          console.log("Expected:", JSON.stringify(expected));

          return res.status(400).json({
            error: `Testcase ${i + 1} failed`,
            language,
            actual,
            expected,
          });
        }
      }
    }

    // Guard userId before passing to Prisma — strict mode won't allow string | undefined
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
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
        userId,
      },
    });
     
    await redis.del("problems:all");
    return res.status(201).json({
      success: true,
      message: "Problem created successfully",
      problem: newProblem,
    });
  } catch (error) {
    logger.error("Create Problem Error:", error);
    return res.status(500).json({ error: "Error while creating Problem" });
  }
};

export const getAllProblems = async (req: Request, res: Response) => {
  const cacheKey = "problems:all";

  try {
     const cached = await redis.get(cacheKey);
    if (cached) {
      return res.status(200).json({
        success: true,
        message: "Problems fetched (Cache)",
        problems: JSON.parse(cached),
      });
    }

    const problems = await prisma.problem.findMany({
      orderBy: { createdAt: "desc" },
    });

    await redis.setex(cacheKey, 3600, JSON.stringify(problems));

    return res.status(200).json({
      success: true,
      message: "Problems fetched (DB)",
      problems,
    });
  } catch (error) {
    logger.error(error);
    return res.status(500).json({ error: "error while fetching problem" });
  }
};

export const getProblemById = async (req: Request, res: Response) => {
  const { id } = req.params;
  if (typeof id !== "string") {
    return res.status(400).json({ message: "Invalid problem id" });
  }
  try {
    const problem = await prisma.problem.findUnique({ where: { id } });
    return res.status(200).json({
      success: true,
      message: "problem fetched",
      problem,
    });
  } catch (error) {
    logger.error(error);
    res.status(500).json({ error: "error while fetching" });
  }
};

export const getAllProblemSolvedByUser = async (
  req: Request,
  res: Response,
) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const problems = await prisma.problem.findMany({
      where: {
        solvedBy: {
          some: { userId },
        },
      },
      include: {
        solvedBy: {
          where: { userId },
        },
      },
    });

    if (problems.length === 0) {
      return res.status(404).json({ message: "No problem solved yet" });
    }

    res.status(200).json({
      success: true,
      message: "problems fetched",
      problems,
    });
  } catch (error) {
    logger.error(error);
    res.status(500).json({ error: "failed to fetch problems" });
  }
};

export const deleteProblemById=async (req:Request,res:Response)=>{
 try {
   const {id} =req.params
  if(typeof(id)!="string"){
    return res.status(401).json({
      message:"invalid id"
    })
  }

  const problem=await prisma.problem.delete({
    where:{
      id:id
    }
  })

  if(!problem){
    return res.status(404).json({
      message:"problem not found"
    })
  }
  await redis.del("problems:all");

  res.status(200).json({
    message:"Problem deleted"
  })
 } catch (error) {
  console.log(error)
  res.status(500).json({
    message:"internal server error"
  })
 }
}