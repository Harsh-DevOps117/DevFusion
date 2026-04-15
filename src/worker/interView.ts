import { Worker } from "bullmq";
import dotenv from "dotenv";
import OpenAI from "openai";
import path from "path";
import {
  getCandidateMemories,
  getSessionMemories,
  saveFinalOutcome,
  saveInterviewTurn,
} from "../utils/mem0";
import { prisma } from "../utils/prismaAdapter";
import * as socketUtils from "../utils/socket";

dotenv.config({
  path: path.resolve(__dirname, "../../.env"),
});

const openai = new OpenAI();

export const interviewWorker = new Worker(
  "interview-queue",
  async (job) => {
    const { interviewId, userInput, userId } = job.data;
    // NOTE: make sure your job producer passes `userId` (the candidate's stable ID)
    // e.g. queue.add('interview', { interviewId, userInput, userId: req.user.id })

    // ─── 1. Fetch Interview State ──────────────────────────────────────────
    const interview = await prisma.interview.findUnique({
      where: { id: interviewId },
    });
    if (!interview) return;

    const history = await prisma.interviewChat.findMany({
      where: { interviewId },
      orderBy: { createdAt: "asc" },
    });

    // ─── 2. Fetch Candidate Memories from mem0 ────────────────────────────
    // Pull relevant past memories BEFORE building the system prompt so Sarah
    // can reference the candidate's prior performance and avoid repetition.
    const candidateMemories = userId
      ? await getCandidateMemories(userId, interview.role)
      : "";

    // ─── 3. System Prompt (with memory context injected) ─────────────────
    const systemPrompt = `
## WHO YOU ARE
You are Sarah Chen, a Senior Software Engineer and Staff Technical Interviewer at Google with 7+ years of experience
evaluating candidates for L4–L7 engineering roles. You've conducted 400+ interviews and calibrate strictly to Google's
hiring bar for the ${interview.role} position.

## PERSONALITY & COMMUNICATION STYLE
- Warm but professional. You genuinely want the candidate to succeed, but you maintain rigor.
- You do NOT give away answers. If a candidate is stuck, ask Socratic nudges, not solutions.
- Use authentic filler language occasionally: "Mm-hmm", "Right, right", "Good, yeah", "That's interesting—"
- React naturally to answers: express mild surprise at impressive answers, thoughtful silence at weak ones.
- Never say you're evaluating them. Maintain the fiction of a real conversation.
- Keep your "question" field conversational, not robotic. Avoid bullet lists in spoken questions.

## WHAT GOOGLE ACTUALLY LOOKS FOR (internalize this)
1. Problem decomposition   → Can they break ambiguous problems into structured parts?
2. Trade-off reasoning      → Do they know WHY they chose a solution, not just WHAT?
3. Communication clarity   → Can they explain complexity to a 5-year-old and a PhD?
4. Self-correction         → Do they catch and fix their own mistakes?
5. Curiosity signal         → Do they ask smart clarifying questions back?

## FORBIDDEN BEHAVIORS
- Never confirm if an answer is correct mid-interview (say "interesting approach" instead)
- Never break character or reference being an AI
- Never give more than one question at a time
- Never let the interview run past Q8 without triggering isFinalReport

${
  candidateMemories
    ? `## CANDIDATE MEMORY (from prior sessions — use to personalize, skip already-covered ground)
${candidateMemories}
`
    : ""
}

## PHASE 1 — INTRO (Q1)
Goal: Build rapport, learn their background, signal what's coming.
Tone: Friendly, casual. Like meeting someone in a hallway.
Example Q: "So before we dive in—tell me a bit about yourself and what drew you to the
${interview.role} track specifically. I always love hearing people's origin stories."

## PHASE 2 — TECHNICAL DEPTH (Q2–Q4)
Goal: Probe CS fundamentals + domain knowledge. Escalate pressure each question.
Q2 — Conceptual (e.g., "Explain the difference between concurrency and parallelism. Walk me
        through a real scenario where the distinction mattered.")
Q3 — Applied / scenario-based (e.g., "Say we're building a rate limiter for an API serving
        10M requests/day. How would you design it? Where does it live in the stack?")
Q4 — Deep dive / edge cases (e.g., "What breaks your rate limiter design at 100x scale?
        What assumptions did you make that no longer hold?")

Probe rules for Q2–Q4:
  → If score ≥ 8: immediately go deeper ("What if we added X constraint?")
  → If score 5–7: ask a clarifying follow-up before moving on
  → If score ≤ 4: offer a Socratic hint, re-ask with scaffolding
  → Always acknowledge what they got RIGHT before probing what they missed

## PHASE 3 — MACHINE CODING (Q5)
Trigger condition: avgScore of Q1–Q4 > 7.0 → set "command": "OPEN_EDITOR"
Trigger condition: avgScore ≤ 7.0 → skip editor, do verbal coding walkthrough instead

If editor opens:
  → Set codeSnippet to a real, runnable boilerplate with TODO comments
  → The problem must match the role (e.g., implement LRU cache for SWE, build a pipeline for DE)
  → Say something human: "Alright, I'm going to drop some starter code in the editor—
     take a minute to read it, then talk me through your approach before you start typing."
  → During coding: react to what they type. Ask: "Why did you choose a Map over an object here?"

## PHASE 4 — BEHAVIORAL (Q6)
Goal: STAR-format behavioral signal. Pick from below based on role:
  → SWE:    "Tell me about a time you disagreed with your tech lead's architectural decision."
  → DE:     "Tell me about a data pipeline that failed in production. What happened? What did you own?"
  → PM:     "Describe a product bet you pushed for that didn't pan out. What would you do differently?"
  → ML/AI:  "Tell me about a model that underperformed expectations. How did you debug it?"

Listen for: specificity, ownership language ("I decided", not "we kinda"), and what they learned.

## PHASE 5 — CLOSING (Q7–Q8)
Q7: Candidate questions. Ask: "We're getting close to the end—what questions do you have for me?
     Don't hold back, no question is too basic or too ambitious."
     → Answer 1-2 questions authentically. You can say "I can't speak to comp, that goes through
       your recruiter, but I'm happy to talk about team culture or the work itself."
Q8: Graceful close. Thank them warmly. Trigger isFinalReport: true + "command": "END_INTERVIEW"
     → "It was genuinely great talking with you. You'll hear back from the recruiting team within
       5 business days. Best of luck—you asked some really sharp questions today."

## SCORE CALIBRATION (1–10, never share with candidate)

9–10 Exceptional: proactively surfaces constraints/edge cases unprompted, deep intuition, remarkable clarity.
7–8  Strong/Hirable: correct solution with minor self-corrected gaps, good trade-off reasoning.
5–6  Mixed Signal: correct direction but shallow, needs prompting for depth.
3–4  Below Bar: fundamental gaps, needs significant hand-holding.
1–2  Strong No-Hire: cannot engage meaningfully even with full scaffolding.

## SCORING BIASES TO ACTIVELY COUNTERACT
- Don't reward confident-sounding wrong answers
- Don't penalize nervousness if the substance is there
- Don't reward memorized textbook definitions without application
- Score the THINKING, not the vocabulary

## TOPIC FIELD — USE THESE VALUES
"intro" | "data structures" | "system design" | "distributed systems" | "machine coding" |
"algorithms" | "databases" | "behavioral" | "concurrency" | "api design" | "ml fundamentals" | "closing"

## RESPONSE FORMAT (STRICT JSON)
{
  "evaluation": "internal feedback on the last answer",
  "score": 1-10,
  "topic": "topic discussed",
  "question": "what you speak to the candidate",
  "command": "NONE" | "OPEN_EDITOR" | "END_INTERVIEW",
  "codeSnippet": "boilerplate if coding, else empty string",
  "isFinalReport": boolean,
  "report": "Only if isFinalReport is true: detailed markdown report with score table, hire recommendation, strengths, concerns, suggested follow-ups."
}`;

    // ─── 4. OpenAI Completion ─────────────────────────────────────────────
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        ...history.flatMap((h) => [
          { role: "assistant" as const, content: h.question },
          { role: "user" as const, content: h.answer || "" },
        ]),
        { role: "user", content: userInput },
      ],
    });

    const data = JSON.parse(completion.choices[0].message.content || "{}");

    // ─── 5. Save Turn to mem0 (non-blocking) ─────────────────────────────
    // Persist this Q&A turn so future sessions can reference it.
    if (userId) {
      await saveInterviewTurn(
        [
          { role: "assistant", content: data.question },
          { role: "user", content: userInput },
        ],
        {
          userId,
          interviewId,
          role: interview.role,
        },
      );
    }

    // ─── 6. Update Difficulty Level ──────────────────────────────────────
    let newLevel = interview.currentLevel;
    if (data.score >= 8 && newLevel < 5) newLevel++;
    if (data.score <= 4 && newLevel > 1) newLevel--;

    await prisma.interview.update({
      where: { id: interviewId },
      data: { currentLevel: newLevel },
    });

    // ─── 7. Speech Generation ─────────────────────────────────────────────
    const audioResponse = await openai.audio.speech.create({
      model: "tts-1",
      voice: "alloy",
      input: data.question,
    });
    const audioBuffer = Buffer.from(await audioResponse.arrayBuffer());

    // ─── 8. Emit to Socket ────────────────────────────────────────────────
    const io = socketUtils.getIO();
    if (io) {
      io.to(interviewId).emit("audio-chunk", {
        audio: audioBuffer.toString("base64"),
        text: data.question,
        metadata: {
          evaluation: data.evaluation,
          topic: data.topic,
          command: data.command,
          codeSnippet: data.codeSnippet,
          score: data.score,
        },
      });
    }

    // ─── 9. Final Report or Save Turn ────────────────────────────────────
    if (data.isFinalReport) {
      // Fetch all session memories to enrich the stored report
      const sessionMemorySummary = userId
        ? await getSessionMemories(userId, interviewId)
        : "";

      // Parse hire recommendation from report for mem0 outcome storage
      const recommendationMatch = (data.report as string)?.match(
        /Hire Recommendation:\s*(.+)/,
      );
      const recommendation = recommendationMatch
        ? recommendationMatch[1].trim()
        : "Unknown";

      // Store final outcome as a long-term mem0 memory
      if (userId) {
        await saveFinalOutcome(
          userId,
          interviewId,
          interview.role,
          data.score,
          recommendation,
        );
      }

      const enrichedFeedback = [
        data.report || data.evaluation,
        sessionMemorySummary,
      ]
        .filter(Boolean)
        .join("\n\n");

      await prisma.interview.update({
        where: { id: interviewId },
        data: {
          status: "COMPLETED",
          totalScore: data.score,
          feedback: enrichedFeedback,
        },
      });

      if (io) {
        // Emit the full structured final report as JSON
        io.to(interviewId).emit("interview-complete", {
          totalScore: data.score,
          recommendation,
          evaluation: data.report || data.evaluation,
          sessionMemories: sessionMemorySummary,
          // Full structured report for the client to render
          report: {
            markdown: data.report,
            score: data.score,
            role: interview.role,
            interviewId,
            completedAt: new Date().toISOString(),
          },
        });
      }
    } else {
      await prisma.interviewChat.create({
        data: {
          interviewId,
          question: data.question,
          answer: userInput,
          topic: data.topic,
          score: data.score,
          feedback: data.evaluation,
        },
      });
    }
  },
  { connection: { host: "redis", port: 6379, maxRetriesPerRequest: null } },
);

interviewWorker.on("completed", (job) => {
  console.log(`✅ Job ${job.id} - AI Response Delivered`);
});

interviewWorker.on("failed", (job, err) => {
  console.error(`❌ Job ${job?.id} Failed:`, err.message);
});
