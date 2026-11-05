"use client";
import { useEffect, useState } from "react";
import type { AppState, Device, MarketplaceId } from "@/domain/types";
import { checksFor, computeGrade, qcPassed } from "@/domain/qc";
import { MARKETPLACES, MARKETPLACE_IDS, profit, suggestPrice } from "@/domain/pricing";
import type { Api, Snapshot } from "@/client/api";
import { STAGE_LABEL, ago, eur, formatStorage } from "./format";
import { formatMoney } from "@/domain/currency";
import { PhotoGradeSuggest } from "./PhotoGradeSuggest";

export type Run = (fn: () => Promise<Snapshot>, okMessage?: string | ((s: Snapshot) => string)) => Promise<Snapshot | undefined>;

const REPAIR_PRESETS = [
  { note: "Battery replacement", cost: 35 },
  { note: "Screen replacement", cost: 85 },
  { note: "Charging port replaced", cost: 25 },
  { note: "Rear glass replaced", cost: 45 },
  { note: "Keyboard replaced", cost: 60 },
  { note: "Deep clean + reseal", cost: 10 },
];

function GradingPanel({ d, api, run }: { d: Device; api: Api; run: Run }) {
  const [cosmetic, setCosmetic] = useState(4);
  const [battery, setBattery] = useState(d.batteryHealth);
  const [needsRepair, setNeedsRepair] = useState(d.batteryHealth < 80);
  // Set only when the technician clicks Apply; recorded in the history note on Save (even if they then change the slider).
  const [aiSuggestion, setAiSuggestion] = useState<{ cosmeticScore: number; confidence: number } | undefined>();
  const preview = computeGrade(cosmetic, battery);
  return (
    <div className="panel">
      <h4>Grade this device</h4>
      <PhotoGradeSuggest
        d={d}
        api={api}
        onApply={(s) => {
          setCosmetic(s.cosmeticScore);
          setAiSuggestion({ cosmeticScore: s.cosmeticScore, confidence: s.confidence });
        }}
        onIgnore={() => setAiSuggestion(undefined)}
      />
      <label className="field">
        Cosmetic condition: <strong>{cosmetic}/5</strong>
        {aiSuggestion && <span className="muted small"> · AI suggested {aiSuggestion.cosmeticScore}/5</span>}
        <input type="range" min={1} max={5} value={cosmetic} onChange={(e) => setCosmetic(Number(e.target.value))} />
        <span className="muted small">1 = heavy damage · 5 = like new</span>
      </label>
      <label className="field">
        Battery health (%)
        <input type="number" min={0} max={100} value={battery} onChange={(e) => setBattery(Number(e.target.value))} />
      </label>
      <label className="check">
        <input type="checkbox" checked={needsRepair} onChange={(e) => setNeedsRepair(e.target.checked)} /> Needs repair before QC
      </label>
      <p>
        Computed grade: <span className={`grade g${preview}`}>Grade {preview}</span>
      </p>
      <button
        className="btn primary"
        onClick={() =>
          run(() => api.grade(d.id, { cosmeticScore: cosmetic, batteryHealth: battery, needsRepair, aiSuggestion }), `${d.id} graded ${preview}`)
        }
      >
        Save grade → {needsRepair ? "Repair" : "QC"}
      </button>
    </div>
  );
}

