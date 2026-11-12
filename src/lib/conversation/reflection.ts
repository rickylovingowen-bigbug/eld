export const LOOKBACK_QUESTION = "Why do you think that one stuck with you?";

const SCENE =
  /\b(kitchen|house|home|room|yard|porch|street|school|church|store|farm|barn|table|bed|window|smell|smelled|sound|sounded|door|stairs|garden|car|truck|river|field|classroom|upstairs|downstairs|hallway|driveway)\b/i;

const EVENT =
  /\b(walked|ran|fell|said|told|cooked|baked|packed|worked|came|went|ate|hit|cried|laughed|broke|built|drove|played|sat|stood|opened|closed|gave|took|left|found|saw|heard|watched|yelled|called|moved|lived|died|born|married|started|stopped|happened|washed|carried|waited|shouted|kissed|hugged|made|kept|flipped|shared|grew|raised|helped|brought)\b/i;

const DEFLECTION =
  /\b(dont know|do not know|not sure|beats me|cant say|cannot say|rather not|move on|skip|i forget|dont remember|do not remember|no idea|hard to say|cant answer|cannot answer)\b/i;

const INVENTED_MEANING =
  /\b(i bet|that taught you|you learned|that must have meant|what that means is|i think it meant|so you learned)\b/i;

export interface TopicMaterial {
  scene: string | null;
  event: string | null;
  hasScene: boolean;
  hasEvent: boolean;
}

export interface MaterialSheet {
  facts: { id: string; type: "event" | "place"; text: string; source_level: "self"; message_ids: string[] }[];
  sensory: [];
  quotes: [];
  meaning: { id: string; text: string; message_ids: string[] }[];
  people: [];
  off_chapter: [];
}

/** Scene and event from what the elder already said. The writing extractor replaces this when it has run. */
export function extractTopicMaterial(userMessages: string[]): TopicMaterial {
  const scene = userMessages.map(firstMatch(SCENE)).find((item) => item != null) ?? null;
  const event = userMessages.map(firstMatch(EVENT)).find((item) => item != null) ?? null;
  return { scene, event, hasScene: scene != null, hasEvent: event != null };
}

export function reflectionDue(input: {
  followupsUsed: number;
  alreadyAsked: boolean;
  distress: string;
  userMessages: string[];
}): boolean {
  if (input.followupsUsed !== 2 || input.alreadyAsked || input.distress !== "none") return false;
  const material = extractTopicMaterial(input.userMessages);
  return material.hasScene && material.hasEvent;
}

export function isLookbackQuestion(text: string): boolean {
  return /why do you think that one stuck with you|what do you make of that now/i.test(text);
}

export function isMeaningDeflection(text: string): boolean {
  const normalized = text.toLowerCase().replace(/['’]/g, "").replace(/\s+/g, " ").trim();
  if (!normalized) return true;
  if (DEFLECTION.test(normalized)) return true;
  const words = normalized.split(" ").filter(Boolean);
  return words.length <= 3 && /^(no|nah|nope|nothing|idk)$/.test(words.join(" "));
}

export function inventsMeaning(text: string): boolean {
  return INVENTED_MEANING.test(text);
}

/** The elder's words, unchanged, as the material sheet's meaning. Step 2 ends on this. */
export function materialSheet(input: {
  scene: string | null;
  event: string | null;
  meaning: string | null;
  meaningMessageId: string | null;
}): MaterialSheet {
  const facts: MaterialSheet["facts"] = [];
  if (input.scene) {
    facts.push({ id: "scene", type: "place", text: input.scene, source_level: "self", message_ids: [] });
  }
  if (input.event) {
    facts.push({ id: "event", type: "event", text: input.event, source_level: "self", message_ids: [] });
  }
  const meaning =
    input.meaning && input.meaningMessageId
      ? [{ id: "x1", text: input.meaning, message_ids: [input.meaningMessageId] }]
      : [];
  return { facts, sensory: [], quotes: [], meaning, people: [], off_chapter: [] };
}

/** Step 2 ending. Null means end on the last concrete beat and do not invent a meaning. */
export function endingMeaning(sheet: MaterialSheet): string | null {
  return sheet.meaning[0]?.text ?? null;
}

function firstMatch(pattern: RegExp): (text: string) => string | null {
  return (text) => {
    const match = text.match(pattern);
    return match?.[0] ?? null;
  };
}
