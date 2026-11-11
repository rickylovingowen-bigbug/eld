/**
 * Messages the v0.2 writing steps must not see.
 * The row stays in `messages` unchanged. This is a filter, not a delete.
 */
export function messageIdsExcludedFromWriting(input: {
  messages: { id: string; topicId: string | null }[];
  doNotWriteMessageIds: string[];
  doNotWriteTopicIds: string[];
}): string[] {
  const skippedTopics = new Set(input.doNotWriteTopicIds);
  const skippedMessages = new Set(input.doNotWriteMessageIds);
  return input.messages
    .filter((message) => skippedMessages.has(message.id) || (message.topicId != null && skippedTopics.has(message.topicId)))
    .map((message) => message.id);
}
