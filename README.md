# ♻ RefurbOps

**Operations software for a refurbished-electronics business:** track every device from supplier
intake through grading, repair and QC to a sale on multiple marketplaces, without overselling.

Built with Next.js 16, React 19, TypeScript (strict) and Vitest, plus the Claude API for listing generation.

---

## What it does

| Feature | Business problem it solves |
|---|---|
| **Repair pipeline board**: Received → Grading → Repair → QC → Listed → Sold, with time-in-stage and SLA warnings | "Where is every device, and where is stock stuck?" |
| **QC checklist per device type** (phones get camera/SIM checks, laptops get keyboard checks); listing is **blocked** until every check passes | Nothing reaches a customer without passing QC |
| **Grading + pricing**: grade A/B/C from cosmetic score and battery health; suggested price from cost, repairs and grade | Consistent grading and margins, without a spreadsheet |
| **Multi-marketplace sync** (Back Market, refurbed, Amazon Renewed, simulated): idempotent order webhooks, first order wins, auto-delist elsewhere, late orders rejected with 409 | **Overselling** a single physical unit |
| **AI listing generator**: Claude writes the marketplace copy from verified facts only; output validated; template fallback | Hours of copywriting, without the AI inventing specs |
| **Dashboard**: live stock value, net profit after fees, QC first-pass rate, bottleneck stage, profit per marketplace | Leadership sees the business at a glance |

## Quick start

```bash
npm install
npm run dev          # http://localhost:3000 (demo data is generated on first run)
```

Optional: copy `.env.example` to `.env.local` and set `ANTHROPIC_API_KEY` to use real AI for listings.
Without a key, the app uses a deterministic template, so everything still works.

```bash
npm test             # 32 unit tests for the business rules
npm run typecheck
npm run build
npm run build:demo   # single-file offline demo → demo-dist/index.html
```

## 3-minute demo script

1. **Dashboard**: KPIs, the "Average days per stage" chart shows the bottleneck (Repair).
2. **Device intake** → *Fill example* → *Receive device*. It opens in the pipeline.
3. **Start grading** → set cosmetic 5, battery 91 → grade **A** is computed → skip repair → QC.
4. **QC**: mark one check *Fail* → listing is blocked → *Send back to repair*. Complete the repair → QC again.
5. Pass all checks → **✨ Generate listing with AI** → **Approve & list** on 3 marketplaces.
6. **Marketplace sync** → **⚡ Two orders at the same time**: one sells, the other is **rejected** (oversell blocked).
   Then **🔁 Resend last webhook**: ignored as a duplicate. Check the sync log.
7. Open the sold device: the profit breakdown shows sale price, marketplace fee, cost and repairs.

## Project structure

```
src/domain/       pure business logic (state machine, QC, pricing, marketplace sync, AI guardrails)
src/server/       persistence, Claude API client, HTTP error mapping
src/app/api/      thin REST routes
src/client/       Api interface: HTTP implementation + in-browser demo implementation
src/components/   React UI
tests/            Vitest unit tests
db/schema.sql     PostgreSQL schema for production (with DB-level oversell protection)
docs/             ARCHITECTURE.md (design decisions) · AI_WORKFLOW.md (how AI was used + reviewed)
CLAUDE.md         context + rules for AI coding agents working on this repo
```

## API

| Method | Path | Body |
|---|---|---|
| GET | `/api/state` | – |
| POST | `/api/devices` | intake fields |
| POST | `/api/devices/:id/move` | `{ to, note? }` |
| POST | `/api/devices/:id/grade` | `{ cosmeticScore, batteryHealth, needsRepair }` |
| POST | `/api/devices/:id/repair` | `{ cost, note }` |
| POST | `/api/devices/:id/qc` | `{ checkId, passed }` |
| POST | `/api/devices/:id/listing` | – (AI-generate listing text) |
| POST | `/api/devices/:id/list` | `{ marketplaces[], price? }` |
| POST | `/api/webhooks/orders` | `{ marketplace, orderId, deviceId, price }` → 200 / 409 |
| POST | `/api/reset` | – |

Business-rule violations return `400 { error }`, e.g. *"All QC checks must pass before a device can be listed"*.

## Design notes

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the layering, key decisions and trade-offs, and the path
to production (Postgres, real marketplace adapters, auth, outbox/job queue).
