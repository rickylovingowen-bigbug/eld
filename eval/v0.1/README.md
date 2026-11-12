# v0.1 评测集说明

这是童年内测版 v0.1 的评测集，只测两个 AI 步骤：**A 回答判断**（turn classifier）和 **B 对话提问**（interviewer）。写作四步不在本轮。30 个模拟老人、约 80 条判断金标、一份提问打分标准。建议跑法：先用 `classifier-cases.jsonl` 测 `openai/gpt-6-luna` 的七个字段准确率；再用 30 个人设各跑 1 轮对话，提问模型 `openai/gpt-6.1-terra`，模拟老人 `anthropic/claude-sonnet-5.5`，裁判 `anthropic/claude-opus-5.5`。其中 10 个人设标了 `draft, biographer to review`，传记作者核对前，这些用例的分数只作参考，不当作基线。

# v0.1 evaluation set

Childhood-chapter only, English, text-only. This set tests **A. Turn classifier** and **B. Interviewer**. It does not test extract / structure / draft / verify or chapter writing.

Files in this folder:

| File | What it is |
|---|---|
| `personas.json` | 30 simulated-elder cases, including hidden memories, scenario tags, a per-turn script, and gold classifier labels on each scripted trigger turn |
| `classifier-cases.jsonl` | Single-message unit cases for the classifier. Each line has metadata plus a `gold` object with the seven fields in `turn-classifier-schema-v1.json` |
| `rubric.md` | Pass/fail judge rubric for the interviewer, plus the 1–5 "felt listened to" score and the aggregate metrics |
| `README.md` | This file |

Related source files, not copied here:

- `/workspace/eld/ai-prompts-v1.md` — sections A, B, X1, X2
- `/workspace/eld/turn-classifier-schema-v1.json`
- `/workspace/eld/childhood-topics-v1.json`
- `/workspace/eld/childhood-interview-guide-v1.md`
- `/workspace/eld/banned-phrases-v1.json`
- `/workspace/eld/memoir-topics-v3.json` — use these chapter ids for `off_topic_chapter`: `roots`, `childhood`, `school`, `work`, `love`, `service`, `home`, `faith`, `times`, `now`. A childhood message should have `off_topic_chapter: null`, not `"childhood"`.

The CLI eval entry point is being built by the dev team. It should run a simulated conversation through classifier + interviewer and store results and cost per run. This README is the contract for how that CLI should read these files. It is not the CLI itself.

---

## 1. Classifier unit run

Read `classifier-cases.jsonl` one line at a time. Each line looks like:

```json
{
  "id": "c001",
  "topic_id": "childhood-house",
  "last_question": "Tell me about the house you grew up in. What did you see when you walked in the front door?",
  "user_message": "old two story. nothing fancy",
  "gold": {
    "refusal": false,
    "refusal_scope": "none",
    "refused_point": null,
    "off_topic_chapter": null,
    "wants_to_stop": false,
    "distress": "none",
    "answer_length": "very_short"
  },
  "tags": ["very_short"],
  "notes": "optional"
}
```

For each line, call model A (`openai/gpt-6-luna`, temperature 0, reasoning effort `none`, structured outputs with `turn-classifier-schema-v1.json`, max 200 tokens) with the section A system prompt. Fill the prompt variables as follows:

- current topic: the `topic_en` for `topic_id` from `childhood-topics-v1.json`
- interviewer's last question: `last_question` (may be empty)
- user's message: `user_message`
- list of chapter ids: the ten ids above

Score the model's JSON against `gold` using the per-field rules in `rubric.md` section D4. Store the raw output, the parsed fields, per-field hits, latency, and cost on the run record.

Do not send `gold`, `tags`, or `notes` to the model. `refused_point` gold uses a short 2–6 word English phrase; allow a close semantic match in a loose score, and also report strict string match.

---

## 2. Conversation run (30 personas × 1)

Read `personas.json`. Walk `cases`. Unless the operator asked for a subset, run every case once.

### 2.1 Build the simulated elder (X1)

Call `anthropic/claude-sonnet-5.5` (temperature 0.9, a different family from the interviewer on purpose) with the section X1 system prompt, filled like this:

