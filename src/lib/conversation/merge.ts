import type { Classification } from "@/lib/types";

export function emptyClassification(overrides: Partial<Classification> = {}): Classification {
  return {
    refusal: false,
    refusalScope: "none",
    refusedPoint: null,
    offTopicChapter: null,
    wantsToStop: false,
    distress: "none",
    answerLength: "short",
    doNotWrite: false,
    doNotWriteScope: "none",
    ...overrides,
  };
}

/** Bundle of split messages: the strongest signal wins, topic scope beats point scope. */
export function mergeClassifications(list: Classification[]): Classification {
  const last = list[list.length - 1];
  if (!last) return emptyClassification();
  const topicRefusal = [...list].reverse().find((item) => item.refusal && item.refusalScope === "topic");
  const anyRefusal = list.find((item) => item.refusal);
  const topicSkip = list.find((item) => item.doNotWrite && item.doNotWriteScope === "topic");
  const anySkip = list.find((item) => item.doNotWrite);
  return {
    refusal: list.some((item) => item.refusal),
    refusalScope: topicRefusal ? "topic" : anyRefusal ? "point" : "none",
    refusedPoint: topicRefusal?.refusedPoint ?? anyRefusal?.refusedPoint ?? null,
    offTopicChapter: list.find((item) => item.offTopicChapter)?.offTopicChapter ?? null,
    wantsToStop: list.some((item) => item.wantsToStop),
    distress: list.some((item) => item.distress === "strong")
      ? "strong"
      : list.some((item) => item.distress === "mild")
        ? "mild"
        : "none",
    answerLength: last.answerLength,
    doNotWrite: list.some((item) => item.doNotWrite),
    doNotWriteScope: topicSkip ? "topic" : anySkip ? "point" : "none",
  };
}

export function sanitizeClassification(
  raw: Classification,
  chapterIds: Set<string>,
): Classification {
  const refusal = raw.refusal === true;
  const doNotWrite = raw.doNotWrite === true;
  return {
    refusal,
    refusalScope: refusal ? (raw.refusalScope === "topic" ? "topic" : "point") : "none",
    refusedPoint: refusal ? raw.refusedPoint?.trim() || "that subject" : null,
    offTopicChapter:
      raw.offTopicChapter && chapterIds.has(raw.offTopicChapter) ? raw.offTopicChapter : null,
    wantsToStop: raw.wantsToStop === true,
    distress: raw.distress === "strong" || raw.distress === "mild" ? raw.distress : "none",
    answerLength:
      raw.answerLength === "very_short" || raw.answerLength === "rich" ? raw.answerLength : "short",
    doNotWrite,
    doNotWriteScope: !doNotWrite ? "none" : raw.doNotWriteScope === "topic" ? "topic" : "point",
  };
}
