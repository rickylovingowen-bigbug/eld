const QUESTION_MARK = /[?\uFF1F]/g;

const STOP_WORDS = new Set([
  "that",
  "this",
  "about",
  "your",
  "with",
  "from",
  "they",
  "them",
  "have",
  "what",
  "when",
  "where",
  "would",
  "could",
  "should",
  "there",
  "their",
  "just",
  "like",
  "into",
  "something",
  "rather",
  "talk",
  "dont",
  "want",
  "really",
  "much",
  "back",
  "then",
  "them",
  "were",
  "was",
  "did",
  "the",
  "and",
  "for",
  "you",
  "lot",
]);

export function countQuestions(text: string): number {
  return text.match(QUESTION_MARK)?.length ?? 0;
}

export function contentWords(phrase: string): string[] {
  return phrase
    .toLowerCase()
    .replace(/[^a-z0-9'\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length >= 3 && !STOP_WORDS.has(word));
}

export function mentionsRefusedPoint(reply: string, points: string[]): string | null {
  const haystack = reply.toLowerCase();
  for (const point of points) {
    const words = contentWords(point);
    const hit = words.find((word) => new RegExp(`\\b${escapeRegExp(word)}\\b`, "i").test(haystack));
    if (hit) return point;
  }
  return null;
}

export function isCompoundQuestion(text: string): boolean {
  const mark = text.search(/[?\uFF1F]/);
  const question = mark === -1 ? text : text.slice(0, mark);
  return /\b(what|who|where|when|why|how)\b.+\b(and|or)\b.+\b(what|who|where|when|why|how)\b/i.test(question);
}

/** A yes/no question that supplies a new concrete detail ("Was the kitchen yellow?"). */
export function isLeading(text: string): boolean {
  const mark = text.search(/[?\uFF1F]/);
  const upToQuestion = mark === -1 ? text : text.slice(0, mark + 1);
  const sentence = upToQuestion.split(/(?<=[.!])\s+/).pop() ?? upToQuestion;
  const startsYesNo =
    /^(was|were|did|is|are|wasn't|weren't|didn't|isn't|aren't)\b/i.test(sentence.trim());
  if (!startsYesNo) return false;
  return /\b(yellow|red|blue|green|white|black|brown|pink|purple|big|small|happy|sad|cold|hot|\d{3,4}|nineteen|fifty|sixty)\b/i.test(
    sentence,
  );
}

export interface ReplyProblem {
  code: "multiple_questions" | "compound_question" | "leading_question" | "refused_point" | "missing_question";
}

export function replyProblem(text: string, refusedPoints: string[]): ReplyProblem | null {
  if (countQuestions(text) > 1) return { code: "multiple_questions" };
  if (isCompoundQuestion(text)) return { code: "compound_question" };
  if (isLeading(text)) return { code: "leading_question" };
  if (mentionsRefusedPoint(text, refusedPoints)) return { code: "refused_point" };
  if (countQuestions(text) === 0) return { code: "missing_question" };
  return null;
}

export function enforceOneQuestion(text: string): { text: string; trimmed: boolean } {
  const trimmedText = text.trim();
  if (countQuestions(trimmedText) <= 1) return { text: trimmedText, trimmed: false };
  const index = trimmedText.search(/[?\uFF1F]/);
  return { text: trimmedText.slice(0, index + 1).trim(), trimmed: true };
}

export function safeRefusalTemplate(points: string[]): string {
  const warm =
    "Of course. Thank you for telling me that much. Would you like to talk about something else from this time?";
  if (!mentionsRefusedPoint(warm, points)) return warm;
  return "Of course. We can leave that there. What would you like to talk about instead?";
}

export function fallbackQuestion(points: string[], expectQuestion: boolean): string {
  if (!expectQuestion) return "Thank you for telling me all of this. Your words are saved.";
  const open = "What do you remember most clearly about that?";
  if (!mentionsRefusedPoint(open, points)) return open;
  return "What would you like to talk about instead?";
}

export const STOP_TEMPLATE = "Thank you for telling me all of this. Your words are saved.";

export const DISTRESS_TEMPLATE =
  "I'm sorry this is painful. Would you like to keep going, switch to something lighter, or stop for today?";

export const CAP_TEMPLATE =
  "You've shared a lot here. Would you like to keep going on this, or save the story for now?";

export const DO_NOT_WRITE_TEMPLATE =
  "I can stop bringing this up. Should I leave this topic out of your book?";

export const MARKED_DO_NOT_WRITE_TEMPLATE =
  "I won't ask about that again. Your words are saved.";

export const FREE_OPENER = "What would you like to tell me about?";

export const BETWEEN_US = "Got it, that stays between us.";

export const DONT_REMEMBER_TEMPLATE =
  "That's completely fine. Want to try a different one, or call it a day?";

export function acknowledgesDoNotWrite(text: string): boolean {
  return /stays between us|won'?t go in the book|will not put that in|not going in the book|leave that out of the book/i.test(
    text,
  );
}

/** One-sentence acknowledgement, then whatever question remains. */
export function withDoNotWriteAck(text: string, refusedPoints: string[]): string {
  const body = acknowledgesDoNotWrite(text) ? text.trim() : `${BETWEEN_US} ${text.trim()}`.trim();
  const one = enforceOneQuestion(body).text;
  if (countQuestions(one) === 1 && !mentionsRefusedPoint(one, refusedPoints)) return one;
  const question = fallbackQuestion(refusedPoints, true);
  const combined = `${BETWEEN_US} ${question}`;
  return enforceOneQuestion(combined).text;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
