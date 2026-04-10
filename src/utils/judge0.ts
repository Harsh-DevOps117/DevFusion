import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

/* ---------------------------------- */
/* 🔧 Axios Instance (RapidAPI setup) */
/* ---------------------------------- */
export const judge0 = axios.create({
  baseURL: process.env.JUDGE0_API_URL,
  headers: {
    "X-RapidAPI-Key": process.env.RAPIDAPI_KEY!,
    "X-RapidAPI-Host": process.env.RAPIDAPI_HOST!,
    "Content-Type": "application/json",
  },
});

/* ---------------------------------- */
/* 🧠 Types */
/* ---------------------------------- */
type JudgeStatus = {
  id: number;
  description: string;
};

type JudgeResult = {
  token: string;
  status: JudgeStatus;
  stdout?: string;
  stderr?: string;
  compile_output?: string;
};

 
export const getJudge0LanguageId = (language: string): number | null => {
  const languageMap: Record<string, number> = {
    PYTHON: 71,
    JAVA: 62,
    JAVASCRIPT: 63,
    TYPESCRIPT: 74,
  };

  return languageMap[language.toUpperCase()] ?? null;
};
 
export const getLanguageName = (languageId: number): string => {
  const LANGUAGE_NAMES: Record<number, string> = {
    74: "TypeScript",
    63: "JavaScript",
    71: "Python",
    62: "Java",
  };

  return LANGUAGE_NAMES[languageId] ?? "Unknown";
};

 
const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));
 
export const submitBatch = async (submissions: any[]) => {
  try {
    const { data } = await judge0.post(
      "/submissions/batch",
      { submissions },
      {
        params: { base64_encoded: false },
      }
    );

    return data; // contains tokens
  } catch (error: any) {
    console.error("Submit Batch Error:", error.response?.data || error.message);
    throw new Error("Failed to submit batch");
  }
};
 
export const pollBatchResults = async (
  tokens: string[],
  maxAttempts = 20
) => {
  let attempts = 0;

  while (attempts < maxAttempts) {
    const { data } = await judge0.get("/submissions/batch", {
      params: {
        tokens: tokens.join(","),
        base64_encoded: false,
      },
    });

    const results = data.submissions;

    if (!results) {
      throw new Error("No submissions returned");
    }

   const isAllDone = results.every(
  (r: any) =>
    r &&
    r.status &&
    r.status.id !== 1 &&
    r.status.id !== 2
);

    if (isAllDone) return results;

    await new Promise((res) => setTimeout(res, 1000));
    attempts++;
  }

  throw new Error("Polling timeout exceeded");
};
 
export const executeCodeBatch = async (submissions: any[]) => {
   
  const submissionResponse = await submitBatch(submissions);

  const tokens: string[] = submissionResponse.map(
    (s: any) => s.token
  );

 
  const results = await pollBatchResults(tokens);

  return results;
};