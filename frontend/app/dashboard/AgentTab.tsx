"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { fetchWatchlist, saveWatchlist, type WatchlistEntry, type WatchlistSchedule } from "@/lib/api";

// ─── Types ────────────────────────────────────────────────────────────────────

type Schedule = WatchlistSchedule;

type Signal = {
  id: string;
  ticker: string;
  action: "BUY" | "SELL" | "HOLD";
  confidence: number;
  reasoning: string;
  boundary_mode: string;
  created_at: string;
  status?: string;
  execution?: {
    executed: boolean;
    rejected: boolean;
    order_id?: string;
    status: string;
  };
  shares?: number | null;
  price?: number | null;
};

type LogGroup = {
  key: string;
  label: string;
  signals: Signal[];
};

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_WATCHLIST: WatchlistEntry[] = [
  { ticker: "META",  schedule: "3x" },
  { ticker: "AAPL",  schedule: "3x" },
  { ticker: "NVDA",  schedule: "3x" },
  { ticker: "AMZN",  schedule: "3x" },
  { ticker: "MSFT",  schedule: "3x" },
];

const SCAN_TIMES: Record<Schedule, string[]> = {
  "1x": ["16:30"],
  "3x": ["08:30", "13:00", "16:30"],
  "6x": ["06:30", "09:30", "12:00", "13:30", "15:00", "16:30"],
};

/** Pastel tones for agent recommendations (not yet executed). */
const ACTION_COLOR = {
  BUY:  "var(--bull)",
  SELL: "var(--bear)",
  HOLD: "var(--hold)",
} as const;

/** Solid / high-saturation tones for signals actually executed on Alpaca. */
const EXECUTED_COLOR = {
  BUY:  "#16a34a",   // solid green-600
  SELL: "#dc2626",   // solid red-600
  HOLD: "var(--hold)",
} as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Returns the next scheduled scan time string for a given schedule, in EST. */
function getNextScan(schedule: Schedule): string {
  const now = new Date();
  const estHour = (now.getUTCHours() - 5 + 24) % 24;
  const estMin  = now.getUTCMinutes();
  const current = estHour * 60 + estMin;

  for (const t of SCAN_TIMES[schedule]) {
    const [h, m] = t.split(":").map(Number);
    if (h * 60 + m > current) return `${t} EST`;
  }
  return `Tomorrow ${SCAN_TIMES[schedule][0]} EST`;
}

/** Returns a countdown string like "2h 14m" until the next scan for a schedule. */
function getCountdown(schedule: Schedule): string {
  const now = new Date();
  const estHour = (now.getUTCHours() - 5 + 24) % 24;
  const estMin  = now.getUTCMinutes();
  const current = estHour * 60 + estMin;

  for (const t of SCAN_TIMES[schedule]) {
    const [h, m] = t.split(":").map(Number);
    const delta = h * 60 + m - current;
    if (delta > 0) {
      const hours = Math.floor(delta / 60);
      const mins  = delta % 60;
      return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
    }
  }
  // Tomorrow
  const [h, m] = SCAN_TIMES[schedule][0].split(":").map(Number);
  const delta = (24 * 60 - current) + h * 60 + m;
  const hours = Math.floor(delta / 60);
  const mins  = delta % 60;
  return `${hours}h ${mins}m`;
}

/** Snaps a timestamp to the nearest 3× scan window (08:30 / 13:00 / 16:30 EST). */
function snapToWindow(iso: string): string {
  const d = new Date(iso);
  const estHour = (d.getUTCHours() - 5 + 24) % 24;
  const estMin  = d.getUTCMinutes();
  const total   = estHour * 60 + estMin;
  if (total < 10 * 60 + 45) return "08:30";
  if (total < 14 * 60 + 45) return "13:00";
  return "16:30";
}

