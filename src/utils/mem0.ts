// utils/mem0Client.ts
// Mem0 memory layer for AI Interviewer
// Docs: https://docs.mem0.ai/platform/quickstart

import MemoryClient from "mem0ai";

if (!process.env.MEM0_API_KEY) {
  throw new Error("MEM0_API_KEY is not set in environment variables");
}

export const mem0 = new MemoryClient({ apiKey: process.env.MEM0_API_KEY });

// ─── Types ──────────────────────────────────────────────────────────────────

export interface InterviewMemory {
  userId: string; // candidate's userId (stable across sessions)
  interviewId: string; // current interview session id
  role: string;
}

export interface MemoryMessage {
  role: "user" | "assistant";
  content: string;
}

// ─── Write: store a turn into mem0 ──────────────────────────────────────────

/**
 * Persist a single interview turn (question + answer) to mem0.
 * Mem0 auto-extracts facts (skills mentioned, weak areas, score signals, etc.)
 * and stores them as searchable memories for this candidate.
 */
export async function saveInterviewTurn(
  messages: MemoryMessage[],
  ctx: InterviewMemory,
): Promise<void> {
  try {
    await mem0.add(messages, {
      user_id: ctx.userId,
      run_id: ctx.interviewId, // scopes to this session
      metadata: {
        role: ctx.role,
        source: "ai-interviewer",
      },
    });
  } catch (err) {
    // Non-fatal — log and continue. Memory failure shouldn't kill the interview.
    console.warn("[mem0] saveInterviewTurn failed:", err);
  }
}

// ─── Read: retrieve relevant past memories for this candidate ────────────────

/**
 * Retrieve relevant memories for a candidate before starting/continuing
 * an interview. Use these to personalize follow-up questions and avoid
 * re-asking things the candidate already covered in past sessions.
 *
 * Returns a formatted string ready to inject into the system prompt.
 */
export async function getCandidateMemories(
  userId: string,
  role: string,
): Promise<string> {
  try {
    const results = await mem0.search(
      `Interview candidate memories for ${role} role`,
      {
        user_id: userId,
        limit: 10,
      },
    );

    if (!results || results.length === 0) {
      return "No prior interview history found for this candidate.";
    }

    const formatted = results
      .map((m: any, i: number) => `${i + 1}. ${m.memory}`)
      .join("\n");

    return `### Candidate Memory (from previous sessions)\n${formatted}`;
  } catch (err) {
    console.warn("[mem0] getCandidateMemories failed:", err);
    return "";
  }
}

// ─── Read: get all memories for a session (for final report) ────────────────

/**
 * Fetch all memories stored during a specific interview session.
 * Used to enrich the final report with longitudinal candidate insights.
 */
export async function getSessionMemories(
  userId: string,
  interviewId: string,
): Promise<string> {
  try {
    const results = await mem0.getAll({
      user_id: userId,
      run_id: interviewId,
    });

    if (!results || results.length === 0) return "";

    const formatted = (results as any[])
      .map((m: any, i: number) => `- ${m.memory}`)
      .join("\n");

    return `### Session Memory Insights\n${formatted}`;
  } catch (err) {
    console.warn("[mem0] getSessionMemories failed:", err);
    return "";
  }
}

// ─── Write: store final interview outcome ───────────────────────────────────

/**
 * After interview ends, store the final outcome as a durable memory.
 * This helps future interviews reference past performance.
 */
export async function saveFinalOutcome(
  userId: string,
  interviewId: string,
  role: string,
  totalScore: number,
  recommendation: string,
): Promise<void> {
  try {
    await mem0.add(
      [
        {
          role: "assistant",
          content: `Candidate completed a ${role} interview (session: ${interviewId}).
Overall score: ${totalScore}/10. Recommendation: ${recommendation}.
Completed at: ${new Date().toISOString()}.`,
        },
      ],
      {
        user_id: userId,
        metadata: {
          type: "final_outcome",
          role,
          totalScore,
          recommendation,
          interviewId,
        },
      },
    );
  } catch (err) {
    console.warn("[mem0] saveFinalOutcome failed:", err);
  }
}