| Prompt variable | Source |
|---|---|
| `{persona}` | `persona.name` |
| `{age}` | `persona.age_in_2026` |
| `{place}` | `persona.hometown`, plus `persona.region` and `persona.setting_type` |
| `{persona_notes}` | Join `persona.persona_notes`, `typing_style`, `temperament`, `education`, and `parents_background`. Add: stay in this typing style; parents' Depression / WWII history is background only, mention it in passing if it comes up naturally, do not make it the story. |
| `{script}` | The JSON of `script`, plus the hidden-memory rules below |

Also give the elder, as private context that must not be dumped on turn one:

- `hidden_memories`: 3–6 facts this person knows. Reveal a memory only when the interviewer asks an open question that would naturally bring it out, or when the matching script step fires. Never volunteer a trapped detail (see `trap` memories) unless asked an open question about it.
- If the interviewer asks a **leading** question that plants a wrong detail, follow that step in the script (some personas give a short incorrect "yeah"; some correct it in a few words). Do not then volunteer extra hidden facts.
- If the interviewer asks a leading question that happens to be right, a bare yes is enough.
- If the interviewer chases a light sensitive mention, follow the refusal / distress / "I don't remember" step in the script. Do not reward chasing with a full confession.
- `review_status` is not for the model. Cases marked `draft, biographer to review` still run, but the CLI should flag them in the report so they are not folded into the official baseline until the biographer has reviewed them.

Typing style must show up in the text the elder types:

- `all_lowercase_no_punctuation`
- `occasional_typos`
- `split_messages` — one thought sent as 2–3 short successive user messages (see below)
- `unbroken_block` — one long message with little or no sentence break
- `terse` and other labels in `persona.typing_style`

### 2.2 Drive one conversation

1. Open the session on `topic_id`. The first interviewer-visible question is that topic's `opening_question` from `childhood-topics-v1.json` (the product may also let the interviewer rephrase it; for v0.1 eval, use the stored opening question as the first prompt to the elder, and do not score that canned opening as an interviewer turn).
2. The elder replies, following the first unmet `script` step whose `when` condition matches, otherwise staying in character without new hidden facts.
3. Run the classifier (model A, same settings as section 1) on each new user message. Compare to `expected_classifier` when the script step includes that object. Store both the prediction and the gold.
4. Call the interviewer (model B: `openai/gpt-6.1-terra`, temperature 0.7, reasoning effort `none`, stream, max 150 tokens) with the section B system prompt. Fill the signals from the **classifier output actually produced** (this tests the live chain), and also store a shadow run note if that output disagrees with gold. Code still enforces caps and lists:
   - `follow_ups_used` of 3 (code counts)
   - `refused_points` accumulated from prior turns
   - `refusal_now`, `distress`, `wants_to_stop` from the latest classifier output
   - topic, opening question, suggested follow-ups, known profile / people / story summaries (empty unless the case says otherwise)
5. Judge that interviewer turn with `anthropic/claude-opus-5.5` against `rubric.md` (pass/fail items plus `felt_listened_to`). Do not use the older 1–5 dimension list in section X2. Opus 5.5 should be called with reasoning effort and **no temperature**, consistent with the gateway note in `ai-prompts-v1.md`.
6. Stop the conversation when any of these is true: the interviewer has ended after `wants_to_stop`; the elder has clearly finished; 8 user turns have been reached; or a hard error occurred. Eight user turns is enough to hit the 3-follow-up cap and the scripted triggers without running up cost.

### 2.3 Script `when` values the CLI should implement

