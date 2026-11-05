"use client";
import { useMemo, useState } from "react";
import { STAGES, type AppState, type Device } from "@/domain/types";
import { qcProgress } from "@/domain/qc";
import { SLA_DAYS } from "@/domain/pipeline";
import { DEVICE_COLUMNS, devicesToRows, filterDevices, toCsv } from "@/domain/export";
import { downloadCsv, exportFileName } from "@/client/download";
import { STAGE_LABEL, daysSince, eur, formatStorage } from "./format";
import { EmptyState, IconInbox } from "./icons";


function DeviceCard({ d, onOpen }: { d: Device; onOpen: (id: string) => void }) {
  const since = daysSince(d.history[d.history.length - 1].at);
  const late = SLA_DAYS[d.stage] !== undefined && since > SLA_DAYS[d.stage]!;
  const qc = d.stage === "QC" ? qcProgress(d) : null;
  return (
    <button className={`dcard ${d.grade ? `grade-${d.grade}` : ""} ${late ? "late" : ""}`} onClick={() => onOpen(d.id)}>
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
  // Same filter for the board and the CSV export, so the file always matches what is on screen.
  const filtered = useMemo(() => filterDevices(state.devices, q, showSold), [q, showSold, state.devices]);
  const stages = showSold ? STAGES : STAGES.filter((s) => s !== "SOLD");

  const exportCsv = () => {
    const now = new Date();
    downloadCsv(exportFileName("devices", now), toCsv(DEVICE_COLUMNS, devicesToRows(filtered, now.toISOString())));
  };

  return (
    <div className="stack">
      <div className="toolbar">
        <input className="search" placeholder="Search SKU, IMEI/serial, model, supplier…" value={q} onChange={(e) => setQ(e.target.value)} />
        <label className="check">
          <input type="checkbox" checked={showSold} onChange={(e) => setShowSold(e.target.checked)} /> Show sold
        </label>
        <span className="muted small">⚠ = over target time for the stage</span>
        <button
          type="button"
          className="btn small-btn toolbar-end"
          onClick={exportCsv}
          disabled={filtered.length === 0}
          title="Download the devices shown on the board as CSV (opens in Excel)"
        >
          ⤓ Export CSV ({filtered.length})
        </button>
      </div>
      <div className="board" style={{ gridTemplateColumns: `repeat(${stages.length}, minmax(190px, 1fr))` }}>
        {stages.map((stage) => {
          const items = filtered.filter((d) => d.stage === stage);
          return (
            <section key={stage} className="column">
              <header>
                <span className={`stage-pill s-${stage}`}>{STAGE_LABEL[stage]}</span>
                <span className="count-pill" aria-label={`${items.length} devices`}>
                  {items.length}
                </span>
              </header>
              <div className="column-body">
                {items.length === 0 && <EmptyState icon={<IconInbox />} title="Nothing here" hint={`No devices in ${STAGE_LABEL[stage]}`} />}
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
