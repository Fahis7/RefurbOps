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
