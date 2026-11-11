# Memoir (v0.1)

A mobile-first Next.js app that helps one elder, Ricky, tell childhood stories. This version is the conversation: home, a story page, the turn classifier, and the interviewer. Writing the story, the book, and the chapter come in later versions and already have tables, prompts, and a pipeline hook.

The interface is English and Chinese. The conversation itself stays in English.

## Setup

Node 22 and pnpm. Postgres, either local Supabase or a plain database.

```bash
cp .env.example .env.local
pnpm install
pnpm db:setup
pnpm dev
```

Open http://localhost:3000. The home page recommends childhood topics. Start one, type, and press Send. Return inserts a new line and does not send.

### Mock and live models

`AI_MODE=mock` is the default, and it is also what you get when `AI_GATEWAY_API_KEY` is empty. Mock replies are deterministic and do not call the network.

`AI_MODE=live` with `AI_GATEWAY_API_KEY` set sends every model through the Vercel AI Gateway. Model ids, temperature, and reasoning live in `config/models.json`. The verifier (`anthropic/claude-opus-5.5`) is called with reasoning effort `medium` and no temperature. Prices used for `model_calls.cost_usd` are in `config/prices.json`.

Prompts are read from `prompts/ai-prompts-v1.md`. Banned phrases and topics are read from `config/`. Edit those files and the next request picks them up.

### Database

`pnpm db:setup` applies `supabase/migrations/` and seeds Ricky, the ten chapters, and the twelve childhood topics. Topic text comes from `config/childhood-topics-v1.json`.

If you use the Supabase CLI and Docker:

```bash
supabase start
supabase db reset
pnpm db:seed
```

Put the printed database URL in `DATABASE_URL`. Without Docker, any Postgres 15+ database works the same way through `DATABASE_URL`.

Schema notes are in `docs/schema-fixes.md`.

### Evals

```bash
pnpm eval:run
pnpm test
```

The eval set is `eval/v0.1/`. The format is described in `docs/eval-scenarios.md`.

### iPhone

The app is built for a 393×852 screen. Serve it over HTTPS so Safari on a phone can open it:

```bash
pnpm dev
# in another terminal, any one of:
cloudflared tunnel --url http://localhost:3000
ngrok http 3000
```

Open the HTTPS URL in Safari. Text size follows the system: the story header wraps "Done for today" under the topic name, and the current question and the input stay on screen.

## Checks

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

## What v0.1 includes

- Home, with three recommended topic cards, Not now, Don't ask me about this, free talk, and a Continue card for an open session.
- Story page: the topic's opening question first, streamed replies, one question per turn, at most three follow-ups unless Ricky asks to keep going, refusal and "don't put that in the book" handled in code.
- Drafts and a pending send are stored in `localStorage`. A refresh keeps sent messages (they are in Postgres) and unsent text.
- Thinking appears if the first token takes longer than 5 seconds. Try again appears at 20 seconds and reuses the same message id.

P3–P6 are placeholders. `src/lib/pipeline/run.ts` is the empty writing hook for v0.2.
