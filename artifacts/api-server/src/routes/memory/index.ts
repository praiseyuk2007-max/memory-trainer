import { Router, type IRouter } from "express";
import { GoogleGenAI } from "@google/genai";
import { desc, lte, eq, sql } from "drizzle-orm";
import { db, sessionsTable } from "@workspace/db";
import {
  GenerateContentBody,
  GenerateQuestionsBody,
  EvaluateAnswersBody,
  SaveSessionBody,
  GetSessionParams,
  DeleteSessionParams,
} from "@workspace/api-zod";
import { logger } from "../../lib/logger";

const router: IRouter = Router();

function getAI() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");
  return new GoogleGenAI({ apiKey });
}

const MODEL = "gemini-2.0-flash-lite";
const MAX_TOKENS = 1024;

// GET /memory/sessions
router.get("/memory/sessions", async (_req, res): Promise<void> => {
  const sessions = await db
    .select()
    .from(sessionsTable)
    .orderBy(desc(sessionsTable.createdAt))
    .limit(50);
  res.json(sessions);
});

// GET /memory/sessions/due
router.get("/memory/sessions/due", async (_req, res): Promise<void> => {
  const now = new Date();
  const due = await db
    .select()
    .from(sessionsTable)
    .where(lte(sessionsTable.nextReviewAt, now))
    .orderBy(sessionsTable.nextReviewAt)
    .limit(20);
  res.json(due);
});

// GET /memory/stats
router.get("/memory/stats", async (_req, res): Promise<void> => {
  const now = new Date();
  const [totalsRow] = await db
    .select({
      totalSessions: sql<number>`count(*)::int`,
      averageScore: sql<number>`round(avg(score)::numeric, 1)`,
      topicsStudied: sql<number>`count(distinct topic)::int`,
      dueForReview: sql<number>`count(*) filter (where next_review_at <= ${now})::int`,
    })
    .from(sessionsTable);

  const recentSessions = await db
    .select()
    .from(sessionsTable)
    .orderBy(desc(sessionsTable.createdAt))
    .limit(5);

  res.json({
    totalSessions: totalsRow?.totalSessions ?? 0,
    averageScore: totalsRow?.averageScore ?? 0,
    topicsStudied: totalsRow?.topicsStudied ?? 0,
    dueForReview: totalsRow?.dueForReview ?? 0,
    recentSessions,
  });
});

// GET /memory/sessions/:id
router.get("/memory/sessions/:id", async (req, res): Promise<void> => {
  const parsed = GetSessionParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [session] = await db
    .select()
    .from(sessionsTable)
    .where(eq(sessionsTable.id, parsed.data.id));
  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }
  res.json(session);
});

// DELETE /memory/sessions/:id
router.delete("/memory/sessions/:id", async (req, res): Promise<void> => {
  const parsed = DeleteSessionParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [deleted] = await db
    .delete(sessionsTable)
    .where(eq(sessionsTable.id, parsed.data.id))
    .returning();
  if (!deleted) {
    res.status(404).json({ error: "Session not found" });
    return;
  }
  res.sendStatus(204);
});

// POST /memory/generate-content
router.post("/memory/generate-content", async (req, res): Promise<void> => {
  const parsed = GenerateContentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { topic, difficulty } = parsed.data;

  const difficultyNote =
    difficulty === "easy"
      ? "Use very simple language. Explain like the reader is 14 years old."
      : difficulty === "hard"
      ? "Use precise academic language. Include nuances, edge cases, and technical depth."
      : "Use clear, structured academic language suitable for a university student.";

  const prompt = `You are a concise academic tutor. Explain the topic: "${topic}".
${difficultyNote}
Write 6-10 sentences only. Structure: definition → key concepts → real-world relevance.
Use only widely accepted facts. If uncertain about a detail, say "I am not certain".
Do NOT use bullet points. Write in flowing paragraphs.`;

  try {
    const ai = getAI();
    const result = await ai.models.generateContent({
      model: MODEL,
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: { maxOutputTokens: MAX_TOKENS },
    });
    const content = result.text ?? "";
    res.json({ content });
  } catch (err) {
    logger.error({ err }, "Error generating content");
    res.status(500).json({ error: "Failed to generate content" });
  }
});

