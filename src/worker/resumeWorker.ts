import { Job, Worker } from "bullmq";
import dotenv from "dotenv";
import fs from "fs";
import Redis from "ioredis";
import OpenAI from "openai";
import path from "path";

dotenv.config({
  path: path.resolve(__dirname, "../../.env"),
});

const openai = new OpenAI();
const connection = new Redis({
  host: process.env.REDIS_HOST || "redis",
  port: Number(process.env.REDIS_PORT) || 6379,
  maxRetriesPerRequest: null,
});

export const resumeWorker = new Worker(
  "resume-analysis",
  async (job: Job) => {
    const { filePath, extractedText, targetRole, intent } = job.data;

    const systemPrompt = `
      You are a high-end ATS (Applicant Tracking System) Expert and Career Strategist.
      Analyze the resume for the role: "${targetRole}" with intent: "${intent}".

      ### RULES:
      1. Provide a realistic ATS score (0-100) based on industry standards.
      2. Suggest 3-5 job titles the user is currently qualified for.
      3. Return ONLY a JSON object.

      ### OUTPUT EXAMPLE:
      {
        "overallScore": 72,
        "roleMatchPercentage": 65,
        "pivotAdvice": "Your background in sales is a great asset for client-facing roles, but for a Pivot into Software Engineering, you must emphasize your JavaScript projects over your sales targets.",
        "missingSkills": ["React Context API", "Node.js Streams", "Docker Containerization"],
        "actionPlan": ["Complete a full-stack project", "Get AWS Cloud Practitioner certification", "Rewrite summary to focus on technical problem solving"],
        "suggestedJobTitles": ["Junior Full Stack Developer", "Technical Support Engineer", "Implementation Specialist"],
        "atsAnalysis": {
           "formattingScore": 85,
           "keywordDensity": 40,
           "sectionClarity": 90,
           "impactBulletPoints": 55
        },
        "industryInsights": "The tech market currently values specialized dev-ops knowledge even in entry-level frontend roles."
      }
    `;

    try {
      await job.updateProgress(15);
      let userContent: any[] = [];

      if (filePath && fs.existsSync(filePath)) {
        const imageBuffer = fs.readFileSync(filePath);
        const base64Image = imageBuffer.toString("base64");
        userContent = [
          {
            type: "text",
            text: "Analyze this resume image based on the provided system instructions.",
          },
          {
            type: "image_url",
            image_url: { url: `data:image/jpeg;base64,${base64Image}` },
          },
        ];
      } else {
        userContent = [
          {
            type: "text",
            text: `Analyze this resume text:\n\n${extractedText}`,
          },
        ];
      }

      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent },
        ],
        response_format: { type: "json_object" },
      });

      const result = JSON.parse(completion.choices[0].message.content || "{}");

      if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);

      await job.updateProgress(100);
      return result;
    } catch (err: any) {
      if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
      throw err;
    }
  },
  {
    connection,
    concurrency: 5,
    removeOnComplete: { count: 50 },
    removeOnFail: { count: 100 },
  },
);
