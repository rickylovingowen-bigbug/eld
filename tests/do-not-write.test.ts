import { describe, expect, it } from "vitest";
import { loadChildhoodTopics } from "@/lib/config/catalog";
import { MockModelClient } from "@/lib/ai/mock";
import { assembleContext, renderInterviewPrompt } from "@/lib/conversation/context";
import { loadPrompts } from "@/lib/config/prompts";
import { runTurn } from "@/lib/conversation/engine";
import { openConversation } from "@/lib/conversation/open";
import { messageIdsExcludedFromWriting } from "@/lib/pipeline/exclude";
import { MemoryRepo } from "@/lib/repo/memory";

const USER = "77777777-7777-4777-8777-777777777777";

describe("do-not-write", () => {
  it("drops do-not-write topics before the interviewer prompt is built", () => {
    const context = assembleContext({
      userName: "Ricky",
      topic: {
        id: "childhood-hard",
        titleEn: "Hard times at home",
        openingQuestion: "Is that something you'd like to talk about?",
        followUps: [],
      },
      recentTurns: [{ role: "user", content: "we got by" }],
      profile: [],
      people: [],
      storySummaries: [
        { topicId: "childhood-hard", summary: "Hard times at home, the winter the pump froze." },
        { topicId: "childhood-food", summary: "Saturday pies." },
      ],
      followUpsUsed: 0,
      extendedByUser: false,
      refusedPoints: [],
      doNotWriteTopics: [{ id: "childhood-hard", titleEn: "Hard times at home" }],
      openingGap: null,
      signals: {
        refusalNow: false,
        distress: "none",
        wantsToStop: false,
        doNotWriteNow: false,
        answerLength: "short",
        dontRemember: false,
        dontRememberPrior: 0,
      },
    });
    expect(context.topic).toBeNull();
    expect(context.storySummaries.map((story) => story.topicId)).toEqual(["childhood-food"]);
    expect(context.excludedTopicIds).toContain("childhood-hard");
    expect(context.openingGap).toBeNull();
    const rendered = renderInterviewPrompt(loadPrompts().interview, context);
    expect(rendered.system.includes("Hard times at home")).toBe(false);
    expect(rendered.prompt.includes("pump froze")).toBe(false);
  });

  it("marks one point, keeps the message, and acknowledges", async () => {
    const repo = new MemoryRepo(loadChildhoodTopics());
    const ai = new MockModelClient();
    const opened = await openConversation(repo, { userId: USER, entryMode: "topic", topicId: "childhood-parents" });
    const content = "you can ask but dont put my dad in that book";
    const result = await runTurn(repo, ai, {
      sessionId: opened.session.id,
      userId: USER,
      messageId: "88888888-8888-4888-8888-888888888881",
      content,
    });
    expect(result.userMessage.content).toBe(content);
    expect(result.classification.doNotWrite).toBe(true);
    expect(result.classification.doNotWriteScope).toBe("point");
    expect(result.assistantMessage.content.toLowerCase()).toContain("stays between us");
    expect(repo.topicState(USER, "childhood-parents")).toBe("recommendable");
    expect(repo.points.some((point) => point.kind === "do_not_write" && point.messageId === result.userMessage.id)).toBe(true);
    expect(result.session.status).toBe("open");
    const excluded = messageIdsExcludedFromWriting({
      messages: [{ id: result.userMessage.id, topicId: "childhood-parents" }],
      doNotWriteMessageIds: [result.userMessage.id],
      doNotWriteTopicIds: [],
    });
    expect(excluded).toEqual([result.userMessage.id]);
  });

  it("marks the whole topic only when the elder says the whole topic stays out", async () => {
    const repo = new MemoryRepo(loadChildhoodTopics());
    const ai = new MockModelClient();
    const opened = await openConversation(repo, { userId: USER, entryMode: "topic", topicId: "childhood-name" });
    const result = await runTurn(repo, ai, {
      sessionId: opened.session.id,
      userId: USER,
      messageId: "88888888-8888-4888-8888-888888888882",
      content: "dont put this whole topic in the book",
    });
    expect(result.classification.doNotWriteScope).toBe("topic");
    expect(repo.topicState(USER, "childhood-name")).toBe("do_not_write");
    const excluded = messageIdsExcludedFromWriting({
      messages: [
        { id: result.userMessage.id, topicId: "childhood-name" },
        { id: "other", topicId: "childhood-food" },
      ],
      doNotWriteMessageIds: [],
      doNotWriteTopicIds: ["childhood-name"],
    });
    expect(excluded).toEqual([result.userMessage.id]);
  });
});
