import childhoodFile from "../../../config/childhood-topics-v1.json";
import memoirFile from "../../../config/memoir-topics-v3.json";
import type { TopicContent } from "@/lib/types";

interface ChildhoodFile {
  version: string;
  chapter: string;
  recommend_order: string[];
  topics: {
    id: string;
    topic_en: string;
    topic_zh: string;
    sensitive: boolean;
    recommend_by_default: boolean;
    opening_question: string;
    card_hint_en?: string;
    follow_ups: string[];
  }[];
}

interface MemoirFile {
  chapters: { id: string; en: string; zh: string; optional: boolean }[];
}

export interface ChapterRecord {
  id: string;
  title: { en: string; zh: string };
  optional: boolean;
  sortOrder: number;
}

export function loadChapters(): ChapterRecord[] {
  const file = memoirFile as MemoirFile;
  return file.chapters.map((chapter, index) => ({
    id: chapter.id,
    title: { en: chapter.en, zh: chapter.zh },
    optional: chapter.optional,
    sortOrder: index + 1,
  }));
}

export function loadChildhoodTopics(): TopicContent[] {
  const file = childhoodFile as ChildhoodFile;
  const rank = new Map(file.recommend_order.map((id, index) => [id, index + 1]));
  return file.topics.map((topic) => ({
    id: topic.id,
    chapterId: file.chapter,
    title: { en: topic.topic_en, zh: topic.topic_zh },
    openingQuestion: topic.opening_question,
    cardHint: topic.card_hint_en ?? topic.opening_question,
    followUps: topic.follow_ups,
    sensitive: topic.sensitive,
    recommendByDefault: topic.recommend_by_default,
    recommendRank: rank.get(topic.id) ?? null,
    configVersion: file.version,
  })) as (TopicContent & { configVersion?: string })[];
}

export function childhoodConfigVersion(): string {
  return (childhoodFile as ChildhoodFile).version;
}

/** Changes when the bundled topic files change, so a warm instance re-seeds once. */
export function catalogRevision(): string {
  return JSON.stringify(childhoodFile) + JSON.stringify(memoirFile);
}
