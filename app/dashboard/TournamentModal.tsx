"use client";

/**
 * TournamentModal — inline modal for creating and viewing LLM tournaments.
 *
 * Opened from the BacktestTab "Tournament" button.
 * Follows the same CSS variables and card patterns as BacktestTab.
 */

import { useState, type FormEvent } from "react";
import { fetchWithAuth } from "@/lib/api";
import { PROVIDER_DEFAULTS } from "@/lib/agents/llm";
import type { LLMProvider } from "@/lib/agents/llm";
import type {
  BacktestVariant,
  Philosophy,
  TournamentRound,
  TournamentResult,
  RoundResult,
} from "@/lib/backtest/tournament";

// ─── Local types ───────────────────────────────────────────────────────────────

type TournamentJobStatus = "pending" | "running" | "completed" | "failed";

type TournamentJob = {
  id: string;
  status: TournamentJobStatus;
  current_round: number;
  total_rounds: number;
  config: {
    rank_by: "sharpe" | "cagr" | "calmar";
    variants: BacktestVariant[];
    rounds: TournamentRound[];
    tickers: string[];
    start_date: string;
    end_date: string;
  };
  created_at: string;
};

// ─── Constants ─────────────────────────────────────────────────────────────────

const PHILOSOPHIES: Philosophy[] = ["growth", "value", "momentum", "balanced"];
const MODES = ["advisory", "autonomous"] as const;
const PROVIDERS: { id: LLMProvider; label: string }[] = [
  { id: "gemini", label: "Gemini" },
  { id: "groq", label: "Groq" },
  { id: "ollama", label: "Ollama" },
  { id: "openai-compatible", label: "Custom" },
];

const statusColor: Record<TournamentJobStatus, string> = {
  pending:   "var(--dim)",
  running:   "var(--hold)",
  completed: "var(--bull)",
  failed:    "var(--bear)",
};
const statusBg: Record<TournamentJobStatus, string> = {
  pending:   "rgba(120,120,140,0.18)",
  running:   "rgba(245,158,11,0.18)",
  completed: "rgba(16,185,129,0.18)",
  failed:    "rgba(239,68,68,0.18)",
};

const consistencyColor = (v: number) =>
  v >= 0.8 ? "var(--bull)" : v >= 0.5 ? "var(--hold)" : "var(--bear)";
const consistencyBg = (v: number) =>
  v >= 0.8 ? "rgba(16,185,129,0.15)" : v >= 0.5 ? "rgba(245,158,11,0.15)" : "rgba(239,68,68,0.15)";

// ─── inputStyle (mirrors BacktestTab) ─────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  width: "100%",
  background: "var(--elevated)",
  border: "1px solid var(--line)",
  borderRadius: 6,
  padding: "9px 12px",
  fontSize: 13,
  fontFamily: "var(--font-nunito)",
  color: "var(--ink)",
  outline: "none",
  boxSizing: "border-box",
};

// ─── Subcomponents ─────────────────────────────────────────────────────────────

function FieldLabel({ label, hint }: { label: string; hint?: string }) {
  return (
    <div style={{ fontFamily: "var(--font-jb)", fontSize: 10, color: "var(--ghost)", marginBottom: 6 }}>
      {label}
      {hint && <span style={{ marginLeft: 8, opacity: 0.6 }}>{hint}</span>}
    </div>
  );
}

