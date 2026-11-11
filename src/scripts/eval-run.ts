import fs from "node:fs";
import path from "node:path";
import { runEvalSet } from "@/eval/run-eval";
import { loadLocalEnv } from "@/lib/load-env";

loadLocalEnv();

const args = process.argv.slice(2).filter((arg) => arg !== "--");
const includeDraftsInBaseline = args.includes("--include-drafts");
const judge = args.includes("--judge");
const onlyClassifier = args.includes("--classifier");
const onlyPersonas = args.includes("--personas");
const caseFlag = args.find((arg) => arg.startsWith("--case="));
const caseId = caseFlag?.slice("--case=".length);
const fileArg = args.find((arg) => !arg.startsWith("--"));

async function main(): Promise<void> {
  if (fileArg && !fileArg.includes("personas.json") && !fileArg.includes("classifier-cases")) {
    console.error(`Eval reads eval/v0.1/personas.json and classifier-cases.jsonl.\nFor one persona: pnpm eval:run -- --case=${path.basename(fileArg, ".json")}`);
  }
  const summary = await runEvalSet({
    includeDraftsInBaseline,
    runClassifier: !onlyPersonas,
    runPersonas: !onlyClassifier,
    caseId,
    judge,
  });
  const dir = path.join(process.cwd(), "evals/out", new Date().toISOString().replace(/[:.]/g, "-"));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "summary.json"), JSON.stringify(summary, null, 2));
  const classifier = summary.classifier as { perField?: Record<string, string>; exactSet?: string; cases?: number } | undefined;
  const conversations = summary.conversations as { baseline?: Record<string, unknown>; draft?: Record<string, unknown> } | undefined;
  console.log(`Eval run written to ${dir}`);
  if (classifier) {
    console.log(`Classifier cases: ${classifier.cases}`);
    console.log(`Exact set: ${classifier.exactSet}`);
    console.log("Per field:", classifier.perField);
    console.log("Confusion (refusal / do_not_write / distress) is in summary.json");
  }
  if (conversations?.baseline) {
    console.log("Baseline (draft personas excluded):");
    console.log(conversations.baseline);
    console.log("Draft, biographer to review (not in the baseline):");
    console.log(conversations.draft);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
