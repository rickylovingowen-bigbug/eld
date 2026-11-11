import fs from "node:fs";
import path from "node:path";
import { loadChildhoodTopics } from "@/lib/config/catalog";
import { MockModelClient, type ModelClient } from "@/lib/ai/mock";
import { createModelClient, resolveAiMode } from "@/lib/ai/client";
import { avoidPointsForTurn, isDontRemember, isEmotionalGap } from "@/lib/conversation/classify";
import { isLeading, countQuestions } from "@/lib/conversation/guard";
import { scoreDoNotWriteHandled, scoreDontRemember, scoreShortAnswer } from "@/eval/rubric-score";
import { completeTurn, ingestUserMessage } from "@/lib/conversation/engine";
import { openConversation } from "@/lib/conversation/open";
import { mentionsRefusedPoint } from "@/lib/conversation/guard";
import { runWritingPipeline } from "@/lib/pipeline/run";
import { MemoryRepo } from "@/lib/repo/memory";
import type { Classification } from "@/lib/types";

const EVAL_USER = "33333333-3333-4333-8333-333333333333";

interface Gold extends Record<string, unknown> {
  refusal: boolean;
  refusal_scope: string;
  refused_point: string | null;
  off_topic_chapter: string | null;
  wants_to_stop: boolean;
  distress: string;
  answer_length: string;
  do_not_write?: boolean;
  do_not_write_scope?: string;
}

interface ClassifierCase {
  id: string;
  topic_id: string;
  last_question: string;
  user_message: string;
  gold: Gold;
  tags?: string[];
}

interface ScriptStep {
  id: string;
  when: string;
  sample_utterance?: string | string[];
  sample_messages?: string[];
  expected_classifier?: Gold;
  expected_classifier_messages?: Gold[];
  subjects?: string[];
  behavior?: string;
}

interface PersonaCase {
  id: string;
  review_status: string;
  topic_id: string;
  scenario_tags?: string[];
  persona: { name: string; delivery?: string; typing_style?: string | string[] };
  script: ScriptStep[];
}

const FIELDS = [
  "refusal",
  "refusal_scope",
  "refused_point",
  "off_topic_chapter",
  "wants_to_stop",
  "distress",
  "answer_length",
  "do_not_write",
  "do_not_write_scope",
] as const;

export interface EvalOptions {
  includeDraftsInBaseline: boolean;
  runClassifier: boolean;
  runPersonas: boolean;
  caseId?: string;
  judge: boolean;
  ai?: ModelClient;
}

export async function runEvalSet(options: EvalOptions): Promise<Record<string, unknown>> {
  const root = path.join(process.cwd(), "eval/v0.1");
  const ai = options.ai ?? (process.env.EVAL_FORCE_MOCK === "1" ? new MockModelClient() : createModelClient());
  const topics = loadChildhoodTopics();
  const topicName = new Map(topics.map((topic) => [topic.id, topic.title.en]));
  const summary: Record<string, unknown> = {
    mode: resolveAiMode(),
    judge: {
      dimension: "no_leading_detail",
      score: null,
      reason: null,
      model: "anthropic/claude-opus-5.5",
      status: options.judge ? "not_run_in_v0.1_mock" : "not_run",
      note: "Pass --judge with AI_MODE=live to fill the rubric E judge. The heuristic leading rate is scored in code.",
    },
  };

  if (options.runClassifier) {
    const cases = fs
      .readFileSync(path.join(root, "classifier-cases.jsonl"), "utf8")
      .split("\n")
      .filter((line) => line.trim())
      .map((line) => JSON.parse(line) as ClassifierCase);
    summary.classifier = await scoreClassifierCases(cases, ai, topicName);
  }

  if (options.runPersonas) {
    const file = JSON.parse(fs.readFileSync(path.join(root, "personas.json"), "utf8")) as { cases: PersonaCase[] };
    const selected = options.caseId ? file.cases.filter((item) => item.id === options.caseId) : file.cases;
    const conversations = [];
    for (const personaCase of selected) {
      conversations.push(await runPersona(personaCase, ai, topics));
    }
    summary.conversations = rollupConversations(conversations, options.includeDraftsInBaseline);
  }

  summary.writing = null;
  return summary;
}

