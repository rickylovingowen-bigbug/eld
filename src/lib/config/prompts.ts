import { readJsonFile, readTextFile } from "@/lib/config/files";

export type PromptId =
  | "classify"
  | "interview"
  | "extract"
  | "structure"
  | "draft"
  | "verify"
  | "chapter"
  | "simulatedElder"
  | "judge";

const HEADINGS: [string, PromptId][] = [
  ["A. Turn classifier", "classify"],
  ["B. Interviewer", "interview"],
  ["C. Step 1 Extract", "extract"],
  ["D. Step 2 Structure", "structure"],
  ["E. Step 3 Draft", "draft"],
  ["F. Step 4 Verify", "verify"],
  ["G. Chapter draft", "chapter"],
  ["X1. Simulated elder", "simulatedElder"],
  ["X2. Judge", "judge"],
];

export function parsePromptMarkdown(markdown: string): Record<PromptId, string> {
  const sections = markdown.split(/^## /m).slice(1);
  const found = new Map<PromptId, string>();
  for (const section of sections) {
    const newline = section.indexOf("\n");
    const title = (newline === -1 ? section : section.slice(0, newline)).trim();
    const body = newline === -1 ? "" : section.slice(newline + 1);
    const match = HEADINGS.find(([heading]) => title.startsWith(heading));
    if (!match) continue;
    const fence = body.match(/```[^\n]*\n([\s\S]*?)```/);
    if (!fence) {
      throw new Error(`Prompt section "${title}" has no fenced block`);
    }
    found.set(match[1], fence[1].trim());
  }
  for (const [, id] of HEADINGS) {
    if (!found.has(id)) throw new Error(`Missing prompt section for ${id}`);
  }
  return Object.fromEntries(found) as Record<PromptId, string>;
}

let cached: { mtimeMs: number; prompts: Record<PromptId, string> } | null = null;

export function loadPrompts(): Record<PromptId, string> {
  const { text, mtimeMs } = readTextFile("prompts/ai-prompts-v1.md");
  if (cached && cached.mtimeMs === mtimeMs) return cached.prompts;
  const prompts = parsePromptMarkdown(text);
  cached = { mtimeMs, prompts };
  return prompts;
}

export function fillTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{([a-z0-9_]+)\}/gi, (match, key: string) => {
    if (Object.prototype.hasOwnProperty.call(vars, key)) return vars[key] ?? "";
    return match;
  });
}

interface BannedFile {
  moral: string[];
  literary: string[];
  sensory_cliche: string[];
  ai_tone: string[];
  voice_swaps: { plain: string; fancy: string[] }[];
}

export function loadBannedPhrases(): BannedFile {
  return readJsonFile<BannedFile>("config/banned-phrases-v1.json");
}

export function bannedPhraseBlock(): string {
  const banned = loadBannedPhrases();
  const swaps = banned.voice_swaps
    .map((swap) => `${swap.plain} → ${swap.fancy.join(", ")}`)
    .join("; ");
  return [
    ...banned.moral,
    ...banned.literary,
    ...banned.sensory_cliche,
    ...banned.ai_tone,
    `Voice swaps: ${swaps}`,
  ].join("; ");
}

/** Fills the draft prompt so v0.2 can call it without re-parsing the files. */
export function buildDraftSystemPrompt(writingSpecExcerpt: string): string {
  return fillTemplate(loadPrompts().draft, {
    banned_phrases_from_biographer: bannedPhraseBlock(),
    writing_spec_examples_from_biographer: writingSpecExcerpt,
  });
}