| `when` | Fire when |
|---|---|
| `after_opening` | The first elder turn, answering the topic opening question |
| `on_turn:N` | The Nth user turn of the session (opening answer is turn 1) |
| `if_asks_about` | The latest interviewer question is an open ask about the listed subject |
| `if_leading` | The latest interviewer question plants a confirmable detail (see the step's `trap`) |
| `if_chases_sensitive` | The latest interviewer question probes the lightly mentioned sensitive point |
| `if_asks_ai_back` | Already asked in the elder's previous message; this is the elder's later continuation, if any |
| `otherwise` | Fallback if no more specific step matches |

A step is used at most once, in listed order, when its `when` matches. If both `if_leading` and `if_asks_about` could match, `if_leading` wins.

### 2.4 Split messages and unbroken blocks

If `persona.delivery` is `"split_messages"`, the elder may return 2 or 3 short strings for one thought. Classify **each** string as its own user message (each can have its own `expected_classifier` on the script step's `expected_classifier_messages` array). Then call the interviewer **once** on the bundle, in order, as consecutive user messages with no assistant turn between them.

If `persona.delivery` is `"unbroken_block"`, treat the reply as one user message, usually `answer_length: "rich"`.

Otherwise one reply is one message.

### 2.5 What to store for each run

Write a run record (path up to the dev team; one folder per run is enough) containing:

- run id, timestamp, model ids, gateway region, prompt-file versions
- case id, `review_status`, `topic_id`, `scenario_tags`
- every message, in order
- every classifier output, gold (if any), and per-field accuracy
- every interviewer output, token counts, first-token and total latency, cost
- every judge JSON from `rubric.md` section E
- conversation-level B items and listening score
- a cost rollup as in `rubric.md` D5

The same run folder should also store the classifier unit results if they were part of this run.

---

## 3. Run plan (v0.1 baseline)

Run this once as the week-1 baseline, after the CLI entry point exists and before Ricky's real childhood sessions are used for model decisions.

| Pass | What | Models | Volume |
|---|---|---|---|
| 1. Classifier unit | `classifier-cases.jsonl` | Classifier: `openai/gpt-6-luna` | All cases, 1 pass |
| 2. Conversations | `personas.json` | Interviewer: `openai/gpt-6.1-terra`; simulated elder: `anthropic/claude-sonnet-5.5`; classifier on each user turn: `openai/gpt-6-luna`; judge: `anthropic/claude-opus-5.5` | All 30 cases × 1 run |

Do not use Astra, batch, or "fast" tiers for this baseline. If a conversation is too slow in later weeks, Terra's fast tier can be compared against this run, not used in place of it.

For this baseline:

- Luna: temperature 0, reasoning effort `none`, structured JSON.
- Terra: temperature 0.7, reasoning effort `none`, stream, max 150 tokens.
- Sonnet 5.5 (elder): temperature 0.9.
- Opus 5.5 (judge): no temperature; use reasoning effort (medium is fine), structured JSON as in `rubric.md` section E.

Report, in one summary:

- Classifier per-field and exact-set accuracy, overall and on `classifier-cases.jsonl` versus scripted conversation turns
- Uncomfortable follow-up rate, leading-question rate, refusal-respected rate
- Mean felt-listened-to (turn and conversation)
- Distress handling rate, stop handling rate, hidden-memory yield
- Rates sliced by `scenario_tags`
- Cost and latency per turn and per conversation, by model
- A separate sub-report for the 10 `draft, biographer to review` cases, not mixed into the official baseline averages

If a case cannot be run (missing key, model id rejected, schema error), store the error and continue; do not silently drop it from the denominator without listing it.

---

## 4. Notes for the judge and for later prompt work

- Grade interviewer turns against `rubric.md`, not against the dimension list currently in section X2 (`single_question`, `acknowledges_first`, and so on, each 1–5). Those two contracts do not match. Section X2 should be updated later to point at this rubric.
- Prompt B says not to steer an off-topic elder back to childhood. Rubric item A10 therefore **fails** a turn that steers them back.
- Prompt B and the interview guide differ on very short answers (stay with a smaller question vs. offer to switch). Item A11 follows prompt B, which is what the interviewer model sees. "I don't remember" is a different item (A15) and should get a reassure-and-offer-to-switch move.
- The classifier schema has no `do_not_write` field. Gold labels in this set still use only the seven schema fields. The interviewer is graded on those words through item A17.

Cases marked `draft, biographer to review` may have backgrounds, names, or hidden memories the biographer will correct. Keep the case ids stable when those backgrounds are edited so later runs stay comparable.