async function scoreClassifierCases(
  cases: ClassifierCase[],
  ai: ModelClient,
  topicName: Map<string, string>,
): Promise<Record<string, unknown>> {
  const hits: Record<string, number> = Object.fromEntries(FIELDS.map((field) => [field, 0]));
  const totals: Record<string, number> = Object.fromEntries(FIELDS.map((field) => [field, 0]));
  let exact = 0;
  const confusion: Record<string, Record<string, number>> = {
    refusal: {},
    do_not_write: {},
    distress: {},
  };
  const rows = [];
  for (const item of cases) {
    const prompt = [
      `Topic: ${topicName.get(item.topic_id) ?? item.topic_id}`,
      `Last question: ${item.last_question || "(none)"}`,
      "Chapter ids: roots, childhood, school, work, love, service, home, faith, times, now",
      `User message: ${item.user_message}`,
    ].join("\n");
    const result = await ai.classify({ system: "classify", prompt });
    const predicted = toGold(result.classification);
    let all = true;
    for (const field of FIELDS) {
      if (!(field in item.gold)) continue;
      totals[field] = (totals[field] ?? 0) + 1;
      const ok = fieldsMatch(field, item.gold[field], predicted[field]);
      if (ok) hits[field] = (hits[field] ?? 0) + 1;
      else all = false;
    }
    if (all) exact += 1;
    bump(confusion.refusal, String(item.gold.refusal), String(predicted.refusal));
    if ("do_not_write" in item.gold) {
      bump(confusion.do_not_write, String(item.gold.do_not_write), String(predicted.do_not_write));
    }
    bump(confusion.distress, String(item.gold.distress), String(predicted.distress));
    rows.push({ id: item.id, gold: item.gold, predicted, calls: result.call });
  }
  const accuracy: Record<string, string> = {};
  for (const field of FIELDS) {
    const total = totals[field] ?? 0;
    accuracy[field] = total === 0 ? "n/a" : `${hits[field]}/${total}`;
  }
  return {
    cases: cases.length,
    perField: accuracy,
    exactSet: `${exact}/${cases.length}`,
    confusion,
    rows,
  };
}

