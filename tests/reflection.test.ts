import { describe, expect, it } from "vitest";
import { loadChildhoodTopics } from "@/lib/config/catalog";
import { MockModelClient } from "@/lib/ai/mock";
import { runTurn } from "@/lib/conversation/engine";
import { openConversation } from "@/lib/conversation/open";
import {
  endingMeaning,
  isLookbackQuestion,
  materialSheet,
  reflectionDue,
} from "@/lib/conversation/reflection";
import { structureEnding } from "@/lib/pipeline/run";
import { MemoryRepo } from "@/lib/repo/memory";

const USER = "99999999-9999-4999-8999-999999999999";

describe("reflection due", () => {
  const rich = [
    "the kitchen smelled like cinnamon",
    "mama baked pies every saturday and called us in",
  ];

  it("is true only on the last follow-up, with a scene, an event, and no distress", () => {
    expect(reflectionDue({ followupsUsed: 2, alreadyAsked: false, distress: "none", userMessages: rich })).toBe(true);
    expect(reflectionDue({ followupsUsed: 1, alreadyAsked: false, distress: "none", userMessages: rich })).toBe(false);
    expect(reflectionDue({ followupsUsed: 2, alreadyAsked: true, distress: "none", userMessages: rich })).toBe(false);
    expect(reflectionDue({ followupsUsed: 2, alreadyAsked: false, distress: "mild", userMessages: rich })).toBe(false);
    expect(reflectionDue({ followupsUsed: 2, alreadyAsked: false, distress: "none", userMessages: ["fine"] })).toBe(false);
  });

  it("stores the elder's answer verbatim and does not ask again", async () => {
    const repo = new MemoryRepo(loadChildhoodTopics());
    const ai = new MockModelClient();
    const opened = await openConversation(repo, { userId: USER, entryMode: "topic", topicId: "childhood-food" });
    const lines = [
      "the kitchen smelled like cinnamon when I walked in",
      "mama baked pies every saturday and called us to the table",
      "I sat by the window and she gave me the first slice",
    ];
    let last = "";
    for (const [index, content] of lines.entries()) {
      const result = await runTurn(repo, ai, {
        sessionId: opened.session.id,
        userId: USER,
        messageId: `99999999-9999-4999-8999-99999999999${index}`,
        content,
      });
      last = result.assistantMessage.content;
    }
    expect(isLookbackQuestion(last)).toBe(true);
    const answer = "it stuck because that was the only quiet hour in the house";
    const after = await runTurn(repo, ai, {
      sessionId: opened.session.id,
      userId: USER,
      messageId: "99999999-9999-4999-8999-999999999994",
      content: answer,
    });
    expect(isLookbackQuestion(after.assistantMessage.content)).toBe(false);
    const saved = await repo.getTopicReflection(USER, "childhood-food");
    expect(saved.meaning).toBe(answer);
    const sheet = materialSheet({
      scene: "kitchen",
      event: "baked",
      meaning: saved.meaning,
      meaningMessageId: saved.meaningMessageId,
    });
    expect(endingMeaning(sheet)).toBe(answer);
    expect(structureEnding(sheet).ending_meaning).toBe("x1");
  });

  it("does not store a meaning or ask again when they can't answer", async () => {
    const repo = new MemoryRepo(loadChildhoodTopics());
    const ai = new MockModelClient();
    const opened = await openConversation(repo, { userId: USER, entryMode: "topic", topicId: "childhood-house" });
    const lines = [
      "the hallway smelled like dinner",
      "we lived upstairs and mama cooked every night",
      "I heard her call from the kitchen",
    ];
    for (const [index, content] of lines.entries()) {
      await runTurn(repo, ai, {
        sessionId: opened.session.id,
        userId: USER,
        messageId: `99999999-9999-4999-8999-99999999998${index}`,
        content,
      });
    }
    const after = await runTurn(repo, ai, {
      sessionId: opened.session.id,
      userId: USER,
      messageId: "99999999-9999-4999-8999-999999999984",
      content: "I don't know why",
    });
    expect(isLookbackQuestion(after.assistantMessage.content)).toBe(false);
    const saved = await repo.getTopicReflection(USER, "childhood-house");
    expect(saved.asked).toBe(true);
    expect(saved.meaning).toBeNull();
    expect(structureEnding(materialSheet({ scene: "hallway", event: "lived", meaning: null, meaningMessageId: null })).ending_meaning).toBeNull();
  });
});