function RepairPanel({ d, api, run }: { d: Device; api: Api; run: Run }) {
  const [preset, setPreset] = useState(d.batteryHealth < 80 ? 0 : 1);
  const [cost, setCost] = useState(REPAIR_PRESETS[preset].cost);
  const lastNote = d.history[d.history.length - 1].note;
  return (
    <div className="panel">
      <h4>Repair</h4>
      {lastNote?.startsWith("QC failed") && <p className="alert warn">{lastNote}</p>}
      <label className="field">
        Work done
        <select
          value={preset}
          onChange={(e) => {
            const i = Number(e.target.value);
            setPreset(i);
            setCost(REPAIR_PRESETS[i].cost);
          }}
        >
          {REPAIR_PRESETS.map((p, i) => (
            <option key={p.note} value={i}>
              {p.note}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        Parts + labour (€)
        <input type="number" min={0} value={cost} onChange={(e) => setCost(Number(e.target.value))} />
      </label>
      <button className="btn primary" onClick={() => run(() => api.repair(d.id, { cost, note: REPAIR_PRESETS[preset].note }), `${d.id} repaired → QC`)}>
        Complete repair → QC
      </button>
    </div>
  );
}

function QCPanel({ d, api, run }: { d: Device; api: Api; run: Run }) {
  const checks = checksFor(d.category);
  const results = new Map(d.qc.map((r) => [r.checkId, r.passed]));
  const failed = checks.filter((c) => results.get(c.id) === false);
  const allPassed = qcPassed(d);
  const suggested = suggestPrice(d, d.grade ?? "B");
  const [price, setPrice] = useState(suggested);
  const [mps, setMps] = useState<MarketplaceId[]>([...MARKETPLACE_IDS]);
  const [busy, setBusy] = useState(false);
  useEffect(() => setPrice(suggested), [suggested]);

  const passAll = async () => {
    setBusy(true);
    for (const c of checks) if (results.get(c.id) !== true) await run(() => api.qc(d.id, c.id, true));
    setBusy(false);
  };

  return (
    <div className="panel">
      <h4>
        QC checklist <span className="muted small">({checks.filter((c) => results.has(c.id)).length}/{checks.length} done)</span>
      </h4>
      <ul className="qc-list">
        {checks.map((c) => {
          const r = results.get(c.id);
          return (
            <li key={c.id} className={r === true ? "pass" : r === false ? "fail" : ""}>
              <span className="grow">{c.label}</span>
              <button className={`chip ${r === true ? "on-pass" : ""}`} onClick={() => run(() => api.qc(d.id, c.id, true))} aria-pressed={r === true}>
                ✓ Pass
              </button>
              <button className={`chip ${r === false ? "on-fail" : ""}`} onClick={() => run(() => api.qc(d.id, c.id, false))} aria-pressed={r === false}>
                ✕ Fail
              </button>
            </li>
          );
        })}
      </ul>
      {!allPassed && failed.length === 0 && (
        <button className="btn" disabled={busy} onClick={passAll}>
          Mark remaining as passed
        </button>
      )}
      {failed.length > 0 && (
        <div className="alert bad">
          {failed.length} check(s) failed – device cannot be listed.
          <button
            className="btn small-btn"
            onClick={() => run(() => api.move(d.id, "REPAIR", `QC failed: ${failed.map((f) => f.label).join(", ")}`), `${d.id} sent back to repair`)}
          >
            Send back to repair
          </button>
        </div>
      )}
      {allPassed && (
        <div className="list-box">
          <h4>Approve &amp; list</h4>
          <ListingText d={d} api={api} run={run} />
          <label className="field">
            List price (€) <span className="muted small">suggested {eur(suggested)} from cost + grade</span>
            <input type="number" min={1} value={price} onChange={(e) => setPrice(Number(e.target.value))} />
          </label>
          <div className="mp-picks">
            {MARKETPLACE_IDS.map((m) => (
              <label key={m} className="check">
                <input
                  type="checkbox"
                  checked={mps.includes(m)}
                  onChange={(e) => setMps(e.target.checked ? [...mps, m] : mps.filter((x) => x !== m))}
                />
                {MARKETPLACES[m].name}
              </label>
            ))}
          </div>
          <button
            className="btn primary"
            disabled={mps.length === 0}
            onClick={() => run(() => api.list(d.id, mps, price), `${d.id} listed on ${mps.length} marketplace(s)`)}
          >
            Approve &amp; list on {mps.length} marketplace{mps.length === 1 ? "" : "s"}
          </button>
        </div>
      )}
    </div>
  );
}

function ListingText({ d, api, run }: { d: Device; api: Api; run: Run }) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="listing">
      {d.listing ? (
        <>
          <div className="listing-title">{d.listing.title}</div>
          <p className="listing-desc">{d.listing.description}</p>
          <span className="muted small">Source: {d.listing.source === "ai" ? "Claude AI (validated)" : "template"}</span>
        </>
      ) : (
        <p className="muted small">No listing text yet.</p>
      )}
      <button
        className="btn"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          await run(() => api.generateListing(d.id), (s) => s.warning ?? "Listing generated");
          setBusy(false);
        }}
      >
        {busy ? "Generating…" : d.listing ? "✨ Regenerate with AI" : "✨ Generate listing with AI"}
      </button>
    </div>
  );
}

