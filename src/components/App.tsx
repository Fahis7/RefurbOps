"use client";
import { useCallback, useEffect, useRef, useState } from "react";
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

type Tab = "dashboard" | "pipeline" | "marketplaces" | "intake";
type Toast = { id: number; kind: "ok" | "err" | "warn"; text: string };

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "dashboard", label: "Dashboard", icon: "▦" },
  { id: "pipeline", label: "Repair pipeline", icon: "⇉" },
  { id: "marketplaces", label: "Marketplace sync", icon: "⇄" },
  { id: "intake", label: "Device intake", icon: "＋" },
];

let orderSeq = Math.floor(Date.now() / 1000) % 100000;
const newOrderId = (mp: MarketplaceId) => `${MARKETPLACES[mp].code}-${++orderSeq}`;

export function App({ api = defaultApi }: { api?: Api }) {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [tab, setTab] = useState<Tab>("dashboard");
  const [open, setOpen] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const lastOrder = useRef<OrderEvent | null>(null);

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

  return (
    <div className="shell">
      <nav className="sidebar">
        <div className="brand">
          <span className="logo" aria-hidden>
            ♻
          </span>
          <div>
            <strong>RefurbOps</strong>
            <span className="muted small">Refurb operations</span>
          </div>
        </div>
        {TABS.map((t) => (
          <button key={t.id} className={`nav ${tab === t.id ? "active" : ""}`} onClick={() => setTab(t.id)}>
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
          <h1>{TABS.find((t) => t.id === tab)!.label}</h1>
          <span className="muted small">
            {state.devices.length} devices tracked · {stats.listedCount} live on marketplaces
          </span>
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
            {t.text}
          </div>
        ))}
      </div>
    </div>
  );
}
