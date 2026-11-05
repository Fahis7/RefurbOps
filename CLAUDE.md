# CLAUDE.md – project context for AI coding agents

RefurbOps: operations app for a refurbished-electronics business (intake → grading → repair → QC →
multi-marketplace listing → sale). Next.js 16 App Router, React 19, TypeScript strict, Vitest.

## Commands
- `npm run dev`: start the app at http://localhost:3000
- `npm test`: unit tests (must pass before any change is done)
- `npm run typecheck`, `npm run build`: both must be clean
- `npm run build:demo`: static single-file demo in `demo-dist/`

## Architecture rules (do not break)
- `src/domain` is **pure**: no `fetch`, `fs`, `Date.now()`, React or Next imports. Time is passed in as `now`.
- Every write is a use case in `src/domain/service.ts` with the signature `(state, input, now) => newState`.
- Business-rule violations throw `DomainError` (mapped to HTTP 400). Never return error strings.
- API routes stay thin: parse → validate → `transact(...)` → `snapshot(...)`. No business logic in routes.
- Stage changes only through `pipeline.ts` (`TRANSITIONS`). SOLD only via `handleOrder`.
- UI calls the `Api` interface (`src/client/api.ts`), never `fetch` directly.

## Conventions
- Money in EUR as numbers; round only for display or at the 2-decimal boundary.
- No new dependencies without a reason in the PR description.
- Every new business rule gets a test in `tests/`. Bug fix = failing test first.
- LLM output is untrusted: validate it (see `parseListingResponse`) and always have a fallback.

## Definition of done
Typecheck clean · tests green · `next build` clean · feature tried in the browser · docs updated if
behaviour changed.