export function DeviceDrawer({
  state,
  id,
  api,
  run,
  onClose,
  onSimulateOrder,
}: {
  state: AppState;
  id: string;
  api: Api;
  run: Run;
  onClose: () => void;
  onSimulateOrder: (deviceId: string, mp: MarketplaceId) => void;
}) {
  const d = state.devices.find((x) => x.id === id);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  if (!d) return null;
  const listings = state.listings.filter((l) => l.deviceId === d.id);
  const p = profit(d);

  return (
    <div className="drawer-wrap" onClick={onClose}>
      <aside className="drawer" onClick={(e) => e.stopPropagation()} aria-label={`Device ${d.id}`}>
        <header className="drawer-head">
          <div>
            <span className="mono small muted">
              {d.id} · {d.serial}
            </span>
            <h2>
              {d.brand} {d.model}
            </h2>
            <span className="muted">
              {formatStorage(d.storageGb)} · {d.color} · {d.category}
            </span>
          </div>
          <button className="btn ghost" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>

        <div className="facts">
          <div>
            <span className="muted small">Stage</span>
            <span className={`stage-pill s-${d.stage}`}>{STAGE_LABEL[d.stage]}</span>
          </div>
          <div>
            <span className="muted small">Grade</span>
            {d.grade ? <span className={`grade g${d.grade}`}>Grade {d.grade}</span> : <span>–</span>}
          </div>
          <div>
            <span className="muted small">Battery</span>
            <span>{d.batteryHealth}%</span>
          </div>
          <div>
            <span className="muted small">Cost</span>
            {d.purchase && d.purchase.currency !== "EUR" ? (
              <span title={`Rate ${d.purchase.rate} ${d.purchase.currency}/EUR as of ${d.purchase.rateAsOf}`}>
                {eur(d.costPrice, 2)}{" "}
                <span className="muted small">
                  (paid {formatMoney(d.purchase.amount, d.purchase.currency)} @ {d.purchase.rate})
                </span>
              </span>
            ) : (
              <span>{eur(d.costPrice)}</span>
            )}
          </div>
          <div>
            <span className="muted small">Repairs</span>
            <span>{eur(d.repairCost)}</span>
          </div>
          <div>
            <span className="muted small">Supplier</span>
            <span className="small">{d.supplier}</span>
          </div>
        </div>

        {d.stage === "RECEIVED" && (
          <div className="panel">
            <h4>Received from {d.supplier}</h4>
            <button className="btn primary" onClick={() => run(() => api.move(d.id, "GRADING"), `${d.id} moved to grading`)}>
              Start grading
            </button>
          </div>
        )}
        {d.stage === "GRADING" && <GradingPanel d={d} api={api} run={run} />}
        {d.stage === "REPAIR" && <RepairPanel d={d} api={api} run={run} />}
        {d.stage === "QC" && <QCPanel d={d} api={api} run={run} />}
        {d.stage === "LISTED" && (
          <div className="panel">
            <h4>Live on marketplaces · {eur(d.listPrice ?? 0)}</h4>
            <ListingText d={d} api={api} run={run} />
            <table className="table">
              <tbody>
                {listings.map((l) => (
                  <tr key={l.marketplace}>
                    <td>{MARKETPLACES[l.marketplace].name}</td>
                    <td>
                      <span className={`status st-${l.status}`}>{l.status}</span>
                    </td>
                    <td className="right">
                      {l.status === "ACTIVE" && (
                        <button className="btn small-btn" onClick={() => onSimulateOrder(d.id, l.marketplace)}>
                          Simulate order
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button className="btn" onClick={() => run(() => api.move(d.id, "QC", "Customer-facing issue found – re-check"), `${d.id} pulled back to QC and delisted`)}>
              Pull back to QC (delists everywhere)
            </button>
          </div>
        )}
        {d.stage === "SOLD" && d.sale && (
          <div className="panel">
            <h4>Sold on {MARKETPLACES[d.sale.marketplace].name}</h4>
            <table className="table">
              <tbody>
                <tr><td>Sale price</td><td className="right">{eur(d.sale.price, 2)}</td></tr>
                <tr><td>Marketplace fee</td><td className="right">−{eur(d.sale.fee, 2)}</td></tr>
                <tr><td>Purchase cost</td><td className="right">−{eur(d.costPrice, 2)}</td></tr>
                <tr><td>Repair cost</td><td className="right">−{eur(d.repairCost, 2)}</td></tr>
                <tr className="total"><td>Net profit</td><td className="right">{eur(p ?? 0, 2)}</td></tr>
              </tbody>
            </table>
            <span className="muted small">Order {d.sale.orderId}</span>
          </div>
        )}

        <div className="panel">
          <h4>History</h4>
          <ol className="timeline">
            {[...d.history].reverse().map((h, i) => (
              <li key={i}>
                <span className={`stage-pill s-${h.stage}`}>{STAGE_LABEL[h.stage]}</span>
                <span className="grow small">{h.note}</span>
                <span className="muted small nowrap" title={new Date(h.at).toLocaleString()}>
                  {ago(h.at)}
                </span>
              </li>
            ))}
          </ol>
        </div>
      </aside>
    </div>
  );
}
