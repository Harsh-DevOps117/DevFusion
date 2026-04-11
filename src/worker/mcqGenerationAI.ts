import { Job, Worker } from "bullmq";
import dotenv from "dotenv";
import Redis from "ioredis";
import OpenAI from "openai";
import path from "path";

dotenv.config({
  path: path.resolve(__dirname, "../../.env"),
});

const difficultyMap: Record<string, "Easy" | "Medium" | "Hard"> = {
  easy: "Easy",
  intermediate: "Medium", // Map 'intermediate' to 'Medium'
  medium: "Medium",
  hard: "Hard",
};

import { prisma } from "../utils/prismaAdapter";

console.log(process.env.DATABASE_URL);
console.log("🧑‍💼 Worker started...");

const openai = new OpenAI();
const connection = new Redis({
  host: "localhost",
  port: 6379,
  maxRetriesPerRequest: null,
});

const worker = new Worker(
  "quiz-generation",
  async (job: Job) => {
    const { userId, topic, difficulty } = job.data;

    await job.updateProgress(10);
    const prompt = `
Generate a ${difficulty} quiz about ${topic}.

IMPORTANT:
- Respond ONLY in valid JSON format.
- Do NOT include any text outside JSON.
- The response MUST be a JSON object.

Format:
{
  "questions": [
    {
      "question": "string",
      "options": ["string", "string", "string", "string"],
      "correctAnswer": "string",
      "explanation": "string"
    }
  ]
}
`;
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "You must respond strictly in JSON format only.",
        },
        {
          role: "user",
          content: `
                Generate a 10 ${difficulty} quiz about ${topic}.
                Return the response in JSON.
                The response must be valid JSON with this structure:

              {
                "questions": [
                {
                    "question": "string",
                    "options": ["string", "string", "string", "string"],
                    "correctAnswer": "string",
                    "explanation": "string"
                }
          ]
        }`,
        },
      ],
      response_format: { type: "json_object" },
    });
    console.log("🔥 JOB RECEIVED:", job.id);
    await job.updateProgress(50);
    const raw = completion.choices[0].message.content;
    if (!raw) throw new Error("Empty OpenAI response");
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error("Invalid JSON from OpenAI");
    }

    const questions = parsed.questions;
    const resolvedDifficulty =
      difficultyMap[difficulty.toLowerCase()] || "Medium";

    const quiz = await prisma.quiz.create({
      data: {
        userId,
        topic,
        difficulty: resolvedDifficulty,
        questions: {
          create: questions.map((q: any, index: number) => ({
            question: q.question,
            options: q.options,
            correctAnswer: q.correctAnswer,
            explanation: q.explanation,
            order: index + 1,
          })),
        },
      },
    });

    await job.updateProgress(100);

    return { quizId: quiz.id };
  },
  { connection },
);
