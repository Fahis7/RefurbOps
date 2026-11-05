"use client";
import { useMemo, useState } from "react";
import { STAGES, type AppState, type Device } from "@/domain/types";
import { qcProgress } from "@/domain/qc";
import { STAGE_LABEL, daysSince, eur, formatStorage } from "./format";

const SLA_DAYS: Partial<Record<Device["stage"], number>> = { RECEIVED: 1, GRADING: 1, REPAIR: 3, QC: 1.5, LISTED: 10 };

function DeviceCard({ d, onOpen }: { d: Device; onOpen: (id: string) => void }) {
  const since = daysSince(d.history[d.history.length - 1].at);
  const late = SLA_DAYS[d.stage] !== undefined && since > SLA_DAYS[d.stage]!;
  const qc = d.stage === "QC" ? qcProgress(d) : null;
  return (
    <button className={`dcard ${late ? "late" : ""}`} onClick={() => onOpen(d.id)}>
      <span className="dcard-top">
        <span className="mono small">{d.id}</span>
        {d.grade && <span className={`grade g${d.grade}`}>Grade {d.grade}</span>}
      </span>
      <span className="dcard-title">{d.model}</span>
      <span className="muted small">
        {formatStorage(d.storageGb)} · {d.color}
      </span>
      {qc && (
        <span className="progress" aria-label={`QC ${qc.done} of ${qc.total}`}>
          <span style={{ width: `${(qc.done / qc.total) * 100}%` }} className={qc.failed ? "bad" : ""} />
        </span>
      )}
      <span className="dcard-foot small">
        <span className={late ? "late-text" : "muted"}>
          {late ? "⚠ " : ""}
          {since < 1 ? `${Math.round(since * 24)}h` : `${since.toFixed(1)}d`} in stage
        </span>
        {d.listPrice && d.stage !== "SOLD" && <span>{eur(d.listPrice)}</span>}
        {d.sale && <span>{eur(d.sale.price)}</span>}
      </span>
    </button>
  );
}

export function Pipeline({ state, onOpen }: { state: AppState; onOpen: (id: string) => void }) {
  const [q, setQ] = useState("");
  const [showSold, setShowSold] = useState(false);
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return state.devices;
    return state.devices.filter((d) => [d.id, d.serial, d.brand, d.model, d.color, d.supplier].join(" ").toLowerCase().includes(s));
  }, [q, state.devices]);
  const stages = showSold ? STAGES : STAGES.filter((s) => s !== "SOLD");

  return (
    <div className="stack">
      <div className="toolbar">
        <input className="search" placeholder="Search SKU, IMEI/serial, model, supplier…" value={q} onChange={(e) => setQ(e.target.value)} />
        <label className="check">
          <input type="checkbox" checked={showSold} onChange={(e) => setShowSold(e.target.checked)} /> Show sold
        </label>
        <span className="muted small">⚠ = over target time for the stage</span>
      </div>
      <div className="board" style={{ gridTemplateColumns: `repeat(${stages.length}, minmax(190px, 1fr))` }}>
        {stages.map((stage) => {
          const items = filtered.filter((d) => d.stage === stage);
          return (
            <section key={stage} className="column">
              <header>
                <span className={`stage-pill s-${stage}`}>{STAGE_LABEL[stage]}</span>
                <span className="muted small">{items.length}</span>
              </header>
              <div className="column-body">
                {items.length === 0 && <p className="muted small empty">Nothing here</p>}
                {items.map((d) => (
                  <DeviceCard key={d.id} d={d} onOpen={onOpen} />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
