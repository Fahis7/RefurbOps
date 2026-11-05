"use client";
import { useState } from "react";
import type { DayPoint } from "@/domain/stats";
import { GroupedBarChart, LineChart, type BarGroup } from "./charts";
import { dayLabel, eur, eurShort, weekdayLabel } from "./format";

export type Range = 7 | 30;
const RANGES: Range[] = [7, 30];

const sum = (pts: DayPoint[], k: "revenue" | "profit" | "sold" | "received") => pts.reduce((n, p) => n + p[k], 0);

/** Segmented 7d / 30d control. */
export function RangeControl({ value, onChange }: { value: Range; onChange: (r: Range) => void }) {
  return (
    <div className="seg" role="group" aria-label="Time range">
      {RANGES.map((r) => (
        <button key={r} type="button" className="seg-btn" aria-pressed={value === r} onClick={() => onChange(r)}>
          {r}d
        </button>
      ))}
    </div>
  );
}

/** Revenue & profit per day: two lines on one shared € axis, area under revenue only. "View as table" alternative. */
export function RevenueProfitCard({ points, range, onRange }: { points: DayPoint[]; range: Range; onRange: (r: Range) => void }) {
  const [asTable, setAsTable] = useState(false);
  const revenue = sum(points, "revenue");
  const profit = sum(points, "profit");
  const best = points.reduce((b, p) => (p.revenue > b.revenue ? p : b), points[0]);
  const summary =
    `Revenue ${eur(revenue)} and profit ${eur(profit)} over the last ${range} days` +
    (best && best.revenue > 0 ? `; best day ${dayLabel(best.date)} with ${eur(best.revenue)} revenue.` : ".");

  return (
    <section className="card trend-card">
      <div className="trend-head">
        <div>
          <h3>Revenue &amp; profit</h3>
          <p className="muted small trend-sub">
            Last {range} days · <span className="num">{eur(revenue)}</span> revenue · <span className="num">{eur(profit)}</span> profit
          </p>
        </div>
        <div className="trend-tools">
          <RangeControl value={range} onChange={onRange} />
          <button type="button" className="btn ghost small-btn" aria-pressed={asTable} onClick={() => setAsTable((t) => !t)}>
            {asTable ? "View as chart" : "View as table"}
          </button>
        </div>
      </div>
      <div className="legend" aria-hidden>
        <span className="legend-item s-revenue">Revenue</span>
        <span className="legend-item s-profit">Profit</span>
      </div>
      {asTable ? (
        <div className="table-scroll trend-table">
          <table className="table">
            <caption className="sr-only">{summary}</caption>
            <thead>
              <tr>
                <th>Date</th>
                <th className="num">Revenue</th>
                <th className="num">Profit</th>
                <th className="num">Sold</th>
                <th className="num">Received</th>
              </tr>
            </thead>
            <tbody>
              {[...points].reverse().map((p) => (
                <tr key={p.date}>
                  <td>{dayLabel(p.date, true)}</td>
                  <td className="num">{eur(p.revenue, 2)}</td>
                  <td className="num">{eur(p.profit, 2)}</td>
                  <td className="num">{p.sold}</td>
                  <td className="num">{p.received}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <LineChart
          summary={summary}
          xLabels={points.map((p) => dayLabel(p.date))}
          yFormat={eurShort}
          series={[
            { key: "revenue", label: "Revenue", values: points.map((p) => p.revenue), className: "s-revenue", area: true },
            { key: "profit", label: "Profit", values: points.map((p) => p.profit), className: "s-profit" },
          ]}
          describe={(i) => ({
            title: dayLabel(points[i].date, true),
            rows: [
              ["Revenue", eur(points[i].revenue, 2)],
              ["Profit", eur(points[i].profit, 2)],
              ["Units sold", String(points[i].sold)],
            ],
          })}
        />
      )}
    </section>
  );
}

/**
 * Devices in (received) vs out (sold). 7d → per day; 30d → the last 4 full rolling weeks (28 days), so no
 * partial week distorts the comparison. Grouped bars: small whole-number counts per period compare best
 * side by side.
 */
export function InOutCard({ points, range }: { points: DayPoint[]; range: Range }) {
  const perDay = range === 7;
  const groups: BarGroup[] = [];
  if (perDay) {
    for (const p of points) groups.push(group(weekdayLabel(p.date), dayLabel(p.date, true), p.received, p.sold));
  } else {
    const last28 = points.slice(-28);
    for (let w = 0; w < 4; w++) {
      const week = last28.slice(w * 7, w * 7 + 7);
      const end = week[week.length - 1];
      if (!end) continue;
      groups.push(group(dayLabel(end.date), `Week ending ${dayLabel(end.date)}`, sum(week, "received"), sum(week, "sold")));
    }
  }
  const inTotal = groups.reduce((n, g) => n + g.values[0].value, 0);
  const outTotal = groups.reduce((n, g) => n + g.values[1].value, 0);
  const span = perDay ? "last 7 days" : "last 4 weeks";

  return (
    <section className="card">
      <div className="card-head">
        <div>
          <h3>Devices in vs out {perDay ? "per day" : "per week"}</h3>
          <span className="muted small">
            {span[0].toUpperCase() + span.slice(1)} · <span className="num">{inTotal}</span> in · <span className="num">{outTotal}</span> out
          </span>
        </div>
      </div>
      <div className="legend" aria-hidden>
        <span className="legend-item s-in">In (received)</span>
        <span className="legend-item s-out">Out (sold)</span>
      </div>
      <GroupedBarChart groups={groups} summary={`Devices received vs sold, ${span}: ${inTotal} in, ${outTotal} out.`} />
    </section>
  );
}

function group(label: string, title: string, received: number, sold: number): BarGroup {
  return {
    label,
    title,
    values: [
      { key: "in", label: "In", value: received, className: "s-in" },
      { key: "out", label: "Out", value: sold, className: "s-out" },
    ],
  };
}
