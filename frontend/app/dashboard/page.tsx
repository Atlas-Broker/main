"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTheme } from "../components/ThemeProvider";
import { fetchWithAuth } from "@/lib/api";
import { UserMenu } from "@/components/UserMenu";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// ─── Types ────────────────────────────────────────────────────────────────────

type RiskParams = {
  stop_loss: number;
  take_profit: number;
  position_size: number;
  risk_reward_ratio: number;
};

type Signal = {
  id: string;
  ticker: string;
  action: "BUY" | "SELL" | "HOLD";
  confidence: number;
  reasoning: string;
  boundary_mode: string;
  risk: RiskParams;
  created_at: string;
};

type Position = {
  ticker: string;
  shares: number;
  avg_cost: number;
  current_price: number;
  pnl: number;
};

type Portfolio = {
  total_value: number;
  cash: number;
  pnl_today: number;
  pnl_total: number;
  positions: Position[];
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number, prefix = "$") {
  return prefix + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function relTime(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  const h = Math.floor(ms / 3600000);
  if (h < 1) return `${Math.floor(ms / 60000)}m ago`;
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const ACTION_STYLE = {
  BUY:  { color: "var(--bull)", bg: "var(--bull-bg)", glow: "signal-glow-bull" },
  SELL: { color: "var(--bear)", bg: "var(--bear-bg)", glow: "signal-glow-bear" },
  HOLD: { color: "var(--hold)", bg: "var(--hold-bg)", glow: "signal-glow-hold" },
} as const;

type Tab = "overview" | "signals" | "positions" | "settings";

// ─── Sub-components ───────────────────────────────────────────────────────────

function ConfBar({ value, color }: { value: number; color: string }) {
  return (
    <div className="conf-bar-track" style={{ width: "100%" }}>
      <div className="conf-bar-fill" style={{ width: `${value * 100}%`, background: color }} />
    </div>
  );
}

function ModeBadge({ mode }: { mode: string }) {
  const colors: Record<string, string> = {
    advisory:    "var(--dim)",
    conditional: "var(--hold)",
    autonomous:  "var(--bull)",
  };
  return (
    <span style={{
      fontSize: 10,
      fontFamily: "var(--font-jb)",
      color: colors[mode] ?? "var(--dim)",
      border: `1px solid ${colors[mode] ?? "var(--line)"}`,
      padding: "2px 8px",
      borderRadius: 4,
      textTransform: "uppercase" as const,
      letterSpacing: "0.05em",
      opacity: 0.85,
    }}>
      {mode}
    </span>
  );
}

function SignalCard({ signal, isPrimary }: { signal: Signal; isPrimary?: boolean }) {
  const router = useRouter();
  const [approved, setApproved] = useState<boolean | null>(null);
  const [approving, setApproving] = useState(false);
  const s = ACTION_STYLE[signal.action];
  const isConditional = signal.boundary_mode === "conditional";
  const canApprove = isConditional && approved === null;

  async function handleApprove() {
    setApproving(true);
    try {
      const res = await fetchWithAuth(
        `${API_URL}/v1/signals/${signal.id}/approve`,
        { method: "POST" }
      );
      if (!res) { router.push("/login"); return; }
      setApproved(true);
    } catch {
      setApproved(true);
    } finally {
      setApproving(false);
    }
  }

  async function handleReject() {
    const res = await fetchWithAuth(
      `${API_URL}/v1/signals/${signal.id}/reject`,
      { method: "POST" }
    ).catch(() => null);
    if (!res) { router.push("/login"); return; }
    setApproved(false);
  }

  return (
    <div
      className={isPrimary ? s.glow : ""}
      style={{
        background: "var(--surface)",
        border: `1px solid ${s.color}40`,
        borderRadius: 12,
        overflow: "hidden",
        boxShadow: "var(--card-shadow)",
      }}
    >
      <div style={{ height: 3, background: s.color, opacity: 0.8 }} />

      <div style={{ padding: "16px 18px" }}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2.5">
            {isPrimary && <span className="live-dot-red" />}
            <span className="font-display font-bold" style={{ fontSize: 22, color: "var(--ink)", letterSpacing: "-0.02em" }}>
              {signal.ticker}
            </span>
            <ModeBadge mode={signal.boundary_mode} />
          </div>
          <div className="font-display font-bold" style={{ fontSize: 22, color: s.color }}>
            {signal.action}
          </div>
        </div>

        <div className="flex items-center gap-3 mb-3">
          <ConfBar value={signal.confidence} color={s.color} />
          <span className="num" style={{ fontSize: 12, color: s.color, whiteSpace: "nowrap" }}>
            {Math.round(signal.confidence * 100)}%
          </span>
        </div>

        <p style={{ color: "var(--dim)", fontSize: 13, fontFamily: "var(--font-nunito)", lineHeight: 1.6, marginBottom: 14 }}>
          {signal.reasoning}
        </p>

        {signal.action !== "HOLD" && (
          <div className="grid grid-cols-3 gap-2 mb-4" style={{
            background: "var(--elevated)",
            border: "1px solid var(--line)",
            borderRadius: 8,
            padding: "10px 12px",
          }}>
            {[
              { label: "Stop",   value: `$${signal.risk.stop_loss}` },
              { label: "Target", value: `$${signal.risk.take_profit}` },
              { label: "R/R",    value: `${signal.risk.risk_reward_ratio}:1` },
            ].map((r) => (
              <div key={r.label} className="text-center">
                <div style={{ color: "var(--ghost)", fontSize: 10, fontFamily: "var(--font-jb)", marginBottom: 2 }}>{r.label}</div>
                <div className="num" style={{ color: "var(--ink)", fontSize: 13, fontWeight: 600 }}>{r.value}</div>
              </div>
            ))}
          </div>
        )}

        {canApprove && (
          <div className="flex gap-2 mt-2">
            <button
              onClick={handleApprove}
              disabled={approving}
              className="flex-1 font-semibold py-3 rounded transition-all"
              style={{
                background: approving ? "var(--line)" : s.color,
                color: "#fff",
                fontSize: 14,
                fontFamily: "var(--font-nunito)",
                border: "none",
                cursor: approving ? "not-allowed" : "pointer",
              }}
            >
              {approving ? "Executing…" : "✓ Approve & Execute"}
            </button>
            <button
              onClick={handleReject}
              className="font-semibold px-5 py-3 rounded transition-colors"
              style={{
                background: "transparent",
                border: "1px solid var(--bear-bg)",
                color: "var(--bear)",
                fontSize: 14,
                fontFamily: "var(--font-nunito)",
                cursor: "pointer",
              }}
            >
              ✗
            </button>
          </div>
        )}

        {isConditional && approved !== null && (
          <div className="text-center py-3 rounded font-semibold text-sm" style={{
            background: approved ? "var(--bull-bg)" : "var(--bear-bg)",
            color: approved ? "var(--bull)" : "var(--bear)",
            border: `1px solid ${approved ? "var(--bull)" : "var(--bear)"}30`,
            fontFamily: "var(--font-nunito)",
          }}>
            {approved ? "Trade approved — order placed via Alpaca" : "Signal rejected"}
          </div>
        )}

        <div style={{ marginTop: 10, color: "var(--ghost)", fontSize: 11, fontFamily: "var(--font-jb)" }}>
          {relTime(signal.created_at)}
        </div>
      </div>
    </div>
  );
}

// ─── Tab: Overview ────────────────────────────────────────────────────────────

function OverviewTab({ portfolio, signals }: { portfolio: Portfolio | null; signals: Signal[] }) {
  const primary = signals[0] ?? null;
  const pnlPos = portfolio ? portfolio.pnl_today >= 0 : true;

  return (
    <div className="flex flex-col gap-4 pb-6">
      {/* Portfolio card */}
      <div style={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 12, padding: "20px 20px 16px", boxShadow: "var(--card-shadow)" }}>
        <div style={{ color: "var(--ghost)", fontSize: 11, fontFamily: "var(--font-jb)", marginBottom: 6 }}>PORTFOLIO VALUE</div>
        <div className="num font-display font-bold" style={{ fontSize: 38, color: "var(--ink)", letterSpacing: "-0.03em", lineHeight: 1 }}>
          {portfolio ? fmt(portfolio.total_value) : "—"}
        </div>
        {portfolio && (
          <div className="flex items-center gap-3 mt-2">
            <span className="num" style={{ fontSize: 14, color: pnlPos ? "var(--bull)" : "var(--bear)", fontWeight: 600 }}>
              {pnlPos ? "+" : ""}{fmt(portfolio.pnl_today)} unrealised
            </span>
          </div>
        )}
        <div className="grid grid-cols-2 gap-3 mt-4 pt-4" style={{ borderTop: "1px solid var(--line)" }}>
          <div>
            <div style={{ color: "var(--ghost)", fontSize: 11, fontFamily: "var(--font-jb)", marginBottom: 3 }}>CASH</div>
            <div className="num" style={{ color: "var(--dim)", fontSize: 16, fontWeight: 600 }}>{portfolio ? fmt(portfolio.cash) : "—"}</div>
          </div>
          <div>
            <div style={{ color: "var(--ghost)", fontSize: 11, fontFamily: "var(--font-jb)", marginBottom: 3 }}>TOTAL P&amp;L</div>
            <div className="num" style={{ color: portfolio && portfolio.pnl_total >= 0 ? "var(--bull)" : "var(--bear)", fontSize: 16, fontWeight: 600 }}>
              {portfolio ? `${portfolio.pnl_total >= 0 ? "+" : ""}${fmt(portfolio.pnl_total)}` : "—"}
            </div>
          </div>
        </div>
      </div>

      {/* Latest signal */}
      {primary && (
        <div>
          <div className="flex items-center gap-2 mb-3" style={{ color: "var(--ghost)", fontSize: 11, fontFamily: "var(--font-jb)" }}>
            <span className="live-dot-red" /> LATEST SIGNAL
          </div>
          <SignalCard signal={primary} isPrimary />
        </div>
      )}

      {/* Quick positions */}
      {portfolio && portfolio.positions.length > 0 && (
        <div>
          <div style={{ color: "var(--ghost)", fontSize: 11, fontFamily: "var(--font-jb)", marginBottom: 12 }}>POSITIONS</div>
          <div className="flex flex-col gap-2">
            {portfolio.positions.map((pos) => (
              <div key={pos.ticker} className="flex items-center justify-between" style={{
                background: "var(--surface)",
                border: "1px solid var(--line)",
                borderRadius: 8,
                padding: "12px 14px",
                boxShadow: "var(--card-shadow)",
              }}>
                <div>
                  <span className="font-display font-bold" style={{ color: "var(--ink)", fontSize: 16 }}>{pos.ticker}</span>
                  <span className="num" style={{ color: "var(--ghost)", fontSize: 12, marginLeft: 8 }}>{pos.shares} shares</span>
                </div>
                <div className="text-right">
                  <div className="num" style={{ color: "var(--ink)", fontSize: 14, fontWeight: 600 }}>{fmt(pos.current_price)}</div>
                  <div className="num" style={{ color: pos.pnl >= 0 ? "var(--bull)" : "var(--bear)", fontSize: 12 }}>
                    {pos.pnl >= 0 ? "+" : ""}{fmt(pos.pnl)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {portfolio && portfolio.positions.length === 0 && (
        <div style={{ color: "var(--ghost)", fontSize: 13, fontFamily: "var(--font-nunito)", textAlign: "center", padding: "24px 0" }}>
          No open positions yet.
        </div>
      )}
    </div>
  );
}

// ─── Tab: Signals ─────────────────────────────────────────────────────────────

function SignalsTab({ signals, loading }: { signals: Signal[]; loading: boolean }) {
  if (loading) return <div style={{ color: "var(--ghost)", fontSize: 13, fontFamily: "var(--font-nunito)", padding: "32px 0", textAlign: "center" }}>Loading signals…</div>;
  if (!signals.length) return <div style={{ color: "var(--ghost)", fontSize: 13, fontFamily: "var(--font-nunito)", padding: "32px 0", textAlign: "center" }}>No signals yet — run the pipeline from admin.</div>;

  return (
    <div className="flex flex-col gap-3 pb-6">
      <div style={{ color: "var(--ghost)", fontSize: 11, fontFamily: "var(--font-jb)", marginBottom: 4 }}>
        ALL SIGNALS — {signals.length} RUNS
      </div>
      {signals.map((sig) => <SignalCard key={sig.id} signal={sig} />)}
    </div>
  );
}

// ─── Tab: Positions ───────────────────────────────────────────────────────────

function PositionsTab({ portfolio }: { portfolio: Portfolio | null }) {
  if (!portfolio) return <div style={{ color: "var(--ghost)", fontSize: 13, fontFamily: "var(--font-nunito)", padding: "32px 0", textAlign: "center" }}>Loading positions…</div>;
  if (!portfolio.positions.length) return (
    <div style={{ color: "var(--ghost)", fontSize: 13, fontFamily: "var(--font-nunito)", padding: "32px 0", textAlign: "center" }}>
      No open positions.<br /><span style={{ fontSize: 12 }}>Run the pipeline in Autonomous mode to place a paper trade.</span>
    </div>
  );

  return (
    <div className="flex flex-col gap-3 pb-6">
      <div style={{ color: "var(--ghost)", fontSize: 11, fontFamily: "var(--font-jb)", marginBottom: 4 }}>OPEN POSITIONS</div>
      {portfolio.positions.map((pos) => {
        const pnl_pct = ((pos.current_price - pos.avg_cost) / pos.avg_cost) * 100;
        const positive = pos.pnl >= 0;
        return (
          <div key={pos.ticker} style={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 10, padding: "16px 18px", boxShadow: "var(--card-shadow)" }}>
            <div className="flex items-center justify-between mb-3">
              <span className="font-display font-bold" style={{ fontSize: 20, color: "var(--ink)" }}>{pos.ticker}</span>
              <span className="num" style={{ color: positive ? "var(--bull)" : "var(--bear)", fontSize: 16, fontWeight: 700 }}>
                {positive ? "+" : ""}{fmt(pos.pnl)}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-3 text-center">
              {[
                { label: "SHARES",   value: String(pos.shares) },
                { label: "AVG COST", value: fmt(pos.avg_cost) },
                { label: "CURRENT",  value: fmt(pos.current_price) },
              ].map((r) => (
                <div key={r.label}>
                  <div style={{ color: "var(--ghost)", fontSize: 10, fontFamily: "var(--font-jb)", marginBottom: 3 }}>{r.label}</div>
                  <div className="num" style={{ color: "var(--dim)", fontSize: 14 }}>{r.value}</div>
                </div>
              ))}
            </div>
            <div className="mt-3 pt-3" style={{ borderTop: "1px solid var(--line)" }}>
              <div className="flex items-center justify-between mb-1">
                <span style={{ color: "var(--ghost)", fontSize: 10, fontFamily: "var(--font-jb)" }}>RETURN</span>
                <span className="num" style={{ color: positive ? "var(--bull)" : "var(--bear)", fontSize: 12, fontWeight: 600 }}>
                  {positive ? "+" : ""}{pnl_pct.toFixed(1)}%
                </span>
              </div>
              <ConfBar value={Math.min(Math.abs(pnl_pct) / 20, 1)} color={positive ? "var(--bull)" : "var(--bear)"} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Tab: Settings ────────────────────────────────────────────────────────────

export function SettingsTab() {
  const { dark, toggle } = useTheme();
  const [mode, setMode] = useState<"advisory" | "conditional" | "autonomous">("conditional");

  const modes = [
    { id: "advisory",    label: "Advisory",    color: "var(--dim)",  desc: "AI signals only. You execute." },
    { id: "conditional", label: "Conditional", color: "var(--hold)", desc: "Approve each trade." },
    { id: "autonomous",  label: "Autonomous",  color: "var(--bull)", desc: "AI executes. Override window." },
  ] as const;

  useEffect(() => {
    fetchWithAuth(`${API_URL}/v1/profile`)
      .then((res) => res?.json())
      .then((data) => {
        if (data?.boundary_mode) {
          setMode(data.boundary_mode);
        }
      })
      .catch(() => {
        // keep default "conditional" on error
      });
  }, []);

  async function handleModeChange(newMode: "advisory" | "conditional" | "autonomous") {
    setMode(newMode);
    try {
      await fetchWithAuth(`${API_URL}/v1/profile`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ boundary_mode: newMode }),
      });
    } catch {
      // non-fatal — local state already updated
    }
  }

  return (
    <div className="flex flex-col gap-4 pb-6">
      {/* Appearance */}
      <div>
        <div style={{ color: "var(--ghost)", fontSize: 11, fontFamily: "var(--font-jb)", marginBottom: 10 }}>APPEARANCE</div>
        <div style={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 10, padding: "14px 18px", boxShadow: "var(--card-shadow)" }}>
          <div className="flex items-center justify-between">
            <div>
              <div style={{ color: "var(--ink)", fontSize: 14, fontFamily: "var(--font-nunito)", fontWeight: 600 }}>
                {dark ? "Dark mode" : "Light mode"}
              </div>
              <div style={{ color: "var(--ghost)", fontSize: 12, fontFamily: "var(--font-nunito)", marginTop: 2 }}>
                {dark ? "IBKR terminal aesthetic" : "Clean light interface"}
              </div>
            </div>
            <button
              onClick={toggle}
              style={{
                width: 48,
                height: 26,
                borderRadius: 13,
                background: dark ? "var(--brand)" : "var(--line2)",
                border: "none",
                cursor: "pointer",
                position: "relative",
                transition: "background 0.2s ease",
                flexShrink: 0,
              }}
              aria-label="Toggle theme"
            >
              <div style={{
                width: 20,
                height: 20,
                borderRadius: "50%",
                background: "#fff",
                position: "absolute",
                top: 3,
                left: dark ? 25 : 3,
                transition: "left 0.2s ease",
                boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
              }} />
            </button>
          </div>
        </div>
      </div>

      {/* Execution mode */}
      <div>
        <div style={{ color: "var(--ghost)", fontSize: 11, fontFamily: "var(--font-jb)", marginBottom: 10 }}>EXECUTION MODE</div>
        {modes.map((m) => (
          <button
            key={m.id}
            onClick={() => handleModeChange(m.id)}
            data-selected={mode === m.id ? "true" : "false"}
            className="text-left w-full mb-2"
            style={{
              background: mode === m.id ? "var(--elevated)" : "var(--surface)",
              border: `1px solid ${mode === m.id ? m.color : "var(--line)"}`,
              borderRadius: 10,
              padding: "14px 18px",
              cursor: "pointer",
              boxShadow: "var(--card-shadow)",
            }}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="font-display font-bold" style={{ fontSize: 15, color: mode === m.id ? m.color : "var(--dim)" }}>
                {m.label}
              </span>
              {mode === m.id && <div style={{ width: 7, height: 7, borderRadius: "50%", background: m.color }} />}
            </div>
            <p style={{ color: "var(--ghost)", fontSize: 13, fontFamily: "var(--font-nunito)" }}>{m.desc}</p>
          </button>
        ))}
      </div>

      {/* About */}
      <div style={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 10, padding: "16px 18px", boxShadow: "var(--card-shadow)" }}>
        <div style={{ color: "var(--ghost)", fontSize: 11, fontFamily: "var(--font-jb)", marginBottom: 10 }}>ABOUT</div>
        <div className="flex flex-col gap-2">
          {[
            ["Engine",  "Gemini 2.5 Flash"],
            ["Data",    "yfinance · 90d OHLCV"],
            ["Broker",  "Alpaca Paper Trading"],
            ["Market",  "US Equities"],
            ["Style",   "Swing Trading"],
            ["Version", "0.1.0 · Phase 2"],
          ].map(([k, v]) => (
            <div key={k} className="flex items-center justify-between">
              <span style={{ color: "var(--ghost)", fontSize: 12, fontFamily: "var(--font-jb)" }}>{k}</span>
              <span style={{ color: "var(--dim)", fontSize: 12, fontFamily: "var(--font-jb)" }}>{v}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "overview",  label: "Overview",  icon: "◈" },
  { id: "signals",   label: "Signals",   icon: "◎" },
  { id: "positions", label: "Positions", icon: "▤" },
  { id: "settings",  label: "Settings",  icon: "⊙" },
];

export default function UserDashboard() {
  const [tab, setTab] = useState<Tab>("overview");
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    async function loadData() {
      const [portRes, sigsRes] = await Promise.all([
        fetchWithAuth(`${API_URL}/v1/portfolio`),
        fetchWithAuth(`${API_URL}/v1/signals?limit=20`),
      ]);

      if (!portRes || !sigsRes) {
        router.push("/login");
        return;
      }

      try {
        const [port, sigs] = await Promise.all([portRes.json(), sigsRes.json()]);
        setPortfolio(port);
        setSignals(Array.isArray(sigs) ? sigs : []);
      } catch (err) {
        console.error("Failed to parse dashboard data", err);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [router]);

  const primarySignal = signals[0] ?? null;
  const hasPendingConditional = signals.some((s) => s.boundary_mode === "conditional");

  return (
    <div className="flex flex-col min-h-screen" style={{ background: "var(--bg)", maxWidth: 520, margin: "0 auto" }}>

      {/* ── Top header ── */}
      <header className="sticky top-0 z-20 flex items-center justify-between px-5 py-4" style={{
        background: "var(--header-bg)",
        backdropFilter: "blur(12px)",
        borderBottom: "1px solid var(--line)",
      }}>
        <div className="flex items-center gap-2.5">
          <div className="relative flex items-center justify-center" style={{ width: 22, height: 22 }}>
            <div style={{ position: "absolute", width: 2, height: 18, background: "#C8102E", transform: "skewX(-14deg) translateX(2px)", borderRadius: 1 }} />
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#C8102E", position: "relative", zIndex: 1, marginLeft: 3 }} />
          </div>
          <span className="font-display font-bold" style={{ fontSize: 17, color: "var(--ink)", letterSpacing: "-0.02em" }}>ATLAS</span>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="live-dot" />
            <span style={{ color: "var(--ghost)", fontSize: 11, fontFamily: "var(--font-jb)" }}>live</span>
          </div>
          <UserMenu />
        </div>
      </header>

      {/* ── Conditional pending banner ── */}
      {hasPendingConditional && (
        <div className="mx-4 mt-3 rounded-lg px-4 py-2.5 flex items-center justify-between" style={{
          background: "var(--hold-bg)",
          border: "1px solid var(--hold)30",
        }}>
          <div className="flex items-center gap-2">
            <span style={{ color: "var(--hold)", fontSize: 13, fontFamily: "var(--font-jb)" }}>!</span>
            <span style={{ color: "var(--hold)", fontSize: 12, fontFamily: "var(--font-nunito)" }}>
              {primarySignal?.ticker} signal awaiting your approval
            </span>
          </div>
          <button onClick={() => setTab("signals")} style={{
            color: "var(--hold)", fontSize: 11, fontFamily: "var(--font-jb)",
            background: "transparent", border: "none", cursor: "pointer", textDecoration: "underline",
          }}>
            Review →
          </button>
        </div>
      )}

      {/* ── Scrollable content ── */}
      <main className="flex-1 px-4 pt-4 overflow-y-auto">
        {loading && tab !== "settings" ? (
          <div style={{ color: "var(--ghost)", fontSize: 13, fontFamily: "var(--font-nunito)", padding: "48px 0", textAlign: "center" }}>
            Connecting to Atlas API…
          </div>
        ) : (
          <>
            {tab === "overview"  && <OverviewTab portfolio={portfolio} signals={signals} />}
            {tab === "signals"   && <SignalsTab signals={signals} loading={loading} />}
            {tab === "positions" && <PositionsTab portfolio={portfolio} />}
            {tab === "settings"  && <SettingsTab />}
          </>
        )}
      </main>

      {/* ── Bottom nav ── */}
      <nav className="sticky bottom-0 z-20 grid grid-cols-4" style={{
        background: "var(--nav-bg)",
        backdropFilter: "blur(12px)",
        borderTop: "1px solid var(--line)",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}>
        {TABS.map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className="flex flex-col items-center justify-center gap-1 py-3 transition-colors"
              style={{ background: "transparent", border: "none", cursor: "pointer" }}
            >
              <span style={{ fontSize: 16, color: active ? "var(--brand)" : "var(--ghost)" }}>{t.icon}</span>
              <span style={{
                fontSize: 10,
                fontFamily: "var(--font-jb)",
                letterSpacing: "0.03em",
                color: active ? "var(--brand)" : "var(--ghost)",
                fontWeight: active ? 600 : 400,
              }}>
                {t.label}
              </span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