async function runPersona(
  personaCase: PersonaCase,
  ai: ModelClient,
  topics: ReturnType<typeof loadChildhoodTopics>,
): Promise<Record<string, unknown>> {
  const repo = new MemoryRepo(topics);
  const opened = await openConversation(repo, {
    userId: EVAL_USER,
    entryMode: "topic",
    topicId: personaCase.topic_id,
  });
  const used = new Set<string>();
  const turns = [];
  let userTurns = 0;
  let lastQuestion = opened.messages[0]?.content ?? "";
  const refused: string[] = [];
  let refusalChecks = 0;
  let refusalOk = 0;
  let doNotWriteChecks = 0;
  let doNotWriteOk = 0;
  let leading = 0;
  let priorDontRemember = 0;
  let a11Checks = 0;
  let a11Pass = 0;
  let a15FirstChecks = 0;
  let a15FirstPass = 0;
  let a15SecondChecks = 0;
  let a15SecondPass = 0;
  let questions = 0;
  let interviewerTurns = 0;

  while (userTurns < 8 && used.size < personaCase.script.length) {
    const session = await repo.getSession(opened.session.id);
    if (!session || session.status !== "open") break;
    const step = pickStep(personaCase.script, used, { userTurns, lastQuestion });
    if (!step) break;
    used.add(step.id);
    const lines = utteranceLines(step);
    const golds = step.expected_classifier_messages ?? lines.map(() => step.expected_classifier);
    for (let index = 0; index < lines.length; index += 1) {
      const text = lines[index];
      if (!text) continue;
      userTurns += 1;
      const ingested = await ingestUserMessage(repo, ai, {
        sessionId: opened.session.id,
        userId: EVAL_USER,
        messageId: crypto.randomUUID(),
        content: text,
      });
      const gold = golds[index];
      turns.push({
        stepId: step.id,
        user: text,
        gold: gold ?? null,
        predicted: gold ? toGold(ingested.classification) : toGold(ingested.classification),
        fieldHits: gold ? fieldHits(gold, toGold(ingested.classification)) : null,
      });
      if (userTurns >= 8) break;
    }
    const result = await completeTurn(repo, ai, { sessionId: opened.session.id, userId: EVAL_USER });
    const reply = result.assistantMessage.content;
    for (const line of lines) {
      if (!line) continue;
      const short = scoreShortAnswer(line, reply);
      if (short !== "n/a") {
        a11Checks += 1;
        if (short === "pass") a11Pass += 1;
      }
      const remembered = scoreDontRemember(line, priorDontRemember, result.classification.distress, reply);
      if (remembered !== "n/a") {
        const second = priorDontRemember >= 1 || isEmotionalGap(line, result.classification.distress);
        if (second) {
          a15SecondChecks += 1;
          if (remembered === "pass") a15SecondPass += 1;
        } else {
          a15FirstChecks += 1;
          if (remembered === "pass") a15FirstPass += 1;
        }
      }
      if (isDontRemember(line)) priorDontRemember += 1;
    }
    interviewerTurns += 1;
    const qCount = countQuestions(result.assistantMessage.content);
    if (qCount > 0) questions += 1;
    if (isLeading(result.assistantMessage.content)) leading += 1;
    const marked = result.classification.refusal
      ? avoidPointsForTurn(result.classification, lastQuestion)
      : [];
    const currentRefused = [...refused, ...marked];
    if (result.classification.refusal || refused.length > 0) {
      refusalChecks += 1;
      if (!mentionsRefusedPoint(result.assistantMessage.content, currentRefused)) {
        refusalOk += 1;
      }
    }
    for (const point of marked) {
      if (!refused.includes(point)) refused.push(point);
    }
    if (result.classification.doNotWrite && !result.classification.refusal) {
      doNotWriteChecks += 1;
      if (
        scoreDoNotWriteHandled(result.assistantMessage.content, {
          wantsToStop: result.classification.wantsToStop,
          distress: result.classification.distress,
        }) === "pass"
      ) {
        doNotWriteOk += 1;
      }
    }
    lastQuestion = result.assistantMessage.content;
    turns.push({
      assistant: result.assistantMessage.content,
      kind: result.assistantMessage.kind,
      decision: result.decisionKind,
      followupsUsed: result.session.followupsUsed,
      questionCount: qCount,
      leading: isLeading(result.assistantMessage.content),
      repairs: result.repairs,
    });
    if (result.session.status !== "open") break;
  }

  const finalSession = await repo.getSession(opened.session.id);
  return {
    id: personaCase.id,
    reviewStatus: personaCase.review_status,
    draft: personaCase.review_status.includes("draft"),
    topicId: personaCase.topic_id,
    scenarioTags: personaCase.scenario_tags ?? [],
    followupsUsed: finalSession?.followupsUsed ?? 0,
    interviewerTurns,
    questionTurns: questions,
    leadingTurns: leading,
    refusalChecks,
    refusalOk,
    doNotWriteChecks,
    doNotWriteOk,
    a11Checks,
    a11Pass,
    a15FirstChecks,
    a15FirstPass,
    a15SecondChecks,
    a15SecondPass,
    oneQuestion: turns.filter((turn) => "questionCount" in turn).every((turn) => (turn.questionCount ?? 0) <= 1),
    turns,
  };
}

function pickStep(
  steps: ScriptStep[],
  used: Set<string>,
  state: { userTurns: number; lastQuestion: string },
): ScriptStep | null {
  const available = steps.filter((step) => !used.has(step.id));
  const ranked = ["if_leading", "if_chases_sensitive", "if_asks_about", "on_turn", "after_opening", "otherwise"];
  const matching = available.filter((step) => whenMatches(step, state));
  matching.sort((a, b) => rank(a.when, ranked) - rank(b.when, ranked));
  return matching[0] ?? available[0] ?? null;
}

function whenMatches(step: ScriptStep, state: { userTurns: number; lastQuestion: string }): boolean {
  const when = step.when;
  if (when === "after_opening") return state.userTurns === 0;
  if (when.startsWith("on_turn:")) return state.userTurns + 1 === Number(when.split(":")[1]);
  const question = state.lastQuestion.toLowerCase();
  if (when === "if_leading") return isLeading(state.lastQuestion) || /\b(was|were|did) the\b/i.test(state.lastQuestion);
  if (when === "if_asks_about") {
    return (step.subjects ?? []).some((subject) => question.includes(subject.toLowerCase()));
  }
  if (when === "if_chases_sensitive") {
    return /\b(dad|father|drink|money|died|brother|hurt|hard times|name)\b/i.test(question);
  }
  if (when === "otherwise") return true;
  return false;
}

function rank(when: string, order: string[]): number {
  const index = order.findIndex((item) => when === item || when.startsWith(`${item}:`));
  return index === -1 ? order.length : index;
}