function RoundRow({
  index,
  round,
  onChange,
  onRemove,
  canRemove,
}: {
  index: number;
  round: RoundDraft;
  onChange: (r: RoundDraft) => void;
  onRemove: () => void;
  canRemove: boolean;
}) {
  return (
    <div style={{
      background: "var(--elevated)",
      border: "1px solid var(--line)",
      borderRadius: 8,
      padding: "10px 12px",
      display: "flex",
      flexDirection: "column",
      gap: 8,
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontFamily: "var(--font-jb)", fontSize: 10, color: "var(--ghost)" }}>
          ROUND {index + 1}
        </span>
        {canRemove && (
          <button type="button" onClick={onRemove} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ghost)", fontSize: 14, lineHeight: 1 }}>×</button>
        )}
      </div>

      <div style={{ display: "flex", gap: 6 }}>
        {PROVIDERS.map(({ id, label }) => {
          const active = round.provider === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onChange({ ...round, provider: id, model: PROVIDER_DEFAULTS[id].quick })}
              style={{
                flex: 1,
                padding: "6px 4px",
                borderRadius: 5,
                fontFamily: "var(--font-nunito)",
                fontSize: 11,
                fontWeight: active ? 700 : 500,
                border: `1px solid ${active ? "var(--brand)" : "var(--line)"}`,
                color: active ? "var(--brand)" : "var(--ghost)",
                background: active ? "var(--brand)12" : "transparent",
                cursor: "pointer",
                transition: "all 0.15s",
              }}
            >
              {label}
            </button>
          );
        })}
      </div>

      <input
        value={round.model}
        onChange={(e) => onChange({ ...round, model: e.target.value })}
        placeholder={PROVIDER_DEFAULTS[round.provider].quick}
        style={{ ...inputStyle, fontSize: 12 }}
      />

      {round.provider === "openai-compatible" && (
        <input
          value={round.baseUrl}
          onChange={(e) => onChange({ ...round, baseUrl: e.target.value })}
          placeholder="https://api.example.com/v1"
          style={{ ...inputStyle, fontSize: 12 }}
        />
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontFamily: "var(--font-jb)", fontSize: 10, color: "var(--ghost)" }}>KEEP TOP</span>
        {[1, 2, 3, 4].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onChange({ ...round, top_n: n })}
            style={{
              width: 28, height: 28,
              borderRadius: 4,
              fontFamily: "var(--font-jb)",
              fontSize: 12,
              fontWeight: round.top_n === n ? 700 : 500,
              border: `1px solid ${round.top_n === n ? "var(--brand)" : "var(--line)"}`,
              color: round.top_n === n ? "var(--brand)" : "var(--ghost)",
              background: round.top_n === n ? "var(--brand)12" : "transparent",
              cursor: "pointer",
            }}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Round progress indicator ──────────────────────────────────────────────────

function TournamentProgress({ job, result }: { job: TournamentJob; result: TournamentResult | null }) {
  const pct = job.total_rounds > 0
    ? Math.round((job.current_round / job.total_rounds) * 100)
    : 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Progress bar */}
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
          <span style={{ fontFamily: "var(--font-jb)", fontSize: 10, color: "var(--ghost)" }}>
            ROUND {job.current_round} / {job.total_rounds}
          </span>
          <span style={{ fontFamily: "var(--font-jb)", fontSize: 10, color: "var(--ghost)" }}>{pct}%</span>
        </div>
        <div style={{ background: "var(--elevated)", borderRadius: 4, height: 5, overflow: "hidden" }}>
          <div style={{
            width: `${pct}%`,
            height: "100%",
            borderRadius: 4,
            background: job.status === "completed" ? "var(--bull)" : "var(--hold)",
            transition: "width 0.6s cubic-bezier(0.4,0,0.2,1)",
          }} />
        </div>
      </div>

      {/* Round cards from result */}
      {result?.rounds.map((r: RoundResult) => (
        <div key={r.round_index} style={{
          background: "var(--elevated)",
          border: "1px solid var(--line)",
          borderRadius: 8,
          padding: "10px 12px",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
            <span style={{ fontFamily: "var(--font-jb)", fontSize: 10, color: "var(--ghost)" }}>
              ROUND {r.round_index + 1} · {r.provider.toUpperCase()}
            </span>
            <span style={{ fontFamily: "var(--font-jb)", fontSize: 10, color: "var(--dim)" }}>
              {r.results.length} variants → {r.survivors.length} kept
            </span>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {r.survivors.map((v) => (
              <span key={v.label} style={{
                fontSize: 10, fontFamily: "var(--font-jb)",
                padding: "2px 7px", borderRadius: 4,
                background: "var(--bull-bg)", color: "var(--bull)",
              }}>
                {v.label}
              </span>
            ))}
          </div>
        </div>
      ))}

      {/* Winner card */}
      {job.status === "completed" && result?.winner && (
        <div style={{
          background: "var(--bull-bg)",
          border: "1px solid var(--bull)40",
          borderRadius: 10,
          padding: "14px 16px",
        }}>
          <div style={{ fontFamily: "var(--font-jb)", fontSize: 10, color: "var(--bull)", marginBottom: 6 }}>WINNER</div>
          <div style={{ fontFamily: "var(--font-jb)", fontWeight: 700, fontSize: 15, color: "var(--ink)", marginBottom: 4 }}>
            {result.winner.label}
          </div>
          <div style={{ fontSize: 12, fontFamily: "var(--font-nunito)", color: "var(--dim)" }}>
            {result.winner.philosophy} · {result.winner.mode}
          </div>
          {result.runner_up && (
            <div style={{ marginTop: 8, fontSize: 11, fontFamily: "var(--font-nunito)", color: "var(--ghost)" }}>
              Runner-up: {result.runner_up.label}
            </div>
          )}
        </div>
      )}

      {/* Consistency badge */}
      {job.status === "completed" && result && (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontFamily: "var(--font-jb)", fontSize: 10, color: "var(--ghost)" }}>CROSS-MODEL CONSISTENCY</span>
          <span style={{
            fontSize: 12, fontFamily: "var(--font-jb)", fontWeight: 700,
            padding: "3px 10px", borderRadius: 5,
            color: consistencyColor(result.cross_model_consistency),
            background: consistencyBg(result.cross_model_consistency),
            border: `1px solid ${consistencyColor(result.cross_model_consistency)}40`,
          }}>
            {(result.cross_model_consistency * 100).toFixed(0)}%
          </span>
        </div>
      )}
    </div>
  );
}

