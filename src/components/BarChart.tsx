"use client";
import { useState } from "react";

export interface Bar {
  label: string;
  value: number;
  display: string; // formatted value
  detail?: string; // extra tooltip line
}

/** Horizontal single-series bar chart: one hue, value labels, hover tooltip, table-like semantics. */
export function BarChart({ title, bars, caption }: { title: string; bars: Bar[]; caption?: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(...bars.map((b) => Math.abs(b.value)), 1);
  return (
    <figure className="chart">
      <figcaption>
        <h3>{title}</h3>
        {caption && <p className="muted small">{caption}</p>}
      </figcaption>
      <div className="bars" role="table" aria-label={title}>
        {bars.map((b, i) => (
          <div
            key={b.label}
            className={`bar-row ${hover === i ? "hover" : ""}`}
            role="row"
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
          >
            <span className="bar-label" role="rowheader">{b.label}</span>
            <span className="bar-track" role="cell">
              <span
                className={`bar-fill ${b.value < 0 ? "neg" : ""}`}
                style={{ width: `${Math.max(0, (Math.abs(b.value) / max) * 100)}%` }}
              />
              {hover === i && (
                <span className="tooltip" role="tooltip">
                  <strong>{b.label}</strong>: {b.display}
                  {b.detail && <><br />{b.detail}</>}
                </span>
              )}
            </span>
            <span className="bar-value" role="cell">{b.display}</span>
          </div>
        ))}
      </div>
    </figure>
  );
}
