"use client";
import { useState } from "react";
import type { AppState, MarketplaceId } from "@/domain/types";
import { MARKETPLACES, MARKETPLACE_IDS } from "@/domain/pricing";
import { ago, eur } from "./format";

export function Marketplaces({
  state,
  onOpen,
  onSimulateOrder,
  onRace,
  onResend,
  canResend,
}: {
  state: AppState;
  onOpen: (id: string) => void;
  onSimulateOrder: (deviceId: string, mp: MarketplaceId) => void;
  onRace: (deviceId: string) => void;
  onResend: () => void;
  canResend: boolean;
}) {
  const [filter, setFilter] = useState<"all" | MarketplaceId>("all");
  const listed = state.devices.filter((d) => d.stage === "LISTED");
  const log = state.syncLog.filter((e) => filter === "all" || e.marketplace === filter).slice(0, 40);

  return (
    <div className="stack">
      <div className="card explainer">
        <h3>Why this matters: one device, many marketplaces</h3>
        <p className="small">
          Every refurbished unit is unique, but we list it on several marketplaces at once. When it sells on one, the others must be
          delisted immediately, or two customers buy the same phone. The sync engine (<code>src/domain/marketplace.ts</code>) handles
          duplicate webhooks (idempotency), first-order-wins, auto-delisting, and rejects late orders instead of overselling.
        </p>
        <div className="row gap">
          <button className="btn" disabled={!listed.length} onClick={() => listed[0] && onRace(listed[0].id)}>
            ⚡ Test: two orders for {listed[0]?.id ?? "…"} at the same time
          </button>
          <button className="btn" disabled={!canResend} onClick={onResend}>
            🔁 Test: resend last webhook (duplicate)
          </button>
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <h3>Live listings ({listed.length})</h3>
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>Device</th>
                  <th className="right">Price</th>
                  {MARKETPLACE_IDS.map((m) => (
                    <th key={m}>{MARKETPLACES[m].name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {listed.length === 0 && (
                  <tr>
                    <td colSpan={5} className="muted">No live listings. Finish QC on a device to list it.</td>
                  </tr>
                )}
                {listed.map((d) => (
                  <tr key={d.id}>
                    <td>
                      <button className="link" onClick={() => onOpen(d.id)}>{d.id}</button>
                      <div className="small muted">{d.model} · {d.grade}</div>
                    </td>
                    <td className="right">{eur(d.listPrice ?? 0)}</td>
                    {MARKETPLACE_IDS.map((m) => {
                      const l = state.listings.find((x) => x.deviceId === d.id && x.marketplace === m);
                      return (
                        <td key={m}>
                          {!l ? (
                            <span className="muted small">not listed</span>
                          ) : l.status === "ACTIVE" ? (
                            <button className="btn small-btn" onClick={() => onSimulateOrder(d.id, m)} title="Simulate a customer order from this marketplace">
                              Simulate order
                            </button>
                          ) : (
                            <span className={`status st-${l.status}`}>{l.status}</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card">
          <div className="row between">
            <h3>Sync log</h3>
            <select value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)} aria-label="Filter by marketplace">
              <option value="all">All marketplaces</option>
              {MARKETPLACE_IDS.map((m) => (
                <option key={m} value={m}>{MARKETPLACES[m].name}</option>
              ))}
            </select>
          </div>
          <ul className="activity">
            {log.map((e) => (
              <li key={e.id}>
                <span className={`dot ${e.level}`} aria-hidden />
                <span className="grow small">
                  {e.marketplace && <span className="tag">{MARKETPLACES[e.marketplace].name}</span>} {e.message}
                </span>
                <span className="muted small nowrap">{ago(e.at)}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
