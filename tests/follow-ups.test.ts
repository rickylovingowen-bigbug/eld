import { describe, expect, it } from "vitest";
import { loadChildhoodTopics } from "@/lib/config/catalog";
import { MockModelClient } from "@/lib/ai/mock";
import { runTurn } from "@/lib/conversation/engine";
import { openConversation } from "@/lib/conversation/open";
import { decideTurn } from "@/lib/conversation/decide";
import { emptyClassification } from "@/lib/conversation/merge";
import { MemoryRepo } from "@/lib/repo/memory";

const USER = "44444444-4444-4444-8444-444444444444";

describe("follow-up cap", () => {
  it("stops counting at 3 and lets the elder opt to continue", async () => {
    const repo = new MemoryRepo(loadChildhoodTopics());
    const ai = new MockModelClient();
    const opened = await openConversation(repo, { userId: USER, entryMode: "topic", topicId: "childhood-house" });
    const answers = [
      "the kitchen was yellow and mom always had the radio on during ball games",
      "on saturdays she let me help roll the pie dough at the big table",
      "the first pie I made by myself fell apart before it got to the table",
      "we ate it with spoons and my brother wanted the biggest piece",
      "yes keep going",
      "the radio was always on the ball games and mom hummed along",
    ];
    const kinds: string[] = [];
    for (const [index, content] of answers.entries()) {
      const result = await runTurn(repo, ai, {
        sessionId: opened.session.id,
        userId: USER,
        messageId: `00000000-0000-4000-8000-00000000000${index + 1}`,
        content,
      });
      kinds.push(result.assistantMessage.kind);
      expect(result.session.followupsUsed).toBeLessThanOrEqual(3);
    }
    expect(kinds.slice(0, 3)).toEqual(["follow_up", "follow_up", "follow_up"]);
    expect(kinds[3]).toBe("cap_prompt");
    expect(kinds[4]).toBe("extended_follow_up");
    expect(kinds[5]).toBe("extended_follow_up");
    const session = await repo.getSession(opened.session.id);
    expect(session?.followupsUsed).toBe(3);
    expect(session?.extendedByUser).toBe(true);
  });

  it("does not treat the cap question as a fourth follow-up", () => {
    let used = 0;
    let extended = false;
    let awaiting: "cap_opt_in" | "do_not_write_confirm" | null = null;
    for (let index = 0; index < 5; index += 1) {
      const decision = decideTurn({
        classification: emptyClassification(),
        followupsUsed: used,
        extendedByUser: extended,
        awaiting,
        consecutiveTopicRefusals: 0,
        userText: index === 4 ? "yes keep going" : "we had a yellow kitchen and a radio",
        refusedPoints: [],
      });
      if (decision.countsAsFollowUp) used += 1;
      if (decision.setExtended) extended = true;
      awaiting = decision.clearAwaiting ? null : decision.setAwaiting ?? awaiting;
      expect(used).toBeLessThanOrEqual(3);
    }
    expect(used).toBe(3);
    expect(extended).toBe(true);
  });
});
