# How AI was used to build this

This project was built with AI coding tools as a partner. The AI did a lot of the typing, but
the architecture, the business rules and the final check of every line stayed with the engineer.

## Workflow

| Phase | Engineer | AI (Claude Code / Claude) |
|---|---|---|
| **Understand** | Mapped the business: intake → grading → repair → QC → multi-marketplace sale. Picked the 3 real pain points (visibility, QC, oversell). | Researched how refurb marketplaces grade devices and handle fees. |
| **Design** | Chose the layering (pure domain, thin adapters), the state machine, and the idempotency/oversell rules. Wrote `CLAUDE.md` with conventions and constraints. | Challenged the design and listed edge cases (webhook retries, racing orders, re-QC after repair). |
| **Build** | Worked in small slices: domain first, then API, then UI. Reviewed each diff before moving on. | Generated the first draft of each slice from a precise spec; wrote boilerplate (forms, CSS, route wiring). |
| **Verify** | Wrote tests for the rules that matter most. Ran the API end to end with `curl`, including two orders fired at the same time. | Drafted test cases from the spec; I added the adversarial ones. |
| **Document** | Decided what to explain and why (trade-offs, production path). | Drafted the docs; I edited them for accuracy. |

## How AI-generated code is reviewed before it's trusted

1. **Read every line.** If I can't explain it, it doesn't get merged.
2. **Business rules live in one place** (`src/domain`) and each rule has a test. The AI can rewrite
   the UI freely; it can't quietly change a rule without a test failing.
3. **Tests target what AI tends to get wrong:** edge cases, concurrency, idempotency, invalid input,
   and output from the LLM itself.
4. **Run it for real.** Type-check, run the tests, build, then use the real API (including a race condition).
5. **Check for made-up APIs** against the official docs (Next.js 16 route `params` is a Promise, for example).
6. **Security pass:** input validation on every route, no secrets in code (`.env.example`), clean 400s
   instead of stack traces.
7. **No unnecessary dependencies.** Charts are about 40 lines of React instead of a charting library.

## Real example from this build

The first draft of the sync log generated IDs from a module-level counter. It looked fine and the
app ran. The determinism test in `tests/seed.test.ts` failed, though: that counter kept counting
across runs, so IDs depended on process history and could collide across server instances.
The fix was to move the counter into application state (`nextLogId`). That is exactly the kind of
subtle bug AI code introduces and a good test suite catches.

## Guardrails on the AI *feature* (listing generator)

- The prompt gives the model **only verified facts** (from intake, grading and QC) and forbids inventing specs.
- The output is parsed as **untrusted input**: it must be JSON, have a title of 80 characters or less, a real
  description, and must never claim "brand new".
- Timeout of 20 s; any failure **falls back to a deterministic template**, so the business never
  waits on the AI.
- The source (`ai` or `template`) is stored on every listing, for auditing.

## Guardrails on the AI Ops Assistant (*Ask AI*)

- **The model never does maths.** `buildAssistantContext` (pure, `src/domain/assistant.ts`) pre-computes
  stuck devices vs SLA, sales for the last 7 / 30 days and all time (every model and marketplace,
  with `profit()` and pre-computed profit per sale), and QC returns per
  supplier. The prompt forbids estimating, inventing or calculating new numbers and requires saying so when the data
  can't answer.
- **Device text is data, not instructions.** The context is JSON inside `<ops_data>`, with `<` and `>`
  escaped so a supplier or model name cannot close the tag; the question sits in its own `<question>`
  tag after it, and the system prompt says to ignore instructions inside the data.
- **Output is untrusted.** `parseAssistantAnswer` rejects empty output and caps length; the UI renders
  it as plain text (no HTML), and only device IDs that actually exist become links.
- **Stateless, key server-side.** `POST /api/ai/ask` validates input (question 1–500 chars, context
  ≤ 100 KB), times out after 20 s, rate-limits per IP (best effort) and stores nothing. No key → 503.
- Every answer carries the note *"AI answer based on current app data – check before acting."*
- Model calls use low effort with a 2,000-token budget and must finish with `stop_reason: "end_turn"`: a cut-off
  (`max_tokens`) or `refusal` answer is rejected (502), never shown. Current models think by default and
  thinking tokens count against `max_tokens` – a 400-token budget once produced a half answer.

### Known limitations (Ask AI)

Evaluated 2026-11-06 with 15 real calls (4 suggested questions + a prompt-injection supplier name, 3 runs each)
on the demo seed data, every number and device ID checked by hand against the context sent:
all 15 correct, injection never followed, 0 timeouts, 70–137 words.

- **Latency outlier:** 14 calls took 2.4–3.8 s, one took 14.5 s – under the 20 s timeout, but close enough
  that a slower day could produce an occasional "AI is unavailable" error.
- **Medium effort timed out:** an earlier round at `effort: "medium"` timed out on 3 of 15 calls (2 of 3 for
  "Where is profit lowest?"), so the assistant stays on `low`.
- **Wording slips (soft):** answers sometimes offer a breakdown they have already given (e.g. "I can also
  break this down by marketplace" after a marketplace line). Ambiguous questions get a stated interpretation.
- The evaluation covers one dataset and one injection pattern; the model is non-deterministic, so re-run
  the check after any prompt or model change.

