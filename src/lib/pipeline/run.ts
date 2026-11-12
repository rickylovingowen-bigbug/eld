import { endingMeaning, type MaterialSheet } from "@/lib/conversation/reflection";

export type WritingStepName = "extract" | "structure" | "draft" | "verify";

export interface WritingStepResult {
  step: WritingStepName;
  skipped: boolean;
  reason: string;
}

/** Step 2 ends on the elder's own meaning. Null ends on the last concrete beat. */
export function structureEnding(sheet: MaterialSheet): { ending_meaning: string | null } {
  const text = endingMeaning(sheet);
  return { ending_meaning: text ? "x1" : null };
}

/** v0.2 fills these in. The eval runner already calls this hook. */
export async function runWritingPipeline(): Promise<WritingStepResult[]> {
  return (["extract", "structure", "draft", "verify"] as const).map((step) => ({
    step,
    skipped: true,
    reason: "Writing pipeline arrives in v0.2",
  }));
}
