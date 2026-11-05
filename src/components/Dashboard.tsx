"use client";
import type { AppState } from "@/domain/types";
import type { DashboardStats } from "@/domain/stats";
import { MARKETPLACES } from "@/domain/pricing";
import { BarChart } from "./BarChart";
import { STAGE_LABEL, ago, eur, pct } from "./format";

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="kpi">
      <span className="kpi-label">{label}</span>
      <span className="kpi-value">{value}</span>
      {sub && <span className="kpi-sub">{sub}</span>}
    </div>
  );
}

export function Dashboard({ state, stats, onOpen }: { state: AppState; stats: DashboardStats; onOpen: (id: string) => void }) {
  // Bottleneck = slowest workshop stage (time on sale is demand, not a process problem).
  const slowest = [...stats.avgDaysByStage].filter((s) => s.stage !== "LISTED").sort((a, b) => b.days - a.days)[0];
  return (
    <div className="stack">
      <div className="kpis">
        <Kpi label="In workshop" value={String(stats.inPipeline)} sub="received → QC" />
        <Kpi label="Live stock" value={String(stats.listedCount)} sub={`${eur(stats.stockValue)} list value`} />
        <Kpi label="Sold" value={String(stats.soldCount)} sub={`${eur(stats.revenue)} revenue`} />
        <Kpi label="Net profit" value={eur(stats.totalProfit)} sub={`${pct(stats.avgMargin)} margin after fees`} />
        <Kpi label="QC first-pass" value={pct(stats.qcFirstPassRate)} sub="listed without re-repair" />
      </div>

      <div className="grid-3">
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

      <div className="card">
        <h3>Recent activity</h3>
        <ul className="activity">
          {state.syncLog.slice(0, 8).map((e) => (
            <li key={e.id}>
              <span className={`dot ${e.level}`} aria-hidden />
              <span className="grow">
                {e.marketplace && <span className="tag">{MARKETPLACES[e.marketplace].name}</span>} {e.message}
              </span>
              {e.deviceId && (
                <button className="link" onClick={() => onOpen(e.deviceId!)}>
                  {e.deviceId}
                </button>
              )}
              <span className="muted small nowrap">{ago(e.at)}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
