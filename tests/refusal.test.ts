import { describe, expect, it } from "vitest";
import { loadChildhoodTopics } from "@/lib/config/catalog";
import { MockModelClient } from "@/lib/ai/mock";
import { classifyHeuristic } from "@/lib/conversation/classify";
import { runTurn } from "@/lib/conversation/engine";
import { openConversation } from "@/lib/conversation/open";
import { mentionsRefusedPoint } from "@/lib/conversation/guard";
import { MemoryRepo } from "@/lib/repo/memory";

const USER = "55555555-5555-4555-8555-555555555555";

describe("refusal blocking", () => {
  it("does not treat I don't remember as a refusal", () => {
    const result = classifyHeuristic("i dont remember much about that", "What did the kitchen smell like?");
    expect(result.refusal).toBe(false);
    expect(result.doNotWrite).toBe(false);
  });

  it("stops probing the refused point on the next turn", async () => {
    const repo = new MemoryRepo(loadChildhoodTopics());
    const ai = new MockModelClient();
    const opened = await openConversation(repo, { userId: USER, entryMode: "topic", topicId: "childhood-parents" });
    const first = await runTurn(repo, ai, {
      sessionId: opened.session.id,
      userId: USER,
      messageId: "66666666-6666-4666-8666-666666666661",
      content: "my dad drank a lot and id rather not talk about that",
    });
    expect(first.classification.refusal).toBe(true);
    expect(first.assistantMessage.kind).toBe("refusal_redirect");
    const point = first.classification.refusedPoint ?? "";
    expect(mentionsRefusedPoint(first.assistantMessage.content, [point])).toBeNull();

    const second = await runTurn(repo, ai, {
      sessionId: opened.session.id,
      userId: USER,
      messageId: "66666666-6666-4666-8666-666666666662",
      content: "mom packed his lunch every afternoon before the night shift",
    });
    const points = await repo.listRefusalPoints(USER, "childhood-parents");
    expect(points.length).toBeGreaterThan(0);
    expect(mentionsRefusedPoint(second.assistantMessage.content, points)).toBeNull();
    expect(second.session.followupsUsed).toBeLessThanOrEqual(1);
    expect(points.some((point) => point.includes("?"))).toBe(true);
    expect(points.some((point) => /\b(thank|telling)\b/i.test(point) && !point.includes("?"))).toBe(false);
  });

  it("anchors a refusal on the declined question, not filler from the previous reply", () => {
    const redirect =
      "Of course. Thank you for telling me that much. Would you like to talk about something else from this time?";
    const point = classifyHeuristic("id rather not", redirect).refusedPoint ?? "";
    expect(point).not.toMatch(/thank|telling|course/);
    expect(mentionsRefusedPoint(redirect, [point, redirect])).not.toBeNull();
    expect(
      mentionsRefusedPoint("What did the kitchen smell like when you walked in?", [
        "What did the kitchen smell like?",
      ]),
    ).not.toBeNull();
    expect(
      mentionsRefusedPoint("What did they do for work?", ["What did the kitchen smell like?"]),
    ).toBeNull();
  });
});