// ─── Draft types ───────────────────────────────────────────────────────────────

type RoundDraft = {
  provider: LLMProvider;
  model: string;
  baseUrl: string;
  top_n: number;
};

function defaultRound(): RoundDraft {
  return { provider: "gemini", model: PROVIDER_DEFAULTS.gemini.quick, baseUrl: "", top_n: 2 };
}

function defaultVariants(): BacktestVariant[] {
  return PHILOSOPHIES.flatMap((philosophy) =>
    MODES.map((mode) => ({
      philosophy,
      mode,
      label: `${philosophy}-${mode}`,
    })),
  );
}

// ─── Main modal component ──────────────────────────────────────────────────────

export function TournamentModal({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<"create" | "status">("create");

  // Creation form state
  const [tickers, setTickers] = useState("AAPL, MSFT, TSLA");
  const [startDate, setStartDate] = useState("2025-11-17");
  const [endDate, setEndDate] = useState("2026-01-17");
  const [selectedVariants, setSelectedVariants] = useState<Set<string>>(
    () => new Set(defaultVariants().map((v) => v.label)),
  );
  const [rounds, setRounds] = useState<RoundDraft[]>([defaultRound()]);
  const [rankBy, setRankBy] = useState<"sharpe" | "cagr" | "calmar">("sharpe");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Status view state
  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<TournamentJob | null>(null);
  const [result, setResult] = useState<TournamentResult | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);

  function toggleVariant(label: string) {
    setSelectedVariants((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  }

  function updateRound(i: number, r: RoundDraft) {
    setRounds((prev) => prev.map((old, idx) => (idx === i ? r : old)));
  }

  function removeRound(i: number) {
    setRounds((prev) => prev.filter((_, idx) => idx !== i));
  }

  function addRound() {
    if (rounds.length >= 3) return;
    setRounds((prev) => [...prev, defaultRound()]);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setSubmitError(null);

    const allVariants = defaultVariants().filter((v) => selectedVariants.has(v.label));
    if (allVariants.length === 0) {
      setSubmitError("Select at least one variant.");
      setSubmitting(false);
      return;
    }

    const body = {
      tickers: tickers.split(",").map((t) => t.trim().toUpperCase()).filter(Boolean),
      start_date: startDate,
      end_date: endDate,
      variants: allVariants,
      rounds: rounds.map((r) => ({
        provider: {
          provider: r.provider,
          model: r.model || PROVIDER_DEFAULTS[r.provider].quick,
          ...(r.baseUrl ? { baseUrl: r.baseUrl } : {}),
        },
        top_n: r.top_n,
      })),
      rank_by: rankBy,
    };

    const res = await fetchWithAuth("/v1/tournament", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res) { setSubmitting(false); return; }

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setSubmitError(data.error ?? "Failed to create tournament");
      setSubmitting(false);
      return;
    }

    const created = await res.json();
    setJobId(created.id);
    setTab("status");
    setSubmitting(false);
    void loadStatus(created.id);
  }

  async function loadStatus(id: string) {
    setLoadingStatus(true);
    setStatusError(null);
    const res = await fetchWithAuth(`/v1/tournament/${id}`);
    if (!res || !res.ok) {
      setStatusError("Failed to load tournament status.");
      setLoadingStatus(false);
      return;
    }
    const data = await res.json();
    setJob(data as TournamentJob);
    setLoadingStatus(false);
  }

  async function handleLoadById(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!jobId) return;
    await loadStatus(jobId);
  }

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 100,
        background: "rgba(0,0,0,0.55)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "var(--surface)",
          border: "1px solid var(--line)",
          borderRadius: 14,
          width: "100%",
          maxWidth: 560,
          maxHeight: "90vh",
          overflowY: "auto",
          padding: "20px 20px 24px",
          boxSizing: "border-box",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <span style={{ fontFamily: "var(--font-jb)", fontSize: 11, color: "var(--ghost)" }}>
            TOURNAMENT
          </span>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ghost)", fontSize: 18, lineHeight: 1 }}>×</button>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
          {(["create", "status"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                padding: "6px 14px",
                borderRadius: 6,
                fontFamily: "var(--font-nunito)",
                fontSize: 12,
                fontWeight: tab === t ? 700 : 500,
                border: `1px solid ${tab === t ? "var(--brand)" : "var(--line)"}`,
                color: tab === t ? "var(--brand)" : "var(--ghost)",
                background: tab === t ? "var(--brand)12" : "transparent",
                cursor: "pointer",
              }}
            >
              {t === "create" ? "New Tournament" : "Status"}
            </button>
          ))}
        </div>

        {/* ── Create tab ── */}
        {tab === "create" && (
          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <FieldLabel label="TICKERS" hint="comma-separated" />
              <input value={tickers} onChange={(e) => setTickers(e.target.value)} style={inputStyle} placeholder="AAPL, MSFT" />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div>
                <FieldLabel label="START DATE" />
                <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={inputStyle} />
              </div>
              <div>
                <FieldLabel label="END DATE" />
                <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} style={inputStyle} />
              </div>
            </div>

            {/* Variants matrix */}
            <div>
              <FieldLabel label="VARIANTS" hint="philosophy × mode" />
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 5 }}>
                {defaultVariants().map((v) => {
                  const active = selectedVariants.has(v.label);
                  return (
                    <button
                      key={v.label}
                      type="button"
                      onClick={() => toggleVariant(v.label)}
                      style={{
                        padding: "6px 4px",
                        borderRadius: 5,
                        fontFamily: "var(--font-nunito)",
                        fontSize: 10,
                        fontWeight: active ? 700 : 500,
                        border: `1px solid ${active ? "var(--brand)" : "var(--line)"}`,
                        color: active ? "var(--brand)" : "var(--ghost)",
                        background: active ? "var(--brand)12" : "transparent",
                        cursor: "pointer",
                        transition: "all 0.15s",
                        textAlign: "center",
                        lineHeight: 1.4,
                      }}
                    >
                      {v.philosophy}<br />
                      <span style={{ opacity: 0.7 }}>{v.mode}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Rounds */}
            <div>
              <FieldLabel label="ROUNDS" />
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {rounds.map((r, i) => (
                  <RoundRow
                    key={i}
                    index={i}
                    round={r}
                    onChange={(nr) => updateRound(i, nr)}
                    onRemove={() => removeRound(i)}
                    canRemove={rounds.length > 1}
                  />
                ))}
                {rounds.length < 3 && (
                  <button
                    type="button"
                    onClick={addRound}
                    style={{
                      background: "none",
                      border: "1px dashed var(--line)",
                      borderRadius: 8,
                      padding: "8px",
                      color: "var(--ghost)",
                      fontFamily: "var(--font-nunito)",
                      fontSize: 12,
                      cursor: "pointer",
                    }}
                  >
                    + Add round
                  </button>
                )}
              </div>
            </div>

            {/* Rank by */}
            <div>
              <FieldLabel label="RANK BY" />
              <div style={{ display: "flex", gap: 6 }}>
                {(["sharpe", "cagr", "calmar"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setRankBy(m)}
                    style={{
                      flex: 1, padding: "7px 4px", borderRadius: 6,
                      fontFamily: "var(--font-jb)",
                      fontSize: 11,
                      fontWeight: rankBy === m ? 700 : 500,
                      border: `1px solid ${rankBy === m ? "var(--brand)" : "var(--line)"}`,
                      color: rankBy === m ? "var(--brand)" : "var(--ghost)",
                      background: rankBy === m ? "var(--brand)12" : "transparent",
                      cursor: "pointer",
                    }}
                  >
                    {m.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            {submitError && (
              <div style={{ fontSize: 12, color: "var(--bear)", fontFamily: "var(--font-nunito)" }}>{submitError}</div>
            )}

            <button
              type="submit"
              disabled={submitting}
              style={{
                background: "var(--brand)", color: "#fff",
                fontFamily: "var(--font-nunito)", fontWeight: 700, fontSize: 13,
                padding: "10px 14px", borderRadius: 6, border: "none",
                cursor: submitting ? "not-allowed" : "pointer",
                opacity: submitting ? 0.7 : 1,
              }}
            >
              {submitting ? "Starting…" : "Start Tournament"}
            </button>
          </form>
        )}

        {/* ── Status tab ── */}
        {tab === "status" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {/* Load by ID */}
            {!jobId && (
              <form onSubmit={handleLoadById} style={{ display: "flex", gap: 8 }}>
                <input
                  value={jobId ?? ""}
                  onChange={(e) => setJobId(e.target.value)}
                  placeholder="Tournament ID"
                  style={{ ...inputStyle, flex: 1 }}
                />
                <button
                  type="submit"
                  style={{
                    background: "var(--brand)", color: "#fff",
                    fontFamily: "var(--font-nunito)", fontWeight: 700, fontSize: 12,
                    padding: "8px 12px", borderRadius: 6, border: "none", cursor: "pointer",
                  }}
                >
                  Load
                </button>
              </form>
            )}

            {loadingStatus && (
              <div style={{ color: "var(--ghost)", fontSize: 13, fontFamily: "var(--font-nunito)" }}>Loading…</div>
            )}
            {statusError && (
              <div style={{ fontSize: 12, color: "var(--bear)", fontFamily: "var(--font-nunito)" }}>{statusError}</div>
            )}

            {job && (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{
                    fontSize: 10, fontFamily: "var(--font-jb)",
                    color: statusColor[job.status],
                    padding: "2px 8px", borderRadius: 4,
                    background: statusBg[job.status],
                    border: `1px solid ${statusColor[job.status]}50`,
                    fontWeight: 600,
                  }}>
                    {job.status}
                  </span>
                  <span style={{ fontFamily: "var(--font-jb)", fontSize: 10, color: "var(--ghost)" }}>
                    {job.config.tickers.join(" · ")} · {job.config.start_date} → {job.config.end_date}
                  </span>
                  <button
                    onClick={() => void loadStatus(job.id)}
                    style={{
                      marginLeft: "auto",
                      background: "none", border: "none", cursor: "pointer",
                      color: "var(--ghost)", fontSize: 11, fontFamily: "var(--font-jb)",
                    }}
                  >
                    ↺ Refresh
                  </button>
                </div>

                <TournamentProgress job={job} result={result} />
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
