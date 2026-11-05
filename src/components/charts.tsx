"use client";
// Hand-rolled SVG charts (no chart library). Drawn at the container's real pixel width via ResizeObserver,
// so text and 2px strokes are never stretched, and nothing overflows on a phone.
import { useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type RefObject } from "react";

/** Width of an element in CSS pixels, kept up to date. 0 until measured. */
function useWidth(ref: RefObject<HTMLElement | null>): number {
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(Math.floor(el.getBoundingClientRect().width));
    const ro = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return width;
}

/** "Nice" axis: steps of 1 / 2 / 2.5 / 5 × 10ⁿ covering [min, max] with about `target` intervals. */
export function niceScale(min: number, max: number, target = 4, integer = false): { lo: number; hi: number; ticks: number[] } {
  if (max <= min) max = min + (integer ? target : 1);
  const raw = (max - min) / target;
  const exp = Math.floor(Math.log10(raw));
  const f = raw / 10 ** exp;
  let step = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * 10 ** exp;
  if (integer) step = Math.max(1, Math.ceil(step));
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Math.round(v * 1000) / 1000);
  return { lo, hi, ticks };
}

/** Indices of ~`count` labels, evenly spaced and always including the last (today). */
function labelIndices(n: number, count: number): number[] {
  if (n <= count) return Array.from({ length: n }, (_, i) => i);
  const step = Math.ceil((n - 1) / (count - 1));
  const out: number[] = [];
  for (let i = n - 1; i >= 0; i -= step) out.unshift(i);
  return out;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/* ------------------------------ line chart ------------------------------ */

export interface LineSeries {
  key: string;
  label: string;
  values: number[];
  className: string; // colour via CSS (light/dark tokens)
  area?: boolean;
}

/**
 * Multi-line chart on ONE shared y-axis. Hover / touch / arrow keys move a crosshair; the tooltip text
 * comes from `describe(i)`. `summary` is the accessible description of the whole chart.
 */
export function LineChart({
  series,
  xLabels,
  yFormat,
  describe,
  summary,
  height = 240,
}: {
  series: LineSeries[];
  xLabels: string[];
  yFormat: (v: number) => string;
  describe: (i: number) => { title: string; rows: [string, string][] };
  summary: string;
  height?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const width = useWidth(ref);
  const [active, setActive] = useState<number | null>(null);
  const n = xLabels.length;

  const compact = width < 480;
  const m = { top: 14, right: compact ? 62 : 74, bottom: 28, left: 48 };
  const iw = Math.max(0, width - m.left - m.right);
  const ih = height - m.top - m.bottom;
  const all = series.flatMap((s) => s.values);
  const { lo, hi, ticks } = niceScale(Math.min(0, ...all), Math.max(0, ...all), 4);
  const x = (i: number) => m.left + (n <= 1 ? iw / 2 : (i * iw) / (n - 1));
  const y = (v: number) => m.top + ih * (1 - (v - lo) / (hi - lo));
  const line = (vals: number[]) => vals.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
  const zeroY = y(clamp(0, lo, hi));

  // Direct labels at the line ends, nudged apart if they would overlap.
  const ends = series.map((s) => ({ s, y: y(s.values[n - 1] ?? 0) }));
  if (ends.length === 2 && Math.abs(ends[0].y - ends[1].y) < 14) {
    const mid = (ends[0].y + ends[1].y) / 2;
    const [upper, lower] = ends[0].y <= ends[1].y ? [ends[0], ends[1]] : [ends[1], ends[0]];
    upper.y = mid - 7;
    lower.y = mid + 7;
  }

  const pick = (e: PointerEvent<SVGSVGElement>) => {
    if (n === 0 || iw <= 0) return;
    const px = e.clientX - e.currentTarget.getBoundingClientRect().left;
    setActive(clamp(Math.round(((px - m.left) / iw) * (n - 1)), 0, n - 1));
  };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const cur = active ?? n - 1;
    const next = { ArrowLeft: cur - 1, ArrowRight: cur + 1, Home: 0, End: n - 1 }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    setActive(clamp(next, 0, n - 1));
  };

  const tip = active !== null ? describe(active) : null;
  const tipW = 176;
  const tipLeft = active !== null ? clamp(x(active) - tipW / 2, 0, Math.max(0, width - tipW)) : 0;

  return (
    <div
      ref={ref}
      className="line-chart"
      style={{ height }}
      role="group"
      aria-label={summary}
      tabIndex={0}
      onKeyDown={onKey}
      onFocus={() => setActive((a) => a ?? n - 1)}
      onBlur={() => setActive(null)}
    >
      {width > 0 && (
        <svg width={width} height={height} aria-hidden onPointerMove={pick} onPointerDown={pick} onPointerLeave={() => setActive(null)}>
          {ticks.map((t) => (
            <g key={t}>
              <line className="grid-line" x1={m.left} x2={m.left + iw} y1={y(t)} y2={y(t)} />
              <text className="axis-label" x={m.left - 8} y={y(t)} dy="0.32em" textAnchor="end">
                {yFormat(t)}
              </text>
            </g>
          ))}
          {labelIndices(n, compact ? 3 : 5).map((i) => (
            <text key={i} className="axis-label" x={x(i)} y={height - 8} textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"}>
              {xLabels[i]}
            </text>
          ))}
          {series.map(
            (s) =>
              s.area &&
              n > 1 && (
                <path
                  key={`${s.key}-area`}
                  className={`area ${s.className}`}
                  d={`${line(s.values)}L${x(n - 1).toFixed(1)},${zeroY.toFixed(1)}L${x(0).toFixed(1)},${zeroY.toFixed(1)}Z`}
                />
              ),
          )}
          {series.map((s) => (
            <path key={s.key} className={`series-line ${s.className}`} d={line(s.values)} />
          ))}
          {ends.map(({ s, y: ly }) => (
            <text key={`${s.key}-end`} className={`end-label ${s.className}`} x={x(n - 1) + 8} y={ly} dy="0.32em">
              {s.label}
            </text>
          ))}
          {active !== null && (
            <g>
              <line className="crosshair" x1={x(active)} x2={x(active)} y1={m.top} y2={m.top + ih} />
              {series.map((s) => (
                <circle key={s.key} className={`dot ${s.className}`} cx={x(active)} cy={y(s.values[active])} r={3.5} />
              ))}
            </g>
          )}
        </svg>
      )}
      {tip && (
        <div className="chart-tip" style={{ left: tipLeft, width: tipW }} aria-hidden>
          <strong>{tip.title}</strong>
          {tip.rows.map(([k, v]) => (
            <span key={k} className="chart-tip-row">
              <span>{k}</span>
              <span className="num">{v}</span>
            </span>
          ))}
        </div>
      )}
      <p className="sr-only" aria-live="polite">
        {tip ? `${tip.title}: ${tip.rows.map(([k, v]) => `${k} ${v}`).join(", ")}` : ""}
      </p>
    </div>
  );
}

/* --------------------------- grouped bar chart --------------------------- */

export interface BarGroup {
  label: string;
  title: string; // tooltip title, e.g. "Week ending 5 Nov"
  values: { key: string; label: string; value: number; className: string }[];
}

/** Side-by-side bars per group on one integer y-axis, values written above the bars. */
export function GroupedBarChart({ groups, summary, height = 200 }: { groups: BarGroup[]; summary: string; height?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const width = useWidth(ref);
  const [active, setActive] = useState<number | null>(null);
  const m = { top: 18, right: 8, bottom: 28, left: 30 };
  const iw = Math.max(0, width - m.left - m.right);
  const ih = height - m.top - m.bottom;
  const { hi, ticks } = niceScale(0, Math.max(1, ...groups.flatMap((g) => g.values.map((v) => v.value))), 3, true);
  const y = (v: number) => m.top + ih * (1 - v / hi);
  const gw = groups.length ? iw / groups.length : 0;
  const per = groups[0]?.values.length ?? 1;
  const bw = Math.min(22, (gw * 0.6) / per);
  const gap = 3;

  const tip = active !== null ? groups[active] : null;
  const tipW = 150;
  const tipLeft = active !== null ? clamp(m.left + gw * (active + 0.5) - tipW / 2, 0, Math.max(0, width - tipW)) : 0;

  return (
    <div
      ref={ref}
      className="line-chart"
      style={{ height }}
      role="group"
      aria-label={summary}
      tabIndex={0}
      onFocus={() => setActive((a) => a ?? groups.length - 1)}
      onBlur={() => setActive(null)}
      onKeyDown={(e) => {
        const cur = active ?? groups.length - 1;
        const next = { ArrowLeft: cur - 1, ArrowRight: cur + 1 }[e.key];
        if (next === undefined) return;
        e.preventDefault();
        setActive(clamp(next, 0, groups.length - 1));
      }}
    >
      {width > 0 && (
        <svg width={width} height={height} aria-hidden onPointerLeave={() => setActive(null)}>
          {ticks.map((t) => (
            <g key={t}>
              <line className="grid-line" x1={m.left} x2={m.left + iw} y1={y(t)} y2={y(t)} />
              <text className="axis-label" x={m.left - 6} y={y(t)} dy="0.32em" textAnchor="end">
                {t}
              </text>
            </g>
          ))}
          {groups.map((g, gi) => {
            const cx = m.left + gw * (gi + 0.5);
            const total = per * bw + (per - 1) * gap;
            return (
              <g key={g.label} className={active === gi ? "bar-group active" : "bar-group"} onPointerEnter={() => setActive(gi)} onPointerDown={() => setActive(gi)}>
                <rect className="hit" x={cx - gw / 2} y={m.top} width={gw} height={ih} />
                {g.values.map((v, vi) => {
                  const bx = cx - total / 2 + vi * (bw + gap);
                  const by = y(v.value);
                  return (
                    <g key={v.key}>
                      <rect className={`gbar ${v.className}`} x={bx} y={by} width={bw} height={Math.max(0, m.top + ih - by)} rx={2} />
                      {bw >= 12 && (
                        <text className="bar-count" x={bx + bw / 2} y={by - 4} textAnchor="middle">
                          {v.value}
                        </text>
                      )}
                    </g>
                  );
                })}
                <text className="axis-label" x={cx} y={height - 8} textAnchor="middle">
                  {g.label}
                </text>
              </g>
            );
          })}
        </svg>
      )}
      {tip && (
        <div className="chart-tip" style={{ left: tipLeft, width: tipW }} aria-hidden>
          <strong>{tip.title}</strong>
          {tip.values.map((v) => (
            <span key={v.key} className="chart-tip-row">
              <span>{v.label}</span>
              <span className="num">{v.value}</span>
            </span>
          ))}
        </div>
      )}
      <p className="sr-only" aria-live="polite">
        {tip ? `${tip.title}: ${tip.values.map((v) => `${v.label} ${v.value}`).join(", ")}` : ""}
      </p>
    </div>
  );
}

/* ------------------------------- sparkline ------------------------------- */

/** Decorative 14-day trend in a KPI tile (the KPI value itself carries the meaning). Stretches to its row width. */
export function Sparkline({ values, className = "" }: { values: number[]; className?: string }) {
  const w = 100;
  const h = 24;
  if (values.length < 2) return null;
  const min = Math.min(0, ...values);
  const max = Math.max(...values, min + 1);
  const px = (i: number) => (i * w) / (values.length - 1);
  const py = (v: number) => h - 2 - ((v - min) / (max - min)) * (h - 4);
  const d = values.map((v, i) => `${i ? "L" : "M"}${px(i).toFixed(2)},${py(v).toFixed(2)}`).join("");
  return (
    <svg className={`spark ${className}`} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden>
      <path className="spark-area" d={`${d}L${w},${h}L0,${h}Z`} />
      <path className="spark-line" d={d} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
