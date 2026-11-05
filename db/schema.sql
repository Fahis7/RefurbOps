-- RefurbOps – PostgreSQL schema (production target).
-- The demo uses a JSON file behind src/server/store.ts; this is the schema that
-- store would map to. Business rules stay in src/domain; the database enforces
-- the invariants that must hold even if application code has a bug.

CREATE TYPE stage AS ENUM ('RECEIVED', 'GRADING', 'REPAIR', 'QC', 'LISTED', 'SOLD');
CREATE TYPE grade AS ENUM ('A', 'B', 'C');
CREATE TYPE listing_status AS ENUM ('ACTIVE', 'DELISTED', 'SOLD');

CREATE TABLE devices (
  id              TEXT PRIMARY KEY,                 -- SKU, e.g. RO-1024
  serial          TEXT NOT NULL UNIQUE,             -- IMEI / serial: one row per physical unit
  brand           TEXT NOT NULL,
  model           TEXT NOT NULL,
  category        TEXT NOT NULL CHECK (category IN ('Smartphone', 'Laptop', 'Tablet')),
  storage_gb      INTEGER NOT NULL CHECK (storage_gb > 0),
  color           TEXT NOT NULL,
  supplier        TEXT NOT NULL,
  cost_price      NUMERIC(10,2) NOT NULL CHECK (cost_price > 0),   -- EUR (base currency): all pricing/profit uses this
  -- What we actually paid the supplier + the FX rate frozen at intake (never recomputed).
  purchase_amount   NUMERIC(14,2) NOT NULL CHECK (purchase_amount > 0),
  purchase_currency CHAR(3) NOT NULL DEFAULT 'EUR' CHECK (purchase_currency IN ('EUR', 'AED', 'INR', 'USD', 'GBP')),
  fx_rate           NUMERIC(14,6) NOT NULL DEFAULT 1 CHECK (fx_rate > 0),   -- units of purchase_currency per 1 EUR
  fx_rate_as_of     DATE NOT NULL,
  repair_cost     NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (repair_cost >= 0),
  cosmetic_score  SMALLINT CHECK (cosmetic_score BETWEEN 1 AND 5),
  battery_health  SMALLINT NOT NULL CHECK (battery_health BETWEEN 0 AND 100),
  stage           stage NOT NULL DEFAULT 'RECEIVED',
  grade           grade,
  list_price      NUMERIC(10,2),
  listing_title   TEXT,
  listing_desc    TEXT,
  listing_source  TEXT CHECK (listing_source IN ('ai', 'template')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX devices_stage_idx ON devices (stage);

-- Append-only audit trail: every stage change, who/when/why.
CREATE TABLE stage_events (
  id          BIGSERIAL PRIMARY KEY,
  device_id   TEXT NOT NULL REFERENCES devices(id),
  stage       stage NOT NULL,
  note        TEXT,
  actor       TEXT,                                 -- technician / system
  at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX stage_events_device_idx ON stage_events (device_id, at);

CREATE TABLE qc_results (
  device_id   TEXT NOT NULL REFERENCES devices(id),
  check_id    TEXT NOT NULL,
  passed      BOOLEAN NOT NULL,
  checked_by  TEXT,
  at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (device_id, check_id)
);

CREATE TABLE marketplace_listings (
  device_id    TEXT NOT NULL REFERENCES devices(id),
  marketplace  TEXT NOT NULL,                        -- backmarket | refurbed | amazon
  external_id  TEXT,                                 -- the marketplace's own listing id
  status       listing_status NOT NULL,
  price        NUMERIC(10,2) NOT NULL,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (device_id, marketplace)
);
-- Oversell protection at the database level: at most ONE sold listing per device.
CREATE UNIQUE INDEX one_sale_per_device ON marketplace_listings (device_id) WHERE status = 'SOLD';

CREATE TABLE sales (
  device_id    TEXT PRIMARY KEY REFERENCES devices(id), -- PK = a device can only be sold once
  marketplace  TEXT NOT NULL,
  order_id     TEXT NOT NULL,
  price        NUMERIC(10,2) NOT NULL,
  fee          NUMERIC(10,2) NOT NULL,
  sold_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Webhook idempotency: insert first, process only if the insert succeeded.
--   INSERT INTO processed_webhooks (...) VALUES (...) ON CONFLICT DO NOTHING RETURNING 1;
CREATE TABLE processed_webhooks (
  marketplace  TEXT NOT NULL,
  order_id     TEXT NOT NULL,
  outcome      TEXT NOT NULL,
  received_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (marketplace, order_id)
);

CREATE TABLE sync_log (
  id           BIGSERIAL PRIMARY KEY,
  at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  level        TEXT NOT NULL CHECK (level IN ('info', 'success', 'warning', 'error')),
  marketplace  TEXT,
  device_id    TEXT REFERENCES devices(id),
  message      TEXT NOT NULL
);

-- Order handling in one transaction (what handleOrder() does in memory):
--   BEGIN;
--   INSERT INTO processed_webhooks ... ON CONFLICT DO NOTHING;   -- 0 rows → DUPLICATE
--   SELECT stage FROM devices WHERE id = $1 FOR UPDATE;           -- row lock serialises racing orders
--   -- if stage = 'SOLD' → log error, COMMIT, return 409 (REJECTED_OVERSELL)
--   UPDATE devices SET stage = 'SOLD' ...; INSERT INTO sales ...;
--   UPDATE marketplace_listings SET status = 'DELISTED' WHERE device_id = $1 AND marketplace <> $2;
--   COMMIT;   -- then push delist calls to marketplace APIs via an outbox / job queue
