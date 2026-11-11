# Eval files

The v0.1 set lives in `eval/v0.1/` and is the format the CLI reads. Do not invent a second scenario shape.

| File | Role |
|---|---|
| `classifier-cases.jsonl` | 85 single-message gold labels. Nine classifier fields, including `do_not_write` and `do_not_write_scope`. |
| `personas.json` | 30 simulated elders. Each case has `persona`, `topic_id`, `script`, and `review_status`. |
| `rubric.md` | Pass/fail interviewer rubric and the judge JSON shape. |
| `README.md` | How a live run should call the models. |

## Commands

```bash
pnpm eval:run                      # classifier cases + all 30 personas
pnpm eval:run -- --classifier      # classifier accuracy only
pnpm eval:run -- --personas        # conversations only
pnpm eval:run -- --case=p01-house-short-trap
pnpm eval:run -- --include-drafts  # fold the 10 draft personas into the baseline averages
```

Every persona in the current set is `review_status: ready` and counts toward the baseline. A case whose status contains `draft` would still be reported separately.

With no `AI_GATEWAY_API_KEY`, the run uses the mock provider and the scripted `sample_utterance` / `sample_messages` lines. Split messages are classified one by one, then the interviewer answers once. `AI_MODE=live` uses the gateway models named in `config/models.json`. `--judge` reserves the rubric E slot; the mock run leaves `leadingQuestionJudge.score` null and reports a code heuristic for leading questions.

A case can be typed the way an elder types: all lowercase, no punctuation, typos, one thought split across `sample_messages`, or one long `sample_utterance`.

Persona gold objects were given `do_not_write` and `do_not_write_scope` so they match the nine-field schema. Utterances that ask to keep something out of the book are `point` unless they explicitly say the whole topic stays out.

## What the summary reports

- Classifier per-field accuracy, exact-set accuracy, and confusion for `refusal`, `do_not_write`, and `distress`.
- Refusal-respected rate, max follow-ups per topic (a fourth follow-up fails), one-question-per-turn, and leading-question rate.
- A judge slot `{ score: null, status }` for leading questions, filled when a live judge run is added.
- `runWritingPipeline()` is the v0.2 hook. It returns skipped steps today.

Results are written to `evals/out/<timestamp>/summary.json`.
