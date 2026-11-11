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

`pnpm db:setup` and `pnpm eval:run` read `.env.local` (and `.env`) themselves. A value already exported in the shell wins. You do not need to `export DATABASE_URL` first. `pnpm dev` loads the same file through Next.js.

Open http://localhost:3000. The home page recommends childhood topics. Start one, type, and press Send. Return inserts a new line and does not send.

### Mock and live models

`AI_MODE=mock` is the default. Mock replies are deterministic and do not call the network. Live mode also falls back to mock when no gateway credential is available.

`AI_MODE=live` sends every model through the Vercel AI Gateway. Locally and in CI that needs `AI_GATEWAY_API_KEY`. On Vercel the same gateway call authenticates with the deployment's OIDC token, so the key can be left unset. Model ids, temperature, and reasoning live in `config/models.json`. The verifier (`anthropic/claude-opus-5.5`) is called with reasoning effort `medium` and no temperature. Prices used for `model_calls.cost_usd` are in `config/prices.json`.

Topic and model JSON are imported into the server bundle. The interviewer prompt is `prompts/ai-prompts-v1.md`, traced into that same bundle. Edit those files and rebuild.

### Database

`pnpm db:setup` applies `supabase/migrations/` and seeds Ricky, the ten chapters, and the twelve childhood topics. Topic text comes from `config/childhood-topics-v1.json`.

If you use the Supabase CLI and Docker:

```bash
supabase start
supabase db reset
pnpm db:seed
```

Put the printed database URL in `DATABASE_URL`. Without Docker, any Postgres 15+ database works the same way through `DATABASE_URL`. A local URL (`localhost`, `127.0.0.1`) stays on a normal pool with SSL off. Any other host uses SSL and a single connection, reused across warm invocations. A Supabase transaction pooler URL (port 6543) also turns prepared statements off.

`db/schema.sql` is the same schema and seed in one idempotent file, for a hosted database that you apply with plain SQL:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/schema.sql
```

Running it again is safe. `pnpm db:schema` rewrites that file from the migration and `config/`.

Schema notes are in `docs/schema-fixes.md`.

### Deploying to Vercel

Set these environment variables on the project:

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Hosted Postgres connection string. Use the Supabase transaction pooler (port 6543). SSL is required. |
| `ACCESS_PASSWORD` | When set, every page asks for this password. Leave it unset for local dev, and there is no gate. |
| `AI_MODE` | `mock` or `live`. |
| `AI_GATEWAY_API_KEY` | Gateway key for live mode outside Vercel. On Vercel, omit it: AI Gateway authenticates with the deployment OIDC token. |

Apply `db/schema.sql` before the first request. `src/proxy.ts` (Next.js middleware) checks an httpOnly cookie on every route except `/unlock`, `POST /api/unlock`, and static assets. The password page is `/unlock`: one field and an Open button. A correct password sets that cookie for 90 days, signed with a key derived from `ACCESS_PASSWORD`. The cookie is `Secure` on HTTPS. Wrong guesses are limited per IP in the function's memory. Pages send `X-Robots-Tag: noindex` and `/robots.txt` disallows everything.

`pnpm build` is the Vercel build. Eval files are not part of the server bundle.

### Evals

```bash
pnpm eval:run
pnpm test
```

The eval set is `eval/v0.1/`. The format is described in `docs/eval-scenarios.md`.

### iPhone

The app is built for a 393×852 screen. Safari on a phone needs HTTPS, so put a tunnel in front of the local server:

```bash
pnpm dev
# in another terminal
cloudflared tunnel --url http://localhost:3000
```

`ngrok http 3000` works the same way. Open the HTTPS URL the tunnel prints, not `localhost`. Start, Not now, the language toggle, and Done for today post to the app and redirect back. Those redirects use `x-forwarded-host` and `x-forwarded-proto` when the tunnel sends them. If the tunnel only marks the scheme as HTTPS and the host is still localhost, the redirect is a relative path so the phone stays on the tunnel host.

Text size follows the system: the story header wraps "Done for today" under the topic name, and the current question and the input stay on screen.

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
