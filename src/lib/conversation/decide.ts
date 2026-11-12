import { FOLLOW_UP_CAP } from "@/lib/constants";
import { isDontRemember, isEmotionalGap } from "@/lib/conversation/classify";
import {
  BETWEEN_US,
  CAP_TEMPLATE,
  DISTRESS_TEMPLATE,
  DO_NOT_WRITE_TEMPLATE,
  DONT_REMEMBER_FIRST,
  DONT_REMEMBER_SWITCH,
  MARKED_DO_NOT_WRITE_TEMPLATE,
  STOP_TEMPLATE,
  safeRefusalTemplate,
} from "@/lib/conversation/guard";
import type { Awaiting, Classification, MessageKind } from "@/lib/types";

export type DecisionKind =
  | "stop_ack"
  | "distress_ack"
  | "refusal_redirect"
  | "do_not_write_prompt"
  | "mark_do_not_write"
  | "cap_prompt"
  | "extend_and_ask"
  | "follow_up"
  | "do_not_write_ack"
  | "reassure_switch";

export interface Decision {
  kind: DecisionKind;
  useModel: boolean;
  template: string | null;
  messageKind: MessageKind;
  countsAsFollowUp: boolean;
  setExtended: boolean;
  setAwaiting: Awaiting | null;
  clearAwaiting: boolean;
  markTopicDoNotWrite: boolean;
  /** Point-level "not in the book" mark. Writing steps skip this message. */
  markPointDoNotWrite: boolean;
  endSession: boolean;
  expectsQuestion: boolean;
}

export interface DecideInput {
  classification: Classification;
  followupsUsed: number;
  extendedByUser: boolean;
  awaiting: Awaiting | null;
  consecutiveTopicRefusals: number;
  userText: string;
  refusedPoints: string[];
  /** How many earlier turns on this topic were "I don't remember". */
  priorDontRemember?: number;
}

export function trailingTopicRefusals(
  previous: Pick<Classification, "refusal" | "refusalScope">[],
  current: Pick<Classification, "refusal" | "refusalScope">,
): number {
  let count = 0;
  for (let index = previous.length - 1; index >= 0; index -= 1) {
    const item = previous[index];
    if (item?.refusal && item.refusalScope === "topic") count += 1;
    else break;
  }
  if (current.refusal && current.refusalScope === "topic") count += 1;
  return count;
}

export function declinesToContinue(text: string): boolean {
  const normalized = normalize(text);
  const words = normalized.split(/\s+/).filter(Boolean);
  if (words.length > 12) return false;
  return (
    /^(no|nope|nah)\b/.test(normalized) ||
    /\b(save|enough for today|stop for today|im done|i am done|call it a day)\b/.test(normalized)
  );
}

export function agreesToSkipTopic(text: string): boolean {
  const normalized = normalize(text);
  if (/^(no|nope|nah)\b/.test(normalized)) return false;
  if (/\b(dont|do not) (leave|skip|stop)\b/.test(normalized)) return false;
  return /\b(yes|yeah|yep|leave it out|dont ask|do not ask|stop asking|never ask|skip it)\b/.test(
    normalized,
  );
}