/** Groups signals into run windows, sorted newest first. */
function groupSignals(signals: Signal[]): LogGroup[] {
  const map = new Map<string, Signal[]>();

  for (const sig of signals) {
    const dateKey = sig.created_at.slice(0, 10); // YYYY-MM-DD
    const window  = snapToWindow(sig.created_at);
    const key     = `${dateKey}_${window}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(sig);
  }

  const todayStr     = new Date().toISOString().slice(0, 10);
  const yesterdayStr = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);

  return [...map.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([key, sigs]) => {
      const [dateKey, window] = key.split("_");
      let dateLabel = dateKey;
      if (dateKey === todayStr)     dateLabel = "Today";
      else if (dateKey === yesterdayStr) dateLabel = "Yesterday";
      else {
        const d = new Date(dateKey + "T12:00:00Z");
        dateLabel = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      }
      return {
        key,
        label: `${dateLabel} · ${window} EST`,
        signals: [...sigs].sort((a, b) => {
          // BUY/SELL first, then HOLD; within each group, higher confidence first
          const aScore = a.action !== "HOLD" ? 1 : 0;
          const bScore = b.action !== "HOLD" ? 1 : 0;
          if (aScore !== bScore) return bScore - aScore;
          return b.confidence - a.confidence;
        }),
      };
    });
}

// ─── ConfigPanel ──────────────────────────────────────────────────────────────

function ConfigPanel({
  watchlist,
  onChange,
}: {
  watchlist: WatchlistEntry[];
  onChange: (w: WatchlistEntry[]) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [input, setInput]       = useState("");
  const [error, setError]       = useState("");
  const [countdown, setCountdown] = useState(() => getCountdown("3x"));

  // Live countdown ticker
  useEffect(() => {
    const id = setInterval(() => setCountdown(getCountdown("3x")), 30_000);
    return () => clearInterval(id);
  }, []);

  const tickerList  = watchlist.map((w) => w.ticker);
  const previewText =
    tickerList.length <= 3
      ? tickerList.join("  ·  ")
      : `${tickerList.slice(0, 3).join("  ·  ")}  +${tickerList.length - 3}`;

  function removeTicker(ticker: string) {
    onChange(watchlist.filter((w) => w.ticker !== ticker));
  }

  function setSchedule(ticker: string, schedule: Schedule) {
    onChange(watchlist.map((w) => (w.ticker === ticker ? { ...w, schedule } : w)));
  }

  function addTicker() {
    const t = input.trim().toUpperCase();
    if (!t)                                     { setError("Enter a ticker");          return; }
    if (!/^[A-Z]{1,5}$/.test(t))               { setError("1–5 letters only");        return; }
    if (watchlist.some((w) => w.ticker === t))  { setError("Already in watchlist");    return; }
    onChange([...watchlist, { ticker: t, schedule: "3x" }]);
    setInput("");
    setError("");
  }

  return (
    <div style={{
      background: "var(--surface)",
      border: "1px solid var(--line)",
      borderRadius: 12,
      marginBottom: 16,
      overflow: "hidden",
      boxShadow: "var(--card-shadow)",
    }}>
      {/* ── Header row ── */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left"
        style={{
          background: "none",
          border: "none",
          padding: "14px 16px",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 9,
            fontFamily: "var(--font-jb)",
            color: "var(--ghost)",
            letterSpacing: "0.1em",
            marginBottom: 5,
            textTransform: "uppercase" as const,
          }}>
            Agent Config
          </div>
          {!expanded && (
            <div style={{
              fontSize: 12,
              fontFamily: "var(--font-jb)",
              color: "var(--dim)",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}>
              {previewText}
              <span style={{ color: "var(--ghost)", margin: "0 6px" }}>·</span>
              <span style={{ color: "var(--brand)" }}>next {countdown}</span>
            </div>
          )}
        </div>
        <div style={{
          width: 28,
          height: 28,
          borderRadius: 7,
          background: expanded ? `${"var(--brand)"}18` : "var(--elevated)",
          border: `1px solid ${expanded ? "var(--brand)" : "var(--line)"}40`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: expanded ? "var(--brand)" : "var(--ghost)",
          fontSize: 11,
          flexShrink: 0,
          fontFamily: "var(--font-jb)",
          transition: "all 0.15s ease",
        }}>
          {expanded ? "▴" : "▾"}
        </div>
      </button>

      {/* ── Expanded body ── */}
      {expanded && (
        <div style={{ padding: "0 16px 16px" }}>
          <div style={{ borderTop: "1px solid var(--line)", marginBottom: 16 }} />

          {/* Watchlist */}
          <div style={{
            fontSize: 9,
            fontFamily: "var(--font-jb)",
            color: "var(--ghost)",
            letterSpacing: "0.1em",
            textTransform: "uppercase" as const,
            marginBottom: 10,
          }}>
            Watchlist
          </div>
          <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 6, marginBottom: 12 }}>
            {watchlist.map((w) => (
              <div
                key={w.ticker}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                  padding: "4px 8px 4px 10px",
                  borderRadius: 6,
                  background: "var(--elevated)",
                  border: "1px solid var(--line)",
                  fontSize: 12,
                  fontFamily: "var(--font-jb)",
                  fontWeight: 700,
                  color: "var(--ink)",
                }}
              >
                {w.ticker}
                <button
                  onClick={() => removeTicker(w.ticker)}
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    color: "var(--ghost)",
                    fontSize: 15,
                    lineHeight: 1,
                    padding: 0,
                    display: "flex",
                    alignItems: "center",
                  }}
                  aria-label={`Remove ${w.ticker}`}
                >
                  ×
                </button>
              </div>
            ))}

            {/* Inline add */}
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <input
                value={input}
                onChange={(e) => { setInput(e.target.value.toUpperCase().slice(0, 5)); setError(""); }}
                onKeyDown={(e) => e.key === "Enter" && addTicker()}
                placeholder="TICKER"
                style={{
                  width: 62,
                  padding: "4px 8px",
                  borderRadius: 6,
                  background: "var(--elevated)",
                  border: `1px solid ${error ? "var(--bear)" : "var(--line)"}`,
                  color: "var(--ink)",
                  fontSize: 11,
                  fontFamily: "var(--font-jb)",
                  fontWeight: 600,
                  outline: "none",
                  letterSpacing: "0.04em",
                }}
              />
              {input && (
                <button
                  onClick={addTicker}
                  style={{
                    padding: "4px 10px",
                    borderRadius: 6,
                    background: "var(--brand)",
                    border: "none",
                    color: "#fff",
                    fontSize: 11,
                    fontFamily: "var(--font-jb)",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  Add
                </button>
              )}
            </div>
          </div>
          {error && (
            <div style={{ color: "var(--bear)", fontSize: 11, fontFamily: "var(--font-jb)", marginBottom: 10 }}>
              {error}
            </div>
          )}

          {/* Per-stock scan frequency */}
          <div style={{
            fontSize: 9,
            fontFamily: "var(--font-jb)",
            color: "var(--ghost)",
            letterSpacing: "0.1em",
            textTransform: "uppercase" as const,
            marginBottom: 10,
          }}>
            Scan Frequency
          </div>
          <div style={{ display: "flex", flexDirection: "column" as const, gap: 6, marginBottom: 14 }}>
            {watchlist.map((w) => (
              <div
                key={w.ticker}
                style={{
                  display: "flex",
                  alignItems: "center",
                  padding: "9px 12px",
                  borderRadius: 8,
                  background: "var(--elevated)",
                  border: "1px solid var(--line)",
                  gap: 10,
                }}
              >
                {/* Ticker */}
                <span style={{
                  fontSize: 12,
                  fontFamily: "var(--font-jb)",
                  fontWeight: 700,
                  color: "var(--ink)",
                  minWidth: 44,
                }}>
                  {w.ticker}
                </span>

                {/* Schedule pills */}
                <div style={{ display: "flex", gap: 4, flex: 1 }}>
                  {(["1x", "3x", "6x"] as const).map((s) => {
                    const active = w.schedule === s;
                    return (
                      <button
                        key={s}
                        onClick={() => setSchedule(w.ticker, s)}
                        style={{
                          padding: "3px 10px",
                          borderRadius: 5,
                          border: `1px solid ${active ? "var(--brand)" : "var(--line)"}`,
                          background: active ? "var(--brand)" : "transparent",
                          color: active ? "#fff" : "var(--ghost)",
                          fontSize: 10,
                          fontFamily: "var(--font-jb)",
                          fontWeight: active ? 700 : 400,
                          cursor: "pointer",
                          letterSpacing: "0.03em",
                          transition: "all 0.12s ease",
                        }}
                      >
                        {s}
                      </button>
                    );
                  })}
                </div>

                {/* Next scan */}
                <span style={{
                  fontSize: 10,
                  fontFamily: "var(--font-jb)",
                  color: "var(--ghost)",
                  textAlign: "right" as const,
                  whiteSpace: "nowrap" as const,
                  minWidth: 76,
                }}>
                  {getNextScan(w.schedule)}
                </span>
              </div>
            ))}
          </div>

          {/* Scan windows legend */}
          <div style={{
            padding: "10px 12px",
            borderRadius: 8,
            background: "var(--bg)",
            border: "1px solid var(--line)",
          }}>
            <div style={{
              fontSize: 9,
              fontFamily: "var(--font-jb)",
              color: "var(--ghost)",
              letterSpacing: "0.1em",
              textTransform: "uppercase" as const,
              marginBottom: 8,
            }}>
              Scan Windows (US EST)
            </div>
            {([
              ["1×/day",  "16:30"],
              ["3×/day",  "08:30  ·  13:00  ·  16:30"],
              ["6×/day",  "06:30  ·  09:30  ·  12:00  ·  13:30  ·  15:00  ·  16:30"],
            ] as const).map(([freq, times]) => (
              <div key={freq} style={{ display: "flex", gap: 10, marginBottom: 4, alignItems: "baseline" }}>
                <span style={{
                  fontSize: 10,
                  fontFamily: "var(--font-jb)",
                  color: "var(--dim)",
                  minWidth: 46,
                }}>
                  {freq}
                </span>
                <span style={{
                  fontSize: 10,
                  fontFamily: "var(--font-jb)",
                  color: "var(--ghost)",
                  letterSpacing: "0.02em",
                }}>
                  {times}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── LogGroupRow ──────────────────────────────────────────────────────────────

function LogGroupRow({
  group,
  onSignalClick,
}: {
  group: LogGroup;
  onSignalClick: (id: string) => void;
}) {
  const [holdsOpen, setHoldsOpen] = useState(false);

  const actions = group.signals.filter((s) => s.action !== "HOLD");
  const holds   = group.signals.filter((s) => s.action === "HOLD");
  const allHold = actions.length === 0;

  // All-HOLD run — render as a single dim row
  if (allHold) {
    return (
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "8px 4px",
        opacity: 0.4,
        borderBottom: "1px solid var(--line)18",
        marginBottom: 2,
      }}>
        <span style={{ fontSize: 10, fontFamily: "var(--font-jb)", color: "var(--ghost)" }}>
          {group.label}
        </span>
        <span style={{ fontSize: 10, fontFamily: "var(--font-jb)", color: "var(--ghost)" }}>
          {holds.length > 0 ? `${holds.length} HOLDs` : "no data"}
        </span>
      </div>
    );
  }

  return (
    <div style={{ marginBottom: 14 }}>
      {/* Run timestamp header */}
      <div style={{
        fontSize: 9,
        fontFamily: "var(--font-jb)",
        color: "var(--ghost)",
        letterSpacing: "0.08em",
        textTransform: "uppercase" as const,
        marginBottom: 6,
        paddingLeft: 2,
      }}>
        {group.label}
      </div>

      <div style={{
        background: "var(--surface)",
        border: "1px solid var(--line)",
        borderRadius: 10,
        overflow: "hidden",
        boxShadow: "var(--card-shadow)",
      }}>
        {/* BUY / SELL rows */}
        {actions.map((sig, i) => {
          const executed = sig.execution?.executed === true;
          const c = executed ? EXECUTED_COLOR[sig.action] : ACTION_COLOR[sig.action];
          const isLast = i === actions.length - 1 && holds.length === 0;
          return (
            <button
              key={sig.id}
              onClick={() => onSignalClick(sig.id)}
              className="w-full text-left"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "13px 16px",
                background: "transparent",
                border: "none",
                borderBottom: isLast ? "none" : "1px solid var(--line)",
                cursor: "pointer",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                {/* Action badge — solid bg for executed, pastel outline for recommendations */}
                {executed ? (
                  <span style={{
                    padding: "2px 8px",
                    borderRadius: 4,
                    fontSize: 10,
                    fontFamily: "var(--font-jb)",
                    fontWeight: 700,
                    color: "#fff",
                    background: c,
                    letterSpacing: "0.05em",
                    minWidth: 36,
                    textAlign: "center" as const,
                  }}>
                    {sig.action}
                  </span>
                ) : (
                  <span style={{
                    padding: "2px 8px",
                    borderRadius: 4,
                    fontSize: 10,
                    fontFamily: "var(--font-jb)",
                    fontWeight: 700,
                    color: c,
                    background: `${c}15`,
                    border: `1px solid ${c}35`,
                    letterSpacing: "0.05em",
                    minWidth: 36,
                    textAlign: "center" as const,
                  }}>
                    {sig.action}
                  </span>
                )}
                {/* Ticker + trade details */}
                <div>
                  <span style={{
                    fontSize: 15,
                    fontFamily: "var(--font-jb)",
                    fontWeight: 700,
                    color: "var(--ink)",
                    letterSpacing: "0.02em",
                  }}>
                    {sig.ticker}
                  </span>
                  {sig.action !== "HOLD" && sig.shares != null && sig.price != null && (
                    <div style={{
                      fontSize: 10,
                      fontFamily: "var(--font-jb)",
                      color: "var(--ghost)",
                      marginTop: 1,
                    }}>
                      {sig.shares % 1 === 0 ? sig.shares : sig.shares.toFixed(2)} sh @ ${sig.price.toFixed(2)}
                    </div>
                  )}
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                {/* Confidence bar + value */}
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{
                    width: 36,
                    height: 3,
                    borderRadius: 2,
                    background: "var(--line2)",
                    overflow: "hidden",
                  }}>
                    <div style={{
                      width: `${Math.round(sig.confidence * 100)}%`,
                      height: "100%",
                      background: c,
                      borderRadius: 2,
                    }} />
                  </div>
                  <span style={{
                    fontSize: 13,
                    fontFamily: "var(--font-jb)",
                    fontWeight: 700,
                    color: c,
                    minWidth: 30,
                    textAlign: "right" as const,
                  }}>
                    {Math.round(sig.confidence * 100)}%
                  </span>
                </div>
                <span style={{ color: "var(--ghost)", fontSize: 14, lineHeight: 1 }}>›</span>
              </div>
            </button>
          );
        })}

        {/* HOLDs collapsed row */}
        {holds.length > 0 && (
          <>
            <button
              onClick={() => setHoldsOpen(!holdsOpen)}
              className="w-full text-left"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "9px 16px",
                background: holdsOpen ? "var(--elevated)" : "transparent",
                border: "none",
                borderTop: "1px solid var(--line)",
                cursor: "pointer",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{
                  display: "flex",
                  gap: 3,
                }}>
                  {holds.slice(0, 5).map((h) => (
                    <span
                      key={h.id}
                      style={{
                        width: 5,
                        height: 5,
                        borderRadius: "50%",
                        background: "var(--hold)",
                        opacity: 0.5,
                        display: "inline-block",
                      }}
                    />
                  ))}
                </div>
                <span style={{
                  fontSize: 11,
                  fontFamily: "var(--font-jb)",
                  color: "var(--ghost)",
                }}>
                  {holds.length} HOLD{holds.length !== 1 ? "s" : ""}
                </span>
              </div>
              <span style={{
                fontSize: 10,
                fontFamily: "var(--font-jb)",
                color: "var(--ghost)",
                opacity: 0.6,
              }}>
                {holdsOpen ? "▴" : "▾"}
              </span>
            </button>

            {holdsOpen && holds.map((sig) => {
              const c = ACTION_COLOR[sig.action];
              return (
                <button
                  key={sig.id}
                  onClick={() => onSignalClick(sig.id)}
                  className="w-full text-left"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "10px 16px 10px 36px",
                    background: "var(--elevated)",
                    border: "none",
                    borderTop: "1px solid var(--line)",
                    cursor: "pointer",
                    opacity: 0.75,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{
                      padding: "1px 6px",
                      borderRadius: 4,
                      fontSize: 9,
                      fontFamily: "var(--font-jb)",
                      fontWeight: 600,
                      color: c,
                      background: `${c}12`,
                      border: `1px solid ${c}28`,
                      letterSpacing: "0.05em",
                    }}>
                      HOLD
                    </span>
                    <span style={{
                      fontSize: 13,
                      fontFamily: "var(--font-jb)",
                      fontWeight: 600,
                      color: "var(--dim)",
                    }}>
                      {sig.ticker}
                    </span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{
                      fontSize: 12,
                      fontFamily: "var(--font-jb)",
                      color: c,
                      fontWeight: 600,
                    }}>
                      {Math.round(sig.confidence * 100)}%
                    </span>
                    <span style={{ color: "var(--ghost)", fontSize: 12 }}>›</span>
                  </div>
                </button>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}

// ─── AgentTab ─────────────────────────────────────────────────────────────────

export function AgentTab({
  signals,
  loading,
}: {
  signals: Signal[];
  loading: boolean;
}) {
  const router = useRouter();

  const [watchlist, setWatchlist] = useState<WatchlistEntry[]>(DEFAULT_WATCHLIST);
  const initializedRef = useRef(false);

  // Load watchlist from API on mount; fall back to localStorage, then defaults
  useEffect(() => {
    fetchWatchlist().then((remote) => {
      if (remote && remote.length > 0) {
        setWatchlist(remote);
      } else {
        // Try localStorage migration
        try {
          const saved = localStorage.getItem("atlas_watchlist");
          const local = saved ? (JSON.parse(saved) as WatchlistEntry[]) : DEFAULT_WATCHLIST;
          setWatchlist(local);
          // Persist to backend so future loads are from DB
          void saveWatchlist(local);
        } catch {
          setWatchlist(DEFAULT_WATCHLIST);
          void saveWatchlist(DEFAULT_WATCHLIST);
        }
      }
      initializedRef.current = true;
    });
  }, []);

  // Persist any changes back to the API (skip the initial seed)
  useEffect(() => {
    if (!initializedRef.current) return;
    void saveWatchlist(watchlist);
    localStorage.setItem("atlas_watchlist", JSON.stringify(watchlist));
  }, [watchlist]);

  const groups = groupSignals(signals);
  const hasActions = groups.some((g) => g.signals.some((s) => s.action !== "HOLD"));

  return (
    <div className="flex flex-col pb-6">
      <ConfigPanel watchlist={watchlist} onChange={setWatchlist} />

      {/* Logs header */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 12,
      }}>
        <span style={{
          fontSize: 9,
          fontFamily: "var(--font-jb)",
          color: "var(--ghost)",
          letterSpacing: "0.1em",
          textTransform: "uppercase" as const,
        }}>
          Agent Logs
        </span>
        {!loading && groups.length > 0 && (
          <span style={{
            fontSize: 10,
            fontFamily: "var(--font-jb)",
            color: "var(--ghost)",
            opacity: 0.6,
          }}>
            {groups.length} run{groups.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* States */}
      {loading && (
        <div style={{
          color: "var(--ghost)",
          fontSize: 12,
          fontFamily: "var(--font-nunito)",
          padding: "32px 0",
          textAlign: "center",
        }}>
          Loading logs…
        </div>
      )}

      {!loading && groups.length === 0 && (
        <div style={{
          padding: "40px 20px",
          textAlign: "center",
        }}>
          <div style={{
            fontSize: 28,
            marginBottom: 12,
            opacity: 0.3,
          }}>
            ◉
          </div>
          <div style={{
            fontSize: 13,
            fontFamily: "var(--font-nunito)",
            color: "var(--ghost)",
            lineHeight: 1.6,
          }}>
            No runs yet.
            <br />
            The agent will scan your watchlist on the next scheduled window.
          </div>
        </div>
      )}

      {!loading && !hasActions && groups.length > 0 && (
        <div style={{
          padding: "12px 14px",
          borderRadius: 8,
          background: "var(--elevated)",
          border: "1px solid var(--line)",
          marginBottom: 14,
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}>
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--bull)", flexShrink: 0 }} />
          <span style={{ fontSize: 12, fontFamily: "var(--font-nunito)", color: "var(--ghost)" }}>
            All clear — no actionable signals in recent runs
          </span>
        </div>
      )}

      {/* Log groups */}
      {!loading && groups.map((group) => (
        <LogGroupRow
          key={group.key}
          group={group}
          onSignalClick={(id) => router.push(`/dashboard/signal/${id}`)}
        />
      ))}
    </div>
  );
}