function utteranceLines(step: ScriptStep): string[] {
  if (step.sample_messages?.length) return step.sample_messages;
  if (Array.isArray(step.sample_utterance)) return step.sample_utterance;
  return step.sample_utterance ? [step.sample_utterance] : [];
}

function rollupConversations(conversations: Record<string, unknown>[], includeDrafts: boolean): Record<string, unknown> {
  const baseline = conversations.filter((item) => includeDrafts || item.draft !== true);
  const drafts = conversations.filter((item) => item.draft === true);
  return {
    ran: conversations.length,
    baseline: metrics(baseline),
    draftExcludedFromBaseline: drafts.map((item) => item.id),
    draft: metrics(drafts),
    cases: conversations,
  };
}

function metrics(cases: Record<string, unknown>[]): Record<string, unknown> {
  const refusalChecks = cases.reduce((sum, item) => sum + Number(item.refusalChecks ?? 0), 0);
  const refusalOk = cases.reduce((sum, item) => sum + Number(item.refusalOk ?? 0), 0);
  const questionTurns = cases.reduce((sum, item) => sum + Number(item.questionTurns ?? 0), 0);
  const leadingTurns = cases.reduce((sum, item) => sum + Number(item.leadingTurns ?? 0), 0);
  const maxFollowUps = cases.reduce((max, item) => Math.max(max, Number(item.followupsUsed ?? 0)), 0);
  const oneQuestion = cases.every((item) => item.oneQuestion !== false);
  return {
    cases: cases.length,
    refusal_respected: refusalChecks === 0 ? "n/a" : `${refusalOk}/${refusalChecks}`,
    do_not_write_handled: rate(cases, "doNotWriteOk", "doNotWriteChecks"),
    maxFollowUpsPerTopic: maxFollowUps,
    fourthFollowUp: maxFollowUps > 3,
    oneQuestionPerTurn: oneQuestion,
    leadingQuestionRate: questionTurns === 0 ? "n/a" : `${leadingTurns}/${questionTurns}`,
    leadingQuestionJudge: { score: null, status: "not_run" },
    shortAnswerRate: rate(cases, "a11Pass", "a11Checks"),
    dontRememberFirstRate: rate(cases, "a15FirstPass", "a15FirstChecks"),
    dontRememberSecondRate: rate(cases, "a15SecondPass", "a15SecondChecks"),
  };
}

function rate(cases: Record<string, unknown>[], passKey: string, checkKey: string): string {
  const checks = cases.reduce((sum, item) => sum + Number(item[checkKey] ?? 0), 0);
  const passes = cases.reduce((sum, item) => sum + Number(item[passKey] ?? 0), 0);
  return checks === 0 ? "n/a" : `${passes}/${checks}`;
}

function toGold(classification: Classification): Gold {
  return {
    refusal: classification.refusal,
    refusal_scope: classification.refusalScope,
    refused_point: classification.refusedPoint,
    off_topic_chapter: classification.offTopicChapter,
    wants_to_stop: classification.wantsToStop,
    distress: classification.distress,
    answer_length: classification.answerLength,
    do_not_write: classification.doNotWrite,
    do_not_write_scope: classification.doNotWriteScope,
  };
}

function fieldHits(gold: Gold, predicted: Gold): Record<string, boolean> {
  const hits: Record<string, boolean> = {};
  for (const field of FIELDS) {
    if (!(field in gold)) continue;
    hits[field] = fieldsMatch(field, gold[field], predicted[field]);
  }
  return hits;
}

function fieldsMatch(field: string, gold: unknown, predicted: unknown): boolean {
  if (field === "refused_point") return pointsMatch(gold, predicted);
  return gold === predicted;
}

function pointsMatch(gold: unknown, predicted: unknown): boolean {
  if (gold == null || gold === "") return predicted == null || predicted === "";
  if (typeof gold !== "string" || typeof predicted !== "string") return false;
  const left = normalizePoint(gold);
  const right = normalizePoint(predicted);
  if (left === right) return true;
  return left.split(" ").every((word) => right.includes(word)) || right.split(" ").every((word) => left.includes(word));
}

function normalizePoint(value: string): string {
  return value
    .toLowerCase()
    .replace(/father/g, "dad")
    .replace(/mother/g, "mom")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function bump(table: Record<string, number> | undefined, gold: string, predicted: string): void {
  if (!table) return;
  const key = `${gold}->${predicted}`;
  table[key] = (table[key] ?? 0) + 1;
}

export async function maybeWriting(): Promise<unknown> {
  return runWritingPipeline();
}
