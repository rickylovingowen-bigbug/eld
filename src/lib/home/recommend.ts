import type { TopicStatus, TopicWithStatus } from "@/lib/types";

const HIDDEN: TopicStatus[] = ["told", "do_not_write"];

/**
 * Recommendation pool for the home cards.
 * Sensitive topics never appear. not_now is skipped while anything is still recommendable,
 * then comes back. do_not_write and told stay out.
 */
export function recommendableTopics(topics: TopicWithStatus[]): TopicWithStatus[] {
  const pool = topics
    .filter((topic) => !topic.sensitive && topic.recommendByDefault && topic.recommendRank != null)
    .filter((topic) => !HIDDEN.includes(topic.status))
    .sort((a, b) => (a.recommendRank ?? 99) - (b.recommendRank ?? 99));
  const primary = pool.filter((topic) => topic.status === "recommendable");
  if (primary.length > 0) return primary;
  return pool.filter((topic) => topic.status === "not_now");
}

export function layoutHomeTopics(
  topics: TopicWithStatus[],
  continueTopicId: string | null,
): { hero: TopicWithStatus | null; cards: TopicWithStatus[] } {
  const pool = recommendableTopics(topics).filter((topic) => topic.id !== continueTopicId);
  if (continueTopicId) {
    return { hero: null, cards: pool.slice(0, 3) };
  }
  return { hero: pool[0] ?? null, cards: pool.slice(1, 4) };
}
