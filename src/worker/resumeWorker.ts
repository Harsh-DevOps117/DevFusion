import { Job, Worker } from "bullmq";
import fs from "fs";
import Redis from "ioredis";
import OpenAI from "openai";
import pdf from "pdf-parse";

const connection = new Redis(
  process.env.REDIS_URL || "redis://localhost:6379",
  {
    maxRetriesPerRequest: null,
  },
);

const openai = new OpenAI();

export const resumeWorker = new Worker(
  "resume-analysis",
  async (job: Job) => {
    // 🛡️ Destructure the new intent-based fields
    const { filePath, fileType, targetRole, intent } = job.data;
    let extractedText = "";

    try {
      await job.updateProgress(10);

      // 📄 Text Extraction
      if (fileType === "application/pdf") {
        const dataBuffer = fs.readFileSync(filePath);
        const pdfData = await pdf(dataBuffer);
        extractedText = pdfData.text;
      } else {
        extractedText = "TEXT_EXTRACTION_STUB"; // You can add Vision OCR here
      }

      await job.updateProgress(40);

      // 🧠 AI CONSULTANT PROMPT
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `You are a Career Strategist. The user wants to ${intent} their career into a ${targetRole} role.
            Analyze their resume text against this goal.
            Return ONLY a JSON object:
            {
              "overallScore": number,
              "roleMatchPercentage": number,
              "missingSkills": string[],
              "pivotAdvice": string,
              "actionPlan": string[],
              "keywordsFound": string[]
            }`,
          },
          {
            role: "user",
            content: `Target Role: ${targetRole}\nIntent: ${intent}\n\nResume Content:\n${extractedText}`,
          },
        ],
        response_format: { type: "json_object" },
      });

      const analysisResult = JSON.parse(
        completion.choices[0].message.content || "{}",
      );

      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

      await job.updateProgress(100);
      return analysisResult;
    } catch (err: any) {
      if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
      throw err;
    }
  },
  { connection, concurrency: 5 },
);
