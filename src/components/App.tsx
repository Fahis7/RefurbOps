"use client";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { MarketplaceId, OrderEvent } from "@/domain/types";
import { MARKETPLACES } from "@/domain/pricing";
import type { Api, Snapshot } from "@/client/api";
import { defaultApi } from "@/client";
import { Dashboard } from "./Dashboard";
import { Pipeline } from "./Pipeline";
import { Marketplaces } from "./Marketplaces";
import { AddDevice } from "./AddDevice";
import { DeviceDrawer, type Run } from "./DeviceDrawer";
import { ThemeToggle } from "./ThemeToggle";
import { Assistant } from "./Assistant";
import { IconDashboard, IconIntake, IconPipeline, IconSparkle, IconSync, LogoMark } from "./icons";
import { ago } from "./format";

type Tab = "dashboard" | "pipeline" | "marketplaces" | "intake" | "assistant";
type Toast = { id: number; kind: "ok" | "err" | "warn"; text: string };

const TABS: { id: Tab; label: string; icon: ReactNode; subtitle: string }[] = [
  { id: "dashboard", label: "Dashboard", icon: <IconDashboard />, subtitle: "Pipeline, sales and profit at a glance" },
  { id: "pipeline", label: "Repair pipeline", icon: <IconPipeline />, subtitle: "Every device from intake to sale, with time in stage" },
  { id: "marketplaces", label: "Marketplace sync", icon: <IconSync />, subtitle: "One unit, many marketplaces – listings, orders and sync" },
  { id: "intake", label: "Device intake", icon: <IconIntake />, subtitle: "Register a device: IMEI check, model autofill, purchase cost" },
  { id: "assistant", label: "Ask AI", icon: <IconSparkle />, subtitle: "Ask about stock, sales and suppliers in plain English" },
];

const TOAST_ICON: Record<Toast["kind"], string> = { ok: "✓", warn: "!", err: "✕" };

let orderSeq = Math.floor(Date.now() / 1000) % 100000;
const newOrderId = (mp: MarketplaceId) => `${MARKETPLACES[mp].code}-${++orderSeq}`;

