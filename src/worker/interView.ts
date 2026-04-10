import { Worker } from "bullmq";
import OpenAI from "openai";
import { prisma } from "../utils/prismaAdapter";
import { io } from "../utils/socket";

const openai = new OpenAI();

export const interviewWorker = new Worker(
  "interview-queue",
  async (job) => {
    const { interviewId, userInput } = job.data;

    // 1. Fetch Interview & State
    const interview = await prisma.interview.findUnique({
      where: { id: interviewId },
    });
    if (!interview) return;

    const history = await prisma.interviewChat.findMany({
      where: { interviewId },
      orderBy: { createdAt: "asc" },
    });

    // 2. Adaptive System Prompt
    const systemPrompt = `You are an elite AI Technical Interviewer for the role of ${interview.role}.
    Current Difficulty Level: ${interview.currentLevel}/5.

    ## YOUR GOAL
    Evaluate the candidate's last answer and provide the next question.
    If the candidate answers excellently, the difficulty will increase. If they struggle, it will decrease.

    ## COMMANDS
    - OPEN_EDITOR: Use this if you want the candidate to write code.
    - END_INTERVIEW: Use this if the session is complete.

    ## RESPONSE FORMAT
    You MUST respond with a valid JSON object:
    {
      "evaluation": "Short feedback on previous answer",
      "score": number (1-10),
      "topic": "Specific technical topic (e.g. React Hooks, Pointers)",
      "question": "Your next question",
      "command": "NONE" | "OPEN_EDITOR" | "END_INTERVIEW",
      "codeSnippet": "Optional boilerplate if OPEN_EDITOR is used",
      "isFinalReport": boolean
    }

    If isFinalReport is true, include an additional "report" field with the full markdown evaluation table.`;

    // 3. Request JSON completion
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        ...history.flatMap((h) => [
          { role: "assistant", content: h.question },
          { role: "user", content: h.answer || "" },
        ]),
        { role: "user", content: userInput },
      ],
    });

    const data = JSON.parse(completion.choices[0].message.content || "{}");

    // 4. Adaptive Logic: Update Difficulty Level
    let newLevel = interview.currentLevel;
    if (data.score >= 8 && newLevel < 5) newLevel++;
    if (data.score <= 4 && newLevel > 1) newLevel--;

    await prisma.interview.update({
      where: { id: interviewId },
      data: { currentLevel: newLevel },
    });

    // 5. Text-to-Speech for the Question only
    const audioResponse = await openai.audio.speech.create({
      model: "tts-1",
      voice: "alloy",
      input: data.question,
    });
    const audioBuffer = Buffer.from(await audioResponse.arrayBuffer());

    // 6. Emit Structured Data to Frontend
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

    // 7. Save to DB with Topic and Score
    if (data.isFinalReport) {
      await prisma.interview.update({
        where: { id: interviewId },
        data: {
          status: "COMPLETED",
          totalScore: data.score,
          feedback: data.report,
        },
      });
      io.to(interviewId).emit("interview-complete", { report: data.report });
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
  { connection: { host: "localhost", port: 6379, maxRetriesPerRequest: null } },
);
