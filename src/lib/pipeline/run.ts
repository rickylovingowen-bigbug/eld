export type WritingStepName = "extract" | "structure" | "draft" | "verify";

export interface WritingStepResult {
  step: WritingStepName;
  skipped: boolean;
  reason: string;
}

/** v0.2 fills these in. The eval runner already calls this hook. */
export async function runWritingPipeline(): Promise<WritingStepResult[]> {
  return (["extract", "structure", "draft", "verify"] as const).map((step) => ({
    step,
    skipped: true,
    reason: "Writing pipeline arrives in v0.2",
  }));
}