export function App({ api = defaultApi }: { api?: Api }) {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [tab, setTab] = useState<Tab>("dashboard");
  const [open, setOpen] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const lastOrder = useRef<OrderEvent | null>(null);
  // When the data on screen was last loaded – shown in the page header ("updated just now").
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  useEffect(() => {
    if (snap) setUpdatedAt(new Date().toISOString());
  }, [snap]);

  const toast = useCallback((kind: Toast["kind"], text: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, kind, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4500);
  }, []);

  useEffect(() => {
    api.getState().then(setSnap, (e: Error) => setLoadError(e.message));
  }, [api]);

  /** Run an API call: update state on success, show the business-rule message on failure. */
  const run: Run = useCallback(
    async (fn, ok) => {
      try {
        const s = await fn();
        setSnap(s);
        const msg = typeof ok === "function" ? ok(s) : ok;
        if (msg) toast(s.warning ? "warn" : "ok", msg);
        return s;
      } catch (e) {
        toast("err", (e as Error).message);
        return undefined;
      }
    },
    [toast],
  );

  const orderToast = (s: Snapshot, o: OrderEvent) => {
    const mp = MARKETPLACES[o.marketplace].name;
    if (s.outcome === "PROCESSED") return `✓ ${mp} order ${o.orderId}: ${o.deviceId} sold, other listings removed`;
    if (s.outcome === "DUPLICATE") return `Duplicate webhook ${o.orderId} ignored (idempotent)`;
    return `✕ ${mp} order ${o.orderId} rejected – ${o.deviceId} already sold (oversell blocked)`;
  };

  const simulateOrder = (deviceId: string, marketplace: MarketplaceId) => {
    const d = snap?.state.devices.find((x) => x.id === deviceId);
    if (!d?.listPrice) return;
    const order = { marketplace, deviceId, orderId: newOrderId(marketplace), price: d.listPrice };
    lastOrder.current = order;
    run(() => api.sendOrder(order), (s) => orderToast(s, order));
  };

  /** Two marketplaces sell the same unit at the same moment – only one may win. */
  const race = async (deviceId: string) => {
    const s0 = snap?.state;
    const d = s0?.devices.find((x) => x.id === deviceId);
    if (!d?.listPrice || !s0) return;
    const active = s0.listings.filter((l) => l.deviceId === deviceId && l.status === "ACTIVE").map((l) => l.marketplace);
    if (active.length < 2) return toast("warn", "Device must be live on at least 2 marketplaces");
    const orders = active.slice(0, 2).map((mp) => ({ marketplace: mp, deviceId, orderId: newOrderId(mp), price: d.listPrice! }));
    const results = await Promise.all(orders.map((o) => api.sendOrder(o).catch((e: Error) => e)));
    const last = results.filter((r): r is Snapshot => !(r instanceof Error)).pop();
    if (last) setSnap(await api.getState());
    results.forEach((r, i) => (r instanceof Error ? toast("err", r.message) : toast(r.outcome === "PROCESSED" ? "ok" : "err", orderToast(r, orders[i]))));
    lastOrder.current = orders[0];
  };

  const resend = () => {
    const o = lastOrder.current;
    if (o) run(() => api.sendOrder(o), (s) => orderToast(s, o));
  };

  if (loadError) return <div className="center">Could not load data: {loadError}</div>;
  if (!snap) return <div className="center muted">Loading RefurbOps…</div>;
  const { state, stats } = snap;
  const current = TABS.find((t) => t.id === tab)!;

  return (
    <div className="shell">
      <nav className="sidebar">
        <div className="brand">
          <span className="logo" aria-hidden>
            <LogoMark />
          </span>
          <div>
            <strong>RefurbOps</strong>
            <span className="muted small">Refurb operations</span>
          </div>
        </div>
        {TABS.map((t) => (
          <button key={t.id} className={`nav ${tab === t.id ? "active" : ""}`} aria-current={tab === t.id ? "page" : undefined} onClick={() => setTab(t.id)}>
            <span aria-hidden className="nav-icon">
              {t.icon}
            </span>
            {t.label}
          </button>
        ))}
        <div className="sidebar-foot">
          <span className={`mode ${api.mode}`}>{api.mode === "demo" ? "Offline demo" : "Live API"}</span>
          <ThemeToggle />
          <button className="btn ghost small-btn" onClick={() => run(() => api.reset(), "Demo data reset")}>
            Reset demo data
          </button>
        </div>
      </nav>

      <main className="main">
        <header className="page-head">
          <div className="page-title">
            <h1>{current.label}</h1>
            <p className="page-sub">{current.subtitle}</p>
          </div>
          <p className="page-context">
            <span className="num">{state.devices.length}</span> devices · <span className="num">{stats.listedCount}</span> live
            {updatedAt && <> · updated {ago(updatedAt)}</>}
          </p>
        </header>
        {tab === "dashboard" && <Dashboard state={state} stats={stats} onOpen={setOpen} />}
        {tab === "pipeline" && <Pipeline state={state} onOpen={setOpen} />}
        {tab === "marketplaces" && (
          <Marketplaces
            state={state}
            onOpen={setOpen}
            onSimulateOrder={simulateOrder}
            onRace={race}
            onResend={resend}
            canResend={!!lastOrder.current}
          />
        )}
        {tab === "assistant" && <Assistant api={api} state={state} onOpen={setOpen} />}
        {tab === "intake" && (
          <AddDevice
            api={api}
            run={run}
            devices={state.devices}
            onOpen={setOpen}
            onCreated={(id) => {
              setTab("pipeline");
              setOpen(id);
            }}
          />
        )}
      </main>

      {open && <DeviceDrawer state={state} id={open} api={api} run={run} onClose={() => setOpen(null)} onSimulateOrder={simulateOrder} />}

      <div className="toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`}>
            <span className="toast-icon" aria-hidden>
              {TOAST_ICON[t.kind]}
            </span>
            <span>{t.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
