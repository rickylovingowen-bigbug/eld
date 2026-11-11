import { describe, expect, it } from "vitest";
import { assembleContext } from "@/lib/conversation/context";
import { callSettings, stepSpec } from "@/lib/config/models";
import { buildDraftSystemPrompt, loadPrompts } from "@/lib/config/prompts";
import { isDontRemember } from "@/lib/conversation/classify";
import { decideTurn } from "@/lib/conversation/decide";
import { emptyClassification } from "@/lib/conversation/merge";
import { countQuestions, enforceOneQuestion, isLeading } from "@/lib/conversation/guard";

const signals = {
  refusalNow: false,
  distress: "none" as const,
  wantsToStop: false,
  doNotWriteNow: false,
  answerLength: "short" as const,
  dontRemember: false,
};

describe("context assembly", () => {
  it("keeps the recent window, profile, people, and the opening-gap hook", () => {
    const turns = Array.from({ length: 10 }, (_, index) => ({
      role: index % 2 === 0 ? ("user" as const) : ("assistant" as const),
      content: `turn ${index}`,
    }));
    const context = assembleContext({
      userName: "Ricky",
      topic: {
        id: "childhood-house",
        titleEn: "The house I grew up in",
        openingQuestion: "What did you see?",
        followUps: ["Where did you sleep?"],
      },
      recentTurns: turns,
      profile: [{ key: "hometown", value: "Dayton" }],
      people: [{ name: "Mom", relation: "mother" }],
      storySummaries: [],
      followUpsUsed: 1,
      extendedByUser: false,
      refusedPoints: ["dad's drinking"],
      doNotWriteTopics: [],
      openingGap: null,
      signals,
    });
    expect(context.recentTurns).toHaveLength(8);
    expect(context.recentTurns[0]?.content).toBe("turn 2");
    expect(context.profile[0]?.value).toBe("Dayton");
    expect(context.people[0]?.name).toBe("Mom");
    expect(context.followUpsUsed).toBe(1);
    expect(context.refusedPoints).toEqual(["dad's drinking"]);
    expect(context.openingGap).toBeNull();
    expect(context.topic?.openingQuestion).toBe("What did you see?");
  });
});

describe("prompts and model settings", () => {
  it("loads the interviewer signal for do_not_write_now from the prompt file", () => {
    const interview = loadPrompts().interview;
    expect(interview).toContain("{do_not_write_now}");
    expect(interview.toLowerCase()).toContain("don't really remember");
    const draft = buildDraftSystemPrompt("example");
    expect(draft.toLowerCase()).toContain("a testament to");
  });

  it("omits temperature for verify and sets reasoning", () => {
    const verify = callSettings(stepSpec("verify"));
    expect(verify.temperature).toBeUndefined();
    expect(verify.reasoning).toBe("medium");
    const luna = callSettings(stepSpec("classify"));
    expect(luna.temperature).toBe(0);
    expect(luna.reasoning).toBe("none");
    const terra = callSettings(stepSpec("interview"));
    expect(terra.temperature).toBe(0.7);
    expect(terra.reasoning).toBe("none");
  });
});

describe("one question and short answers", () => {
  it("rejects a second question mark", () => {
    const enforced = enforceOneQuestion("What color was it? And who was there?");
    expect(enforced.trimmed).toBe(true);
    expect(countQuestions(enforced.text)).toBe(1);
    expect(isLeading("Was the kitchen yellow?")).toBe(true);
    expect(isLeading("What color was the kitchen?")).toBe(false);
  });

  it("reassures on I don't remember and keeps a short answer on the same point", () => {
    expect(isDontRemember("i dont remember")).toBe(true);
    const forgot = decideTurn({
      classification: emptyClassification({ answerLength: "very_short" }),
      followupsUsed: 0,
      extendedByUser: false,
      awaiting: null,
      consecutiveTopicRefusals: 0,
      userText: "i dont remember",
      refusedPoints: [],
    });
    expect(forgot.kind).toBe("reassure_switch");
    expect(forgot.countsAsFollowUp).toBe(false);
    expect(forgot.template?.toLowerCase()).toContain("completely fine");

    const short = decideTurn({
      classification: emptyClassification({ answerLength: "very_short" }),
      followupsUsed: 0,
      extendedByUser: false,
      awaiting: null,
      consecutiveTopicRefusals: 0,
      userText: "yellow",
      refusedPoints: [],
    });
    expect(short.kind).toBe("follow_up");
    expect(short.useModel).toBe(true);
    expect(short.countsAsFollowUp).toBe(true);
  });
});