// POST /memory/generate-questions
router.post("/memory/generate-questions", async (req, res): Promise<void> => {
  const parsed = GenerateQuestionsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { topic, difficulty, content } = parsed.data;

  const count = difficulty === "easy" ? 3 : difficulty === "hard" ? 5 : 4;
  const style =
    difficulty === "easy"
      ? "broad and conceptual"
      : difficulty === "hard"
      ? "specific, analytical, and challenging"
      : "open-ended and thought-provoking";

  const prompt = `Based on this explanation of "${topic}":
---
${content.slice(0, 800)}
---
Generate exactly ${count} ${style} recall questions.
Rules: open-ended only, no multiple choice, no yes/no, no sub-questions.
Return ONLY a JSON array of strings. No other text. Example: ["Q1?","Q2?"]`;

  try {
    const ai = getAI();
    const result = await ai.models.generateContent({
      model: MODEL,
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: {
        maxOutputTokens: 512,
        responseMimeType: "application/json",
      },
    });
    const raw = result.text ?? "[]";
    const questions: string[] = JSON.parse(raw);
    res.json({ questions });
  } catch (err) {
    logger.error({ err }, "Error generating questions");
    res.status(500).json({ error: "Failed to generate questions" });
  }
});

// POST /memory/evaluate
router.post("/memory/evaluate", async (req, res): Promise<void> => {
  const parsed = EvaluateAnswersBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { topic, content, questions, answers, writtenAnswer, difficulty } = parsed.data;

  const qaBlock = questions
    .map((q, i) => `Q${i + 1}: ${q}\nA${i + 1}: ${answers[i] ?? "(no answer)"}`)
    .join("\n");

  const prompt = `You are a strict but fair memory coach evaluating a student's understanding of: "${topic}".

Reference explanation (do not reveal this to student):
${content.slice(0, 600)}

Student's Q&A:
${qaBlock}

Student's written summary:
"${writtenAnswer}"

Evaluate and return ONLY valid JSON with these fields:
- score: integer 0-10 (10 = perfect understanding)
- feedback: string (2-3 sentence overall assessment in Feynman style — explain simply what they got right/wrong)
- feynmanExplanation: string (1-2 sentence re-explanation of the core concept in the simplest possible terms)
- weakPoints: string[] (list of specific gaps, max 3 items, empty array if none)
- improvements: string[] (actionable suggestions, max 3 items)
- nextDifficulty: "${difficulty === "easy" ? "normal" : difficulty === "hard" ? "hard" : "normal"}" or adjust based on score (score>=8 increase, score<=4 decrease)

Scoring guide: 8-10=strong recall, 5-7=partial understanding, 0-4=needs review.
Return ONLY the JSON object. No markdown, no explanation.`;

  try {
    const ai = getAI();
    const result = await ai.models.generateContent({
      model: MODEL,
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: {
        maxOutputTokens: 800,
        responseMimeType: "application/json",
      },
    });
    const raw = result.text ?? "{}";
    const evaluation = JSON.parse(raw);
    res.json(evaluation);
  } catch (err) {
    logger.error({ err }, "Error evaluating answers");
    res.status(500).json({ error: "Failed to evaluate answers" });
  }
});

// POST /memory/save-session
router.post("/memory/save-session", async (req, res): Promise<void> => {
  const parsed = SaveSessionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { topic, score, difficulty, writtenAnswer, feedback, weakPoints } = parsed.data;

  // Spaced repetition schedule
  let daysUntilReview = 1;
  if (score >= 8) daysUntilReview = 7;
  else if (score >= 5) daysUntilReview = 2;
  else daysUntilReview = 1;

  const nextReviewAt = new Date();
  nextReviewAt.setDate(nextReviewAt.getDate() + daysUntilReview);

  const [session] = await db
    .insert(sessionsTable)
    .values({
      topic,
      score,
      difficulty,
      writtenAnswer: writtenAnswer ?? null,
      feedback: feedback ?? null,
      weakPoints: weakPoints ?? null,
      nextReviewAt,
    })
    .returning();

  res.status(201).json(session);
});

export default router;
