"use client";

import { useMemo, useState, type ReactNode } from "react";
import type { AppState, SyncLevel } from "@/domain/types";
import { dailySeries, type DashboardStats } from "@/domain/stats";
import { MARKETPLACES } from "@/domain/pricing";
import { BarChart } from "./BarChart";
import { Sparkline } from "./charts";
import { InOutCard, RevenueProfitCard, type Range } from "./Trends";
import { EmptyState, IconActivity } from "./icons";
import { STAGE_LABEL, ago, eur, pct } from "./format";

/* ---------------------------------- icons --------------------------------- */

function Icon({ children, size = 18, strokeWidth = 1.8 }: { children: ReactNode; size?: number; strokeWidth?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {children}
    </svg>
  );
}

const WrenchIcon = () => (
  <Icon>
    <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76Z" />
  </Icon>
);

const TagIcon = () => (
  <Icon>
    <path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z" />
    <circle cx="7.5" cy="7.5" r="1.2" fill="currentColor" stroke="none" />
  </Icon>
);

const CheckCircleIcon = () => (
  <Icon>
    <circle cx="12" cy="12" r="9" />
    <path d="m8.5 12 2.5 2.5 4.5-5" />
  </Icon>
);

const TrendingUpIcon = () => (
  <Icon>
    <path d="M16 7h6v6" />
    <path d="m22 7-8.5 8.5-5-5L2 17" />
  </Icon>
);

const ShieldCheckIcon = () => (
  <Icon>
    <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
    <path d="m9 12 2 2 4-4" />
  </Icon>
);

const ChevronRightIcon = () => (
  <Icon size={13} strokeWidth={2.2}>
    <path d="m9 18 6-6-6-6" />
  </Icon>
);

/* -------------------------------- primitives ------------------------------- */

type Tone = "accent" | "good" | "warn" | "neutral";

function Kpi({
  label,
  value,
  sub,
  icon,
  tone,
  spark,
  sparkLabel,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: ReactNode;
  tone: Tone;
  spark?: number[];
  sparkLabel?: string;
}) {
  return (
    <div className={`kpi kpi-${tone}`}>
      <div className="kpi-head">
        <span className="kpi-label">{label}</span>
        <span className="kpi-icon">{icon}</span>
      </div>
      <span className="kpi-value">{value}</span>
      {spark && (
        <span className="kpi-spark" title={sparkLabel}>
          <Sparkline values={spark} />
        </span>
      )}
      {sub && <span className="kpi-sub">{sub}</span>}
    </div>
  );
}

const LEVEL_CLASS: Record<SyncLevel, string> = {
  info: "",
  success: "success",
  warning: "warning",
  error: "error",
};

/* ---------------------------------- page ---------------------------------- */

export function Dashboard({ state, stats, onOpen }: { state: AppState; stats: DashboardStats; onOpen: (id: string) => void }) {
  // Bottleneck = slowest workshop stage (time on sale is demand, not a process problem).
  const slowest = [...stats.avgDaysByStage].filter((s) => s.stage !== "LISTED").sort((a, b) => b.days - a.days)[0];
  const lastSync = state.syncLog[0];
  const [range, setRange] = useState<Range>(30);
  // Local calendar days in the viewer's time zone; recomputed whenever the data changes.
  const series = useMemo(
    () => dailySeries(state, new Date().toISOString(), 30, Intl.DateTimeFormat().resolvedOptions().timeZone),
    [state],
  );
  const shown = series.slice(-range);
  const last14 = series.slice(-14);

  return (
    <div className="stack">
      {(slowest?.days || lastSync) && (
        <div className="dash-badges">
          {slowest && slowest.days > 0 && (
            <span className="pill pill-warn">
              <span className="dot warning" aria-hidden />
              Bottleneck: {STAGE_LABEL[slowest.stage]} · {slowest.days} d avg
            </span>
          )}
          {lastSync && (
            <span className="pill">
              <span className="dot success" aria-hidden />
              Synced {ago(lastSync.at)}
            </span>
          )}
        </div>
      )}

      <RevenueProfitCard points={shown} range={range} onRange={setRange} />

      <div className="kpis">
        <Kpi label="In workshop" value={String(stats.inPipeline)} sub="received → QC" tone="accent" icon={<WrenchIcon />} spark={last14.map((p) => p.received)} sparkLabel="Devices received per day, last 14 days" />
        <Kpi label="Live stock" value={String(stats.listedCount)} sub={`${eur(stats.stockValue)} list value`} tone="accent" icon={<TagIcon />} />
        <Kpi label="Sold" value={String(stats.soldCount)} sub={`${eur(stats.revenue)} revenue`} tone="good" icon={<CheckCircleIcon />} spark={last14.map((p) => p.sold)} sparkLabel="Units sold per day, last 14 days" />
        <Kpi label="Net profit" value={eur(stats.totalProfit)} sub={`${pct(stats.avgMargin)} margin after fees`} tone="good" icon={<TrendingUpIcon />} spark={last14.map((p) => p.profit)} sparkLabel="Net profit per day, last 14 days" />
        <Kpi label="QC first-pass" value={pct(stats.qcFirstPassRate)} sub="listed without re-repair" tone="warn" icon={<ShieldCheckIcon />} />
      </div>

      <div className="grid-halves">
        <InOutCard points={shown} range={range} />
        <div className="card">
          <BarChart
            title="Net profit by marketplace"
            caption="After marketplace fees, purchase and repair cost"
            bars={stats.byMarketplace.map((m) => ({
              label: MARKETPLACES[m.marketplace].name,
              value: m.profit,
              display: eur(m.profit),
              detail: `${m.sold} sold · ${eur(m.revenue)} revenue · fee ${pct(MARKETPLACES[m.marketplace].feeRate)}`,
            }))}
          />
        </div>
      </div>

      <div className="grid-halves">
        <div className="card">
          <BarChart
            title="Devices by stage"
            caption="Where stock is sitting right now"
            bars={stats.byStage.map((s) => ({ label: STAGE_LABEL[s.stage], value: s.count, display: String(s.count) }))}
          />
        </div>
        <div className="card">
          <BarChart
            title="Average days per stage"
            caption={slowest?.days ? `Workshop bottleneck: ${STAGE_LABEL[slowest.stage]} (${slowest.days} d avg)` : undefined}
            bars={stats.avgDaysByStage.map((s) => ({ label: STAGE_LABEL[s.stage], value: s.days, display: `${s.days} d` }))}
          />
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <div>
            <h3>Recent activity</h3>
            <span className="muted small">Latest sync events across marketplaces</span>
          </div>
          <span className="pill">{state.syncLog.length} events</span>
        </div>
        {state.syncLog.length === 0 ? (
          <EmptyState icon={<IconActivity />} title="No activity yet" hint="Marketplace sync events will appear here." />
        ) : (
          <ul className="activity">
            {state.syncLog.slice(0, 8).map((e) => (
              <li key={e.id}>
                <span className={`dot ${LEVEL_CLASS[e.level]}`} aria-hidden />
                <span className="grow">
                  {e.marketplace && <span className="tag">{MARKETPLACES[e.marketplace].name}</span>} {e.message}
                </span>
                {e.deviceId && (
                  <button type="button" className="link device-link" onClick={() => onOpen(e.deviceId!)}>
                    {e.deviceId}
                    <ChevronRightIcon />
                  </button>
                )}
                <span className="muted small nowrap">{ago(e.at)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
