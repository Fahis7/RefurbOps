"use client";
import { useMemo, useState, type FormEvent } from "react";
import type { AppState } from "@/domain/types";
import { MAX_QUESTION_CHARS, buildAssistantContext, linkifyDeviceIds } from "@/domain/assistant";
import type { Api, AskResult } from "@/client/api";
import { EmptyState, IconChat } from "./icons";

const SUGGESTIONS = [
  "Which devices are stuck?",
  "What sold best this week?",
  "Which supplier sends the most QC failures?",
  "Where is profit lowest?",
];

type Turn = { id: number; question: string; result: AskResult | null }; // null = waiting

/**
 * AI Ops Assistant. The answer is model output, so it is rendered as React text nodes only (never HTML).
 * Device IDs that exist in the current state become buttons that open the device drawer.
 */
export function Assistant({ api, state, onOpen }: { api: Api; state: AppState; onOpen: (id: string) => void }) {
  const [question, setQuestion] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const knownIds = useMemo(() => new Set(state.devices.map((d) => d.id)), [state.devices]);
  const busy = turns.some((t) => t.result === null);

  const ask = async (q: string) => {
    const text = q.trim();
    if (!text || busy) return;
    const id = Date.now();
    setTurns((t) => [{ id, question: text, result: null }, ...t].slice(0, 10));
    setQuestion("");
    let result: AskResult;
    try {
      result = await api.ask(text, buildAssistantContext(state, new Date().toISOString()));
    } catch {
      result = { ok: false, reason: "unavailable", message: "Something went wrong – try again." };
    }
    setTurns((t) => t.map((x) => (x.id === id ? { ...x, result } : x)));
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    ask(question);
  };

  return (
    <div className="stack assistant">
      <div className="card">
        <form className="ask-form" onSubmit={onSubmit}>
          <label htmlFor="ask-input" className="ask-label">
            Ask about stock, sales, suppliers or the repair pipeline
          </label>
          <div className="ask-row">
            <input
              id="ask-input"
              className="ask-input"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              maxLength={MAX_QUESTION_CHARS}
              placeholder="e.g. Which devices are stuck?"
              autoComplete="off"
              disabled={busy}
            />
            <button type="submit" className="btn primary" disabled={busy || !question.trim()}>
              {busy ? "Thinking…" : "Ask"}
            </button>
          </div>
        </form>
        <div className="chips" aria-label="Suggested questions">
          {SUGGESTIONS.map((s) => (
            <button key={s} type="button" className="chip" onClick={() => ask(s)} disabled={busy}>
              {s}
            </button>
          ))}
        </div>
      </div>

      {turns.length === 0 && (
        <EmptyState
          icon={<IconChat />}
          title="Ask your first question"
          hint="Answers come from the data currently in the app (up to 300 devices plus pre-computed totals)."
        />
      )}

      <div className="stack" aria-live="polite">
        {turns.map((t) => (
          <div key={t.id} className="card answer">
            <div className="answer-head">
              <p className="answer-q">{t.question}</p>
              <span className="ai-badge" title="AI-generated answer">
                AI
              </span>
            </div>
            {t.result === null ? (
              <div className="skeleton-card answer-loading">
                <span className="sr-only">Thinking…</span>
                <span className="skeleton w-90" aria-hidden />
                <span className="skeleton w-70" aria-hidden />
                <span className="skeleton w-40" aria-hidden />
              </div>
            ) : t.result.ok ? (
              <>
                <p className="answer-text">
                  {linkifyDeviceIds(t.result.answer, knownIds).map((seg, i) =>
                    seg.kind === "text" ? (
                      seg.text
                    ) : (
                      <button key={i} type="button" className="link mono" onClick={() => onOpen(seg.id)}>
                        {seg.id}
                      </button>
                    ),
                  )}
                </p>
                <p className="muted small answer-note">AI answer based on current app data – check before acting.</p>
              </>
            ) : t.result.reason === "not-configured" || t.result.reason === "offline-demo" ? (
              <p className="answer-info">
                {t.result.reason === "not-configured"
                  ? "The AI assistant is not configured. Set ANTHROPIC_API_KEY on the server (see README) to enable it."
                  : t.result.message}
              </p>
            ) : (
              <p className="answer-error" role="alert">
                {t.result.message}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