export function decideTurn(input: DecideInput): Decision {
  const classification = input.classification;
  const text = input.userText.trim();

  if (input.awaiting === "do_not_write_confirm") {
    if (agreesToSkipTopic(text)) {
      return decision({
        kind: "mark_do_not_write",
        useModel: false,
        template: MARKED_DO_NOT_WRITE_TEMPLATE,
        messageKind: "stop_ack",
        countsAsFollowUp: false,
        clearAwaiting: true,
        markTopicDoNotWrite: true,
        endSession: true,
        expectsQuestion: false,
      });
    }
    return modelFollowUp(input, true);
  }

  if (classification.wantsToStop || (input.awaiting === "cap_opt_in" && declinesToContinue(text))) {
    return decision({
      kind: "stop_ack",
      useModel: false,
      template: classification.doNotWrite ? `${BETWEEN_US} ${STOP_TEMPLATE}` : STOP_TEMPLATE,
      messageKind: "stop_ack",
      countsAsFollowUp: false,
      clearAwaiting: true,
      endSession: true,
      expectsQuestion: false,
      ...doNotWriteMarks(classification),
    });
  }

  if (classification.distress === "strong") {
    return decision({
      kind: "distress_ack",
      useModel: false,
      template: classification.doNotWrite ? `${BETWEEN_US} ${DISTRESS_TEMPLATE}` : DISTRESS_TEMPLATE,
      messageKind: "distress_ack",
      countsAsFollowUp: false,
      expectsQuestion: true,
      ...doNotWriteMarks(classification),
    });
  }

  if (classification.refusal) {
    if (classification.refusalScope === "topic" && input.consecutiveTopicRefusals >= 2) {
      return decision({
        kind: "do_not_write_prompt",
        useModel: false,
        template: DO_NOT_WRITE_TEMPLATE,
        messageKind: "do_not_write_prompt",
        countsAsFollowUp: false,
        setAwaiting: "do_not_write_confirm",
        expectsQuestion: true,
      });
    }
    return decision({
      kind: "refusal_redirect",
      useModel: false,
      template: classification.doNotWrite
        ? `${BETWEEN_US} ${safeRefusalTemplate(input.refusedPoints)}`
        : safeRefusalTemplate(input.refusedPoints),
      messageKind: "refusal_redirect",
      countsAsFollowUp: false,
      expectsQuestion: true,
      ...doNotWriteMarks(classification),
    });
  }

  if (classification.doNotWrite) {
    const atCap = !input.extendedByUser && input.followupsUsed >= FOLLOW_UP_CAP;
    return decision({
      kind: "do_not_write_ack",
      useModel: !atCap,
      template: atCap ? `${BETWEEN_US} ${CAP_TEMPLATE}` : null,
      messageKind: atCap ? "cap_prompt" : "follow_up",
      countsAsFollowUp: !atCap && !input.extendedByUser && input.followupsUsed < FOLLOW_UP_CAP,
      setAwaiting: atCap ? "cap_opt_in" : null,
      expectsQuestion: true,
      ...doNotWriteMarks(classification),
    });
  }

  if (isDontRemember(text)) {
    const again = (input.priorDontRemember ?? 0) >= 1 || isEmotionalGap(text, classification.distress);
    return decision({
      kind: "reassure_switch",
      useModel: false,
      template: again ? DONT_REMEMBER_SWITCH : DONT_REMEMBER_FIRST,
      messageKind: "reassure_switch",
      countsAsFollowUp: false,
      expectsQuestion: true,
    });
  }

  if (!input.extendedByUser && input.followupsUsed >= FOLLOW_UP_CAP) {
    if (input.awaiting === "cap_opt_in") {
      return decision({
        kind: "extend_and_ask",
        useModel: true,
        template: null,
        messageKind: "extended_follow_up",
        countsAsFollowUp: false,
        setExtended: true,
        clearAwaiting: true,
        expectsQuestion: true,
      });
    }
    return decision({
      kind: "cap_prompt",
      useModel: false,
      template: CAP_TEMPLATE,
      messageKind: "cap_prompt",
      countsAsFollowUp: false,
      setAwaiting: "cap_opt_in",
      expectsQuestion: true,
    });
  }

  return modelFollowUp(input, false);
}

function modelFollowUp(input: DecideInput, clearAwaiting: boolean): Decision {
  const extended = input.extendedByUser;
  const counts = !extended && input.followupsUsed < FOLLOW_UP_CAP;
  return decision({
    kind: extended ? "extend_and_ask" : "follow_up",
    useModel: true,
    template: null,
    messageKind: extended ? "extended_follow_up" : "follow_up",
    countsAsFollowUp: counts,
    clearAwaiting,
    expectsQuestion: true,
  });
}

function doNotWriteMarks(classification: Classification): Pick<Decision, "markTopicDoNotWrite" | "markPointDoNotWrite"> {
  if (!classification.doNotWrite) {
    return { markTopicDoNotWrite: false, markPointDoNotWrite: false };
  }
  if (classification.doNotWriteScope === "topic") {
    return { markTopicDoNotWrite: true, markPointDoNotWrite: false };
  }
  return { markTopicDoNotWrite: false, markPointDoNotWrite: true };
}

function decision(
  partial: Omit<
    Decision,
    "setExtended" | "setAwaiting" | "clearAwaiting" | "markTopicDoNotWrite" | "markPointDoNotWrite" | "endSession"
  > &
    Partial<Decision>,
): Decision {
  return {
    setExtended: false,
    setAwaiting: null,
    clearAwaiting: false,
    markTopicDoNotWrite: false,
    markPointDoNotWrite: false,
    endSession: false,
    ...partial,
  };
}

function normalize(text: string): string {
  return text.toLowerCase().replace(/['’]/g, "").replace(/\s+/g, " ").trim();
}
