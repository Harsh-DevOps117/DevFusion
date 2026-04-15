import { Job, Worker } from "bullmq";
import dotenv from "dotenv";
import Redis from "ioredis";
import OpenAI from "openai";
import path from "path";
import { prisma } from "../utils/prismaAdapter";

dotenv.config({
  path: path.resolve(__dirname, "../../.env"),
});

const difficultyMap: Record<string, "Easy" | "Medium" | "Hard"> = {
  easy: "Easy",
  intermediate: "Medium",
  medium: "Medium",
  hard: "Hard",
};

console.log("🧑‍💼 Quiz Worker started...");

const openai = new OpenAI();
const connection = new Redis({
  host: process.env.REDIS_HOST || "redis",
  port: Number(process.env.REDIS_PORT) || 6379,
  maxRetriesPerRequest: null,
});

// ─── Prompt Builder ───────────────────────────────────────────────────────────

function buildPrompt(topic: string, difficulty: string): string {
  const difficultyRules =
    difficulty === "easy"
      ? `EASY RULES:
- Test basic definitions and surface-level facts only
- Options must be clearly distinct (no trick wording)
- Correct answer should be recognizable to a complete beginner
- Wrong options should be plausible but obviously wrong to anyone with basic knowledge
- Example style: "What does HTML stand for?" / "Which keyword declares a variable in JavaScript?"`
      : difficulty === "medium"
        ? `MEDIUM RULES:
- Test conceptual understanding, NOT just definitions
- At least 2 wrong options must look tempting / partially correct
- Questions must require understanding WHY, not just WHAT
- Include scenario-based or "what happens when..." style questions
- NO questions answerable by pure memorization alone
- Example style: "What is the output of this code snippet?" / "Which approach is more efficient and why?"`
        : `HARD RULES:
- Test deep expertise, edge cases, and non-obvious behavior
- ALL 3 wrong options must look fully plausible to an intermediate-level person
- Questions must involve trade-offs, subtle bugs, performance nuances, or advanced internals
- Use code snippets, edge cases, gotchas, and "which of these is NOT true" formats
- Zero questions should be answerable by a beginner or intermediate learner
- Include at least 3 questions with short code snippets
- Example style: "What is the time complexity of X given constraint Y?" / "What does this code output and why?" / "Which subtle bug exists here?"`;

  return `
You are a rigorous quiz master with deep expertise in "${topic}".
Generate exactly 10 ${difficulty.toUpperCase()} difficulty questions about "${topic}".

## DIFFICULTY CONTRACT
${difficultyRules}

## UNIVERSAL QUALITY RULES
- Every question must test a DISTINCT concept — zero overlap between questions
- Distractors (wrong answers) must be carefully crafted:
    → Easy: wrong but obviously so to anyone with basic knowledge
    → Medium: wrong but tempting if you half-understand the topic
    → Hard: wrong in subtle ways that only experts catch
- Explanations must be 2–3 sentences: state WHY the correct answer is right,
  then explain why the most tempting wrong answer is actually incorrect
- Options must always be exactly 4
- correctAnswer must be the EXACT string from the options array (copy-paste it)
- Do NOT prefix options with "A)", "B)", "1.", etc.
- No filler or trivial questions — every question must make the reader think

## TOPIC COVERAGE
Spread questions across different sub-topics within "${topic}".
Do not ask 3 questions about the same concept.

## OUTPUT FORMAT
Respond ONLY with valid JSON. No markdown fences, no backticks, no text outside JSON.

{
  "questions": [
    {
      "question": "string",
      "options": ["string", "string", "string", "string"],
      "correctAnswer": "string (must match one option exactly)",
      "explanation": "string (2-3 sentences: why correct + why top distractor is wrong)"
    }
  ]
}`.trim();
}

// ─── Validator ────────────────────────────────────────────────────────────────

function validateQuestions(questions: any[]): void {
  if (!Array.isArray(questions) || questions.length === 0) {
    throw new Error("No questions returned from OpenAI");
  }

  questions.forEach((q, i) => {
    if (!q.question)
      throw new Error(`Question ${i + 1} missing "question" field`);
    if (!Array.isArray(q.options) || q.options.length !== 4)
      throw new Error(`Question ${i + 1} must have exactly 4 options`);
    if (!q.correctAnswer)
      throw new Error(`Question ${i + 1} missing "correctAnswer"`);
    if (!q.options.includes(q.correctAnswer))
      throw new Error(
        `Question ${i + 1}: correctAnswer "${q.correctAnswer}" not found in options`,
      );
    if (!q.explanation)
      throw new Error(`Question ${i + 1} missing "explanation"`);
  });
}

// ─── Worker ───────────────────────────────────────────────────────────────────

const worker = new Worker(
  "quiz-generation",
  async (job: Job) => {
    const { userId, topic, difficulty } = job.data;
    const normalizedDifficulty = difficulty.toLowerCase();

    console.log(
      `🔥 JOB ${job.id} | topic: "${topic}" | difficulty: "${difficulty}"`,
    );

    await job.updateProgress(10);

    // 1. Build and send prompt
    const prompt = buildPrompt(topic, normalizedDifficulty);

    const completion = await openai.chat.completions.create({
      model: "gpt-4o", // upgraded: mini struggles on hard questions
      response_format: { type: "json_object" },
      temperature: normalizedDifficulty === "hard" ? 0.9 : 0.7, // more creative on hard
      messages: [
        {
          role: "system",
          content:
            "You are a quiz generation engine. You respond ONLY with valid JSON matching the exact schema provided. No extra text, no markdown.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
    });

    await job.updateProgress(60);

    // 2. Parse
    const raw = completion.choices[0].message.content;
    if (!raw) throw new Error("Empty response from OpenAI");

    let parsed: { questions: any[] };
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error(`Invalid JSON from OpenAI: ${raw.slice(0, 200)}`);
    }

    // 3. Validate before touching the DB
    validateQuestions(parsed.questions);

    await job.updateProgress(80);

    // 4. Persist
    const resolvedDifficulty = difficultyMap[normalizedDifficulty] || "Medium";

    const quiz = await prisma.quiz.create({
      data: {
        userId,
        topic,
        difficulty: resolvedDifficulty,
        questions: {
          create: parsed.questions.map((q: any, index: number) => ({
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
    console.log(
      `✅ Quiz ${quiz.id} created — ${parsed.questions.length} questions`,
    );

    return { quizId: quiz.id };
  },
  { connection },
);

// ─── Lifecycle Hooks ──────────────────────────────────────────────────────────

worker.on("completed", (job) => {
  console.log(
    `✅ Job ${job.id} completed → quizId: ${job.returnvalue?.quizId}`,
  );
});

worker.on("failed", (job, err) => {
  console.error(`❌ Job ${job?.id} failed:`, err.message);
});

worker.on("progress", (job, progress) => {
  console.log(`⏳ Job ${job.id} progress: ${progress}%`);
});
