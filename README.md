# ♻ RefurbOps

**Live demo:** https://refurbops.vercel.app/

**Operations software for a refurbished-electronics business:** track every device from supplier
intake through grading, repair and QC to a sale on multiple marketplaces, without overselling.

Built with Next.js 16, React 19, TypeScript (strict) and Vitest, plus the Claude API for listing generation.

---

## What it does

| Feature | Business problem it solves |
|---|---|
| **Repair pipeline board**: Received → Grading → Repair → QC → Listed → Sold, with time-in-stage and SLA warnings | "Where is every device, and where is stock stuck?" |
| **QC checklist per device type** (phones get camera/SIM checks, laptops get keyboard checks); listing is **blocked** until every check passes | Nothing reaches a customer without passing QC |
| **Smart intake**: scan an IMEI → Luhn check + model autofill from the TAC; model autocomplete fills brand, category, storage sizes and colours; live duplicate-serial warning | Fast, consistent intake without typos or double entries |
| **Multi-currency purchase cost** (EUR, AED, INR, USD, GBP): converted to EUR at intake, with the rate snapshot stored on the device | Buy from Dubai or India suppliers in their currency, while margins stay comparable in EUR |
| **Grading + pricing**: grade A/B/C from cosmetic score and battery health; suggested price from cost, repairs and grade | Consistent grading and margins, without a spreadsheet |
| **Multi-marketplace sync** (Back Market, refurbed, Amazon Renewed, simulated): idempotent order webhooks, first order wins, auto-delist elsewhere, late orders rejected with 409 | **Overselling** a single physical unit |
| **AI listing generator**: Claude writes the marketplace copy from verified facts only; output validated; template fallback | Hours of copywriting, without the AI inventing specs |
| **Dashboard**: live stock value, net profit after fees, QC first-pass rate, bottleneck stage, profit per marketplace | Leadership sees the business at a glance |
| **AI photo grading**: at GRADING, 1–3 photos → suggested cosmetic score, damage list and confidence; "Apply" only moves the slider, the technician saves; the history records "AI suggested 4/5 (confidence 0.82)"; photos are never stored | Faster, more consistent grading – with a human always deciding |
| **Ask AI (Ops Assistant)**: plain-English questions ("Which devices are stuck?", "What sold best this week?"); answers only from pre-computed app data, device IDs link to the device | Managers get answers without building a report |

> **Demo TACs.** IMEI autofill matches the first 8 digits (the TAC) against `src/domain/catalog.ts`.
> Those TACs are **made-up demo values** (`35000101`, `35000401`, …). Real TACs come from the
> licensed GSMA database, so a real phone's IMEI won't be recognised until the catalog uses that data.

> **Demo FX rates.** Purchase costs in AED/INR/USD/GBP are converted with fixed, approximate rates in
> `src/domain/currency.ts` – not live. Production would load daily reference rates (e.g. ECB) instead.

> **Theme.** The sidebar button cycles System → Light → Dark; the choice is saved in `localStorage`
> (`refurbops-theme`). A tiny inline script (`src/client/theme.ts`, used by `layout.tsx` and the demo
> build) sets `data-theme` before first paint, so there is no flash of the wrong theme. Dark colour
> tokens live in one place: `:root[data-theme="dark"]` in `globals.css`.

> **CSV export.** *Repair pipeline → Export CSV* downloads the devices currently on the board
> (respects the search box and "Show sold"); *Marketplace sync → Export sales CSV* downloads every
> sale with fees and profit. Files are UTF-8 with a BOM so Excel shows € and ₹, and text cells
> starting with `= + - @` are prefixed with `'` (formula-injection guard). The separator is a comma:
> Excel set to a `;` locale (e.g. German) may show everything in one column – use
> *Data → From Text/CSV* there.
> Known limitation: Excel shows 15-digit IMEIs in scientific notation (e.g. `3.50002E+14`); the digits are intact – format the column as Number with 0 decimals.
> Known limitation: "Sold date" is the UTC calendar date, so a sale just after midnight local time (e.g. UAE) shows the previous day.

## Quick start

```bash
npm install
npm run dev          # http://localhost:3000 (demo data is generated on first run)
```

Optional: copy `.env.example` to `.env.local` and set `ANTHROPIC_API_KEY` to use real AI for listings.
Without a key, the app uses a deterministic template, so everything still works.

```bash
npm test             # unit tests for the business rules
npm run typecheck
npm run build
npm run build:demo   # single-file offline demo → demo-dist/index.html
```

## Deploy (Vercel)

Vercel's filesystem is read-only, so the JSON file store (`data/db.json`) cannot be written there.
To deploy the demo:

1. In Vercel → *Project → Settings → Environment Variables*, set `NEXT_PUBLIC_DEMO_MODE=1`.
2. **Redeploy.** `NEXT_PUBLIC_*` values are baked in at build time, so a new variable only takes
   effect after a new build.

The UI then runs in demo mode: the same business rules execute in the browser, with data kept in
browser storage. `NEXT_PUBLIC_VERCEL_ENV` also turns on demo mode, but Vercel only sets it when
*Automatically expose System Environment Variables* is enabled, so don't rely on it.

Without demo mode, the API routes fall back to an **in-memory** store on Vercel (a warning is
logged). That data resets on every cold start and isn't shared between server instances, so the
oversell protection isn't guaranteed. Use a real database (`db/schema.sql`) for production.

### AI Ops Assistant on Vercel

The *Ask AI* tab calls the stateless route `POST /api/ai/ask`, so it also works in demo mode once
`ANTHROPIC_API_KEY` is set on Vercel (server-side only, never sent to the browser). Without a key the
tab shows "AI not configured". The offline single-file demo (`demo-dist/`) has no server, so the tab
explains that instead.

**Privacy.** When you ask a question, model names, suppliers and prices from the app are sent to Anthropic.
With AI photo grading, the photos (resized to ≤1024 px) and the device model are sent to Anthropic for that
request only; the app never stores them.

**Cost control.** The route is public. It has a best-effort rate limit of 10 questions per minute per
IP, but it is in memory and every serverless instance counts separately, so it only slows down casual
abuse. **The real cost cap is the monthly spend limit set in the Anthropic Console** – keep one set
for the key you put on Vercel. Each request is also bounded (question ≤ 500 chars, context ≤ 100 KB,
answer ≤ 400 tokens).

## 3-minute demo script

1. **Dashboard**: KPIs, the "Average days per stage" chart shows the bottleneck (Repair).
2. **Device intake** → *Fill example*: a valid demo IMEI autofills an iPhone 15 ("Detected: Apple iPhone 15") → *Receive device*. It opens in the pipeline.
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
| POST | `/api/ai/grade-photo` | `{ images: base64 JPEG[1–3], category, model }` → `200 { suggestion }` · `400` · `413` too large · `429` · `502` · `503` |
| POST | `/api/ai/ask` | `{ question, context }` → `200 { answer }` · `400` invalid · `429` rate limited · `502` AI failed · `503 { error: "AI not configured" }` |

Business-rule violations return `400 { error }`, e.g. *"All QC checks must pass before a device can be listed"*.

## Design notes

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the layering, key decisions and trade-offs, and the path
to production (Postgres, real marketplace adapters, auth, outbox/job queue).
