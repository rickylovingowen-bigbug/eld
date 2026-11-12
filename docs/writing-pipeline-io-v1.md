# Writing pipeline: I/O spec v1 (owner: ai)

Four background steps per story, plus one chapter step. Every step's output is stored separately (see PRD "信息链路"). All ids refer to saved messages (both user and AI messages).

Source levels for every fact:
- `self`: the user said it in their own words
- `confirmed`: the AI's question carried the detail and the user only agreed ("Yes, the red one"). Use cautiously and never as a vivid detail.
- `family`: the user says they heard it from family ("my mother told me…")

User-edited sentences are `locked`. No step may change or contradict them, and they count as the strongest source.

---

## Step 1: Extract (no prose)
Input: `topic_id`, messages for this topic (new ones only on incremental runs), existing fact table, locked sentences.
Output:
```json
{
  "facts": [
    {"id": "f1", "type": "event|person|place|time|object", "text": "We lived on Elm Street", "source_level": "self|confirmed|family",
     "message_ids": ["m12"], "certainty": "sure|unsure", "unsure_note": "said 'I think it was 52'"}
  ],
  "sensory": [{"id": "s1", "text": "kitchen smelled like cinnamon", "message_ids": ["m14"], "source_level": "self"}],
  "quotes":  [{"id": "q1", "text": "Lord, that dog could run", "message_ids": ["m15"]}],
  "meaning": [{"id": "x1", "text": "That's when I knew Dad trusted me", "message_ids": ["m18"]}],
  "people":  [{"name": "Tommy", "relation": "best friend", "message_ids": ["m9"]}],
  "off_chapter": [{"chapter_id": "work", "message_ids": ["m20"]}]
}
```

## Step 2: Structure
Input: Step 1 output.
Output:
```json
{
  "opening_image": "s1",
  "beats": [{"order": 1, "uses": ["f1","s1"]}, {"order": 2, "uses": ["f3","q1"]}],
  "ending_meaning": "x1 | null (if null, end on the last concrete beat and never invent meaning)",
  "gaps": [{"id": "g1", "about": "what happened after the dog ran off", "next_question": "What happened when you finally caught up with Rex?", "priority": 1}],
  "enough_for_story": true
}
```
`gaps` go to the follow-up table and are never shown in the UI. The next session asks one of them as its first question.

## Step 3: Draft
Input: Step 2 output, Step 1 tables, the writing spec from 传记作者 (rules and few-shot examples), locked sentences.
Allowed: reordering, connective words, merging repeated statements, and turning Q&A into continuous first-person narration.
Not allowed: any new fact, feeling, sensory detail, or adjective that isn't in the tables. No summarized meaning beyond `meaning`.
Output:
```json
{
  "title": "The House on Elm Street",
  "sentences": [{"id": "d1", "text": "...", "sources": ["f1","s1"], "locked": false}],
  "word_count": 640
}
```

## Step 4: Verify
Code pass first: drop every sentence with an empty or unknown `sources`.
Model pass second: for each sentence, compare it with its source messages.
Output:
```json
{
  "checks": [{"sentence_id": "d3", "verdict": "ok|added_detail|moral|voice_drift|distorted|overclaims_certainty|uses_confirmed_as_vivid",
              "fix": "remove 'yellow'"}],
  "uncertain": [{"sentence_id": "d2", "span": "1952", "user_prompt": "Was it 1952 or 1953?"}],
  "final_sentences": ["d1","d2","d4"]
}
```
Only `uncertain` items carry a user-facing `user_prompt` (shown as an amber underline). Gaps do not.

---

## Chapter step
Input: confirmed stories only (status `confirmed` or `user_confirmed`), their fact tables, and the chapter spec.
Rules: order stories chronologically; transition sentences must cite facts; no new facts. If no sourced transition exists, use a section break. If the chapter is short, never pad; report missing words and the top gaps.
Target length for the internal beta is 2,500 to 4,000 words.
Output: the same `sentences` shape as Step 3, plus `story_order`. Then Step 4 runs on the chapter.

---

## Eval hooks (logged per run)
- Fabrication rate: Step 4 non-`ok` verdicts divided by total sentences, before fixes are applied
- Sentences the code dropped
- Share of `confirmed`-level facts used as vivid details
- Words per story, and gaps per story
- Model, tokens, cost, and latency per step
