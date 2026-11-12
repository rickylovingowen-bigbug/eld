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

/** Interviewer filler. These are not a refused point, even when they sit in the previous reply. */
const GENERIC_WORDS = new Set([
  "thank",
  "thanks",
  "telling",
  "tell",
  "told",
  "course",
  "please",
  "sorry",
  "okay",
  "fine",
  "else",
  "instead",
  "leave",
  "saved",
  "words",
  "share",
  "shared",
  "remember",
  "clearly",
  "picture",
  "something",
  "would",
  "like",
  "talk",
  "much",
  "people",
  "really",
  "just",
  "one",
  "small",
  "thing",
  "most",
  "time",
  "today",
  "here",
  "there",
  "let",
  "lets",
  "going",
  "keep",
  "stop",
  "switch",
  "another",
  "topic",
  "story",
  "book",
  "between",
  "stays",
  "got",
  "all",
  "can",
  "cant",
  "see",
  "doing",
  "know",
  "start",
  "back",
  "then",
  "lot",
  "come",
  "comes",
  "mind",
  "years",
  "those",
  "from",
]);

export function contentWords(phrase: string): string[] {
  return phrase
    .toLowerCase()
    .replace(/[^a-z0-9'\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length >= 3 && !STOP_WORDS.has(word));
}

export function distinctiveWords(phrase: string): string[] {
  return contentWords(phrase).filter((word) => !GENERIC_WORDS.has(word));
}

/** The question the elder just heard, without a thank-you preamble. */
export function questionSentence(text: string): string {
  const mark = text.search(/[?\uFF1F]/);
  if (mark === -1) return text.trim();
  const upTo = text.slice(0, mark + 1);
  const parts = upTo.split(/(?<=[.!])\s+/);
  return (parts[parts.length - 1] ?? upTo).trim();
}

function isStoredQuestion(point: string): boolean {
  return /[?\uFF1F]/.test(point) || distinctiveWords(point).length >= 6;
}

export function mentionsRefusedPoint(reply: string, points: string[]): string | null {
  for (const point of points) {
    if (!point.trim()) continue;
    if (isStoredQuestion(point)) {
      if (reasksQuestion(reply, point)) return point;
    } else if (shortPointHit(reply, point)) {
      return point;
    }
  }
  return null;
}

function shortPointHit(reply: string, point: string): boolean {
  const words = distinctiveWords(point);
  if (words.length === 0) return false;
  const hits = words.filter((word) => new RegExp(`\\b${escapeRegExp(word)}\\b`, "i").test(reply));
  if (words.length === 1) return hits.length === 1;
  return hits.length >= Math.ceil(words.length * 0.5);
}

/** Same question, or a close paraphrase: most of its distinctive words show up again. */
function reasksQuestion(reply: string, declined: string): boolean {
  const asked = normalizeQuestion(questionSentence(reply));
  const prior = normalizeQuestion(questionSentence(declined));
  if (asked && prior && (asked === prior || (asked.length > 24 && prior.length > 24 && (asked.includes(prior) || prior.includes(asked))))) {
    return true;
  }
  const askedWords = distinctiveWords(questionSentence(reply));
  const priorWords = distinctiveWords(questionSentence(declined));
  if (priorWords.length === 0 || askedWords.length === 0) return false;
  const priorSet = new Set(priorWords);
  const overlap = askedWords.filter((word) => priorSet.has(word));
  if (priorWords.length === 1) return overlap.length === 1;
  return overlap.length >= 2 && overlap.length / priorWords.length >= 0.5;
}

function normalizeQuestion(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
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

const REFUSAL_REDIRECTS = [
  "Of course. Thank you for telling me that much. Would you like to talk about something else from this time?",
  "Of course. We can leave that there. What would you like to talk about instead?",
  "Of course. We can leave that there. What else from those years comes to mind?",
];

const FALLBACK_QUESTIONS = [
  "What do you remember most clearly about that?",
  "What would you like to talk about instead?",
  "What else from those years comes to mind?",
];

export function safeRefusalTemplate(points: string[]): string {
  return REFUSAL_REDIRECTS.find((text) => !mentionsRefusedPoint(text, points)) ?? REFUSAL_REDIRECTS[REFUSAL_REDIRECTS.length - 1]!;
}

export function fallbackQuestion(points: string[], expectQuestion: boolean): string {
  if (!expectQuestion) return "Thank you for telling me all of this. Your words are saved.";
  return FALLBACK_QUESTIONS.find((text) => !mentionsRefusedPoint(text, points)) ?? FALLBACK_QUESTIONS[FALLBACK_QUESTIONS.length - 1]!;
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

/** First "I don't remember" on this topic: reassure, then one easy sensory hook. */
export const DONT_REMEMBER_FIRST =
  "That's okay, a lot of people don't. Anything you can picture, even a smell?";

/** Said again, or said with feeling: reassure only, then offer to switch. No new hook. */
export const DONT_REMEMBER_SWITCH = "That's okay. Would you like to switch to another topic?";

export function acknowledgesDoNotWrite(text: string): boolean {
  return /stays between us|won'?t go in the book|will not put that in|not going in the book|leave that out of the book/i.test(
    text,
  );
}

/**
 * One short acknowledgement, then the same follow-up. Do-not-write does not
 * replace the question or move off the point.
 */
export function withDoNotWriteAck(text: string): string {
  const trimmed = text.trim();
  const body = acknowledgesDoNotWrite(trimmed) ? trimmed : `${BETWEEN_US} ${trimmed}`.trim();
  return enforceOneQuestion(body).text;
}

const STEER_AWAY =
  /\b(something else|another topic|switch to|talk about instead|leave that|leave this|we can leave|what else from those years|what would you like to talk about)\b/i;

/** The reply changed the subject instead of staying with what the elder just said. */
export function steersAway(reply: string): boolean {
  return STEER_AWAY.test(reply);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
