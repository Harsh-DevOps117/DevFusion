import { getLanguageName, pollBatchResults, submitBatch } from "../utils/judge0";
import logger from "../utils/logger";
import { prisma } from "../utils/prismaAdapter";
import type { Request,Response } from "express";

export const executeCode = async (req: Request, res: Response) => {
  try {
    const {
      source_code,
      language_id,
      stdin,
      expected_outputs,
      problemId,
    } = req.body;

    const userId =req.user?.id as string

     if (
      !Array.isArray(stdin) ||
      stdin.length === 0 ||
      !Array.isArray(expected_outputs) ||
      expected_outputs.length !== stdin.length
    ) {
      return res.status(400).json({
        error: "Invalid or Missing test Cases",
      });
    }

     const submissions = stdin.map((input) => ({
      source_code,
      language_id,
      stdin: input,
    }));

     const submitResponse = await submitBatch(submissions);

    const tokens = submitResponse.map((r: any) => r.token);

     const results = await pollBatchResults(tokens);

    console.log("Raw Results:", results);

     let allPassed = true;

    const detailedResults = results.map((result: any, i: number) => {
       if (!result || !result.status) {
        console.error("Invalid result:", result);

        allPassed = false;

        return {
          testCase: i + 1,
          passed: false,
          stdout: null,
          expected: expected_outputs[i]?.trim(),
          stderr: "Invalid Judge0 response",
          compile_output: null,
          status: "Error",
          memory: undefined,
          time: undefined,
        };
      }

      const stdout = result.stdout?.trim();
      const expected = expected_outputs[i]?.trim();

      const passed = stdout === expected;

      if (!passed) allPassed = false;

      return {
        testCase: i + 1,
        passed,
        stdout,
        expected,
        stderr: result.stderr || null,
        compile_output: result.compile_output || null,
        status: result.status.description,
        memory: result.memory ? `${result.memory} KB` : undefined,
        time: result.time ? `${result.time} s` : undefined,
      };
    });

    console.log("Detailed:", detailedResults);

     const submission = await prisma.submission.create({
      data: {
        userId,
        problemId,
        sourceCode: source_code,
        language: getLanguageName(language_id),
        stdin: stdin.join("\n"),
        stdout: JSON.stringify(detailedResults.map((r:any) => r.stdout)),
        stderr: detailedResults.some((r:any) => r.stderr)
          ? JSON.stringify(detailedResults.map((r:any) => r.stderr))
          : null,
        compileOutput: detailedResults.some((r:any) => r.compile_output)
          ? JSON.stringify(detailedResults.map((r:any) => r.compile_output))
          : null,
        status: allPassed ? "Accepted" : "Wrong Answer",
        memory: detailedResults.some((r:any) => r.memory)
          ? JSON.stringify(detailedResults.map((r:any) => r.memory))
          : null,
        time: detailedResults.some((r:any) => r.time)
          ? JSON.stringify(detailedResults.map((r:any) => r.time))
          : null,
      },
    });

     if (allPassed) {
      await prisma.problemSolved.upsert({
        where: {
          userId_problemId: {
            userId,
            problemId,
          },
        },
        update: {},
        create: {
          userId,
          problemId,
        },
      });
    }

     const testCaseResults = detailedResults.map((r:any) => ({
      submissionId: submission.id,
      passed: r.passed,
      stdout: r.stdout,
      expected: r.expected,
      status: r.status,
    }));

    await prisma.testCaseResult.createMany({
      data: testCaseResults,
    });

     const finalSubmission = await prisma.submission.findUnique({
      where: { id: submission.id },
      include: {
        testResults: true,  
      },
    });

    return res.status(200).json({
      success: true,
      message: "Code Executed Successfully!",
      submission: finalSubmission,
    });
  } catch (error: any) {
    logger.error("Execution Error:", error.message);

    return res.status(500).json({
      error: "Failed to execute code",
    });
  }
};