"use client";
import { useRef, useState, type ChangeEvent } from "react";
import type { Device } from "@/domain/types";
import { LOW_CONFIDENCE_WARNING, MAX_IMAGES, canApplySuggestion, type GradingSuggestion } from "@/domain/vision";
import type { AiFailure, Api } from "@/client/api";
import { preparePhoto } from "@/client/photo";

type State =
  | { kind: "idle" }
  | { kind: "working"; step: string }
  | { kind: "done"; suggestion: GradingSuggestion }
  | { kind: "failed"; failure: AiFailure | { reason: "photo"; message: string } };

/**
 * "Suggest grade from photo": the AI suggests, the technician decides. Apply only moves the slider –
 * nothing is saved until the technician clicks Save. Photos stay in memory for this request only.
 */
export function PhotoGradeSuggest({
  d,
  api,
  onApply,
  onIgnore,
}: {
  d: Device;
  api: Api;
  onApply: (s: GradingSuggestion) => void;
  onIgnore: () => void;
}) {
  const [state, setState] = useState<State>({ kind: "idle" });
  const input = useRef<HTMLInputElement>(null);

  const onFiles = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = ""; // allow picking the same photo again
    if (files.length === 0) return;
    if (files.length > MAX_IMAGES) {
      setState({ kind: "failed", failure: { reason: "photo", message: `Pick up to ${MAX_IMAGES} photos.` } });
      return;
    }
    setState({ kind: "working", step: "Preparing photos…" });
    const images: string[] = [];
    for (const file of files) {
      const p = await preparePhoto(file);
      if (!p.ok) {
        setState({ kind: "failed", failure: { reason: "photo", message: files.length > 1 ? `${file.name}: ${p.message}` : p.message } });
        return;
      }
      images.push(p.base64);
    }
    setState({ kind: "working", step: "Analysing photos…" });
    try {
      const r = await api.gradePhoto(images, d.category, `${d.brand} ${d.model}`);
      setState(r.ok ? { kind: "done", suggestion: r.suggestion } : { kind: "failed", failure: r });
    } catch {
      setState({ kind: "failed", failure: { ok: false, reason: "unavailable", message: "Something went wrong – try again." } });
    }
  };

  const ignore = () => {
    setState({ kind: "idle" });
    onIgnore();
  };

  return (
    <div className="photo-grade">
      <input ref={input} type="file" accept="image/*" multiple hidden onChange={onFiles} />
      {state.kind !== "done" && (
        <button type="button" className="btn small-btn" onClick={() => input.current?.click()} disabled={state.kind === "working"}>
          📷 {state.kind === "working" ? state.step : "Suggest grade from photo"}
        </button>
      )}
      {state.kind === "idle" && <span className="muted small"> Up to {MAX_IMAGES} photos · AI suggests, you decide</span>}

      {state.kind === "failed" && (
        <p className={state.failure.reason === "not-configured" || state.failure.reason === "offline-demo" ? "answer-info" : "answer-error"} role="alert">
          {state.failure.reason === "not-configured"
            ? "AI photo grading is not configured. Set ANTHROPIC_API_KEY on the server (see README) to enable it."
            : state.failure.message}
        </p>
      )}

      {state.kind === "done" && !canApplySuggestion(state.suggestion) && (
        // Too unsure (e.g. not a device): no score, no Apply – only the message and Ignore.
        <div className="photo-suggestion">
          <p className="answer-info">Too unsure to suggest a grade – grade manually</p>
          {state.suggestion.notes && <p className="muted small photo-notes">{state.suggestion.notes}</p>}
          <div className="row gap">
            <button type="button" className="btn ghost small-btn" onClick={ignore}>
              Ignore
            </button>
          </div>
        </div>
      )}

      {state.kind === "done" && canApplySuggestion(state.suggestion) && (
        <div className="photo-suggestion">
          <p className="photo-suggestion-head">
            <strong>AI suggests {state.suggestion.cosmeticScore}/5</strong>
            <span className="muted small"> · confidence {state.suggestion.confidence.toFixed(2)}</span>
          </p>
          {state.suggestion.confidence < LOW_CONFIDENCE_WARNING && <p className="answer-info">Low confidence – check manually</p>}
          {state.suggestion.damage.length > 0 ? (
            <ul className="damage-list">
              {state.suggestion.damage.map((x, i) => (
                <li key={i}>
                  <span className={`sev sev-${x.severity}`}>{x.severity}</span> {x.area}: {x.issue}
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted small">No visible damage reported.</p>
          )}
          {state.suggestion.notes && <p className="muted small photo-notes">{state.suggestion.notes}</p>}
          <div className="row gap">
            <button type="button" className="btn small-btn" onClick={() => onApply(state.suggestion)}>
              Apply {state.suggestion.cosmeticScore}/5
            </button>
            <button type="button" className="btn ghost small-btn" onClick={ignore}>
              Ignore
            </button>
          </div>
          <p className="muted small photo-notes">AI suggestion from photos – the technician decides. Photos are not stored.</p>
        </div>
      )}
    </div>
  );
}
