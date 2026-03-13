"use client";

import { useState } from "react";
import Link from "next/link";

// ─── Mock data (Phase 3: replace with /v1/pipeline/run) ─────────────────────

const PORTFOLIO = {
  total_value: 107340.5,
  cash: 42180.0,
  pnl_today: 1240.3,
  pnl_total: 7340.5,
  pct_today: 1.17,
  boundary_mode: "conditional" as const,
};

const POSITIONS = [
  { ticker: "AAPL", shares: 50, avg_cost: 172.4,  current_price: 255.76, pnl: 4168.0,  pnl_pct: 48.4 },
  { ticker: "NVDA", shares: 20, avg_cost: 820.0,  current_price: 882.5,  pnl: 1250.0,  pnl_pct: 7.6  },
];

const SIGNALS = [
  {
    id: "sig-001",
    ticker: "AAPL",
    action: "BUY" as const,
    confidence: 0.78,
    reasoning: "Strong momentum with RSI divergence on weekly timeframe. Earnings beat last quarter. Volume confirms breakout above key resistance.",
    boundary_mode: "conditional",
    risk: { stop_loss: 248.20, take_profit: 268.50, position_size: 45, risk_reward_ratio: 2.1 },
    created_at: "2026-03-13T09:00:00Z",
    status: "pending_approval",
  },
  {
    id: "sig-002",
    ticker: "MSFT",
    action: "HOLD" as const,
    confidence: 0.62,
    reasoning: "Consolidating at key support zone. Await volume confirmation before adding.",
    boundary_mode: "conditional",
    risk: { stop_loss: 398.0, take_profit: 435.0, position_size: 0, risk_reward_ratio: 2.0 },
    created_at: "2026-03-12T14:30:00Z",
    status: "noted",
  },
  {
    id: "sig-003",
    ticker: "NVDA",
    action: "SELL" as const,
    confidence: 0.71,
    reasoning: "Extended valuation relative to sector. Bearish RSI divergence on daily chart. Risk/reward unfavourable at current levels.",
    boundary_mode: "advisory",
    risk: { stop_loss: 900.0, take_profit: 840.0, position_size: 20, risk_reward_ratio: 2.0 },
    created_at: "2026-03-11T11:00:00Z",
    status: "noted",
  },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

const ACTION_STYLE: Record<string, { color: string; bg: string; glow: string }> = {
  BUY:  { color: "#00C896", bg: "rgba(0,200,150,0.12)",  glow: "signal-glow-bull" },
  SELL: { color: "#FF2D55", bg: "rgba(255,45,85,0.12)",  glow: "signal-glow-bear" },
  HOLD: { color: "#F5A623", bg: "rgba(245,166,35,0.12)", glow: "signal-glow-hold" },
};

type Tab = "overview" | "signals" | "positions" | "settings";

// ─── Components ──────────────────────────────────────────────────────────────

function ConfBar({ value, color }: { value: number; color: string }) {
  return (
    <div className="conf-bar-track" style={{ width: "100%" }}>
      <div className="conf-bar-fill" style={{ width: `${value * 100}%`, background: color }} />
    </div>
  );
}

function ModeBadge({ mode }: { mode: string }) {
  const colors: Record<string, string> = {
    advisory:    "#7A8FA0",
    conditional: "#F5A623",
    autonomous:  "#00C896",
  };
  return (
    <span
      style={{
        fontSize: 10,
        fontFamily: "var(--font-jb)",
        color: colors[mode] ?? "#7A8FA0",
        border: `1px solid ${colors[mode] ?? "#1C2B3A"}40`,
        padding: "2px 8px",
        borderRadius: 4,
        textTransform: "uppercase",
        letterSpacing: "0.05em",
      }}
    >
      {mode}
    </span>
  );
}

function SignalCard({
  signal,
  isPrimary,
}: {
  signal: typeof SIGNALS[0];
  isPrimary?: boolean;
}) {
  const [approved, setApproved] = useState<boolean | null>(null);
  const s = ACTION_STYLE[signal.action];
  const pending = signal.status === "pending_approval" && approved === null;
  const boundaryIsConditional = signal.boundary_mode === "conditional";

  return (
    <div
      className={isPrimary ? s.glow : ""}
      style={{
        background: "#111820",
        border: `1px solid ${s.color}40`,
        borderRadius: 12,
        overflow: "hidden",
      }}
    >
      {/* Top bar — action color stripe */}
      <div style={{ height: 3, background: s.color, opacity: 0.8 }} />

      <div style={{ padding: "16px 18px" }}>
        {/* Header row */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2.5">
            {isPrimary && <span className="live-dot-red" />}
            <span
              className="font-display font-bold"
              style={{ fontSize: 22, color: "#E8EDF3", letterSpacing: "-0.02em" }}
            >
              {signal.ticker}
            </span>
            <ModeBadge mode={signal.boundary_mode} />
          </div>
          <div
            className="font-display font-bold"
            style={{ fontSize: 22, color: s.color }}
          >
            {signal.action}
          </div>
        </div>

        {/* Confidence */}
        <div className="flex items-center gap-3 mb-3">
          <ConfBar value={signal.confidence} color={s.color} />
          <span
            className="num"
            style={{ fontSize: 12, color: s.color, whiteSpace: "nowrap" }}
          >
            {Math.round(signal.confidence * 100)}%
          </span>
        </div>

        {/* Reasoning */}
        <p
          style={{
            color: "#7A8FA0",
            fontSize: 13,
            fontFamily: "var(--font-nunito)",
            lineHeight: 1.6,
            marginBottom: 14,
          }}
        >
          {signal.reasoning}
        </p>

        {/* Risk parameters */}
        {signal.action !== "HOLD" && (
          <div
            className="grid grid-cols-3 gap-2 mb-4"
            style={{
              background: "#0C1016",
              border: "1px solid #1C2B3A",
              borderRadius: 8,
              padding: "10px 12px",
            }}
          >
            {[
              { label: "Stop",     value: `$${signal.risk.stop_loss}` },
              { label: "Target",   value: `$${signal.risk.take_profit}` },
              { label: "R/R",      value: `${signal.risk.risk_reward_ratio}:1` },
            ].map((r) => (
              <div key={r.label} className="text-center">
                <div style={{ color: "#3D5060", fontSize: 10, fontFamily: "var(--font-jb)", marginBottom: 2 }}>
                  {r.label}
                </div>
                <div className="num" style={{ color: "#E8EDF3", fontSize: 13, fontWeight: 600 }}>
                  {r.value}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Action buttons — conditional mode only */}
        {boundaryIsConditional && pending && (
          <div className="flex gap-2 mt-2">
            <button
              onClick={() => setApproved(true)}
              className="flex-1 font-semibold py-3 rounded transition-all"
              style={{
                background: s.color,
                color: "#fff",
                fontSize: 14,
                fontFamily: "var(--font-nunito)",
                border: "none",
                cursor: "pointer",
              }}
            >
              ✓ Approve
            </button>
            <button
              onClick={() => setApproved(false)}
              className="font-semibold px-5 py-3 rounded transition-colors"
              style={{
                background: "transparent",
                border: "1px solid #FF2D5540",
                color: "#FF2D55",
                fontSize: 14,
                fontFamily: "var(--font-nunito)",
                cursor: "pointer",
              }}
            >
              ✗
            </button>
          </div>
        )}

        {/* Post-decision state */}
        {boundaryIsConditional && approved !== null && (
          <div
            className="text-center py-3 rounded font-semibold text-sm"
            style={{
              background: approved ? "rgba(0,200,150,0.1)" : "rgba(255,45,85,0.1)",
              color: approved ? "#00C896" : "#FF2D55",
              border: `1px solid ${approved ? "rgba(0,200,150,0.25)" : "rgba(255,45,85,0.25)"}`,
              fontFamily: "var(--font-nunito)",
            }}
          >
            {approved ? "Trade approved — queued for execution" : "Signal rejected"}
          </div>
        )}

        {/* Timestamp */}
        <div style={{ marginTop: 10, color: "#3D5060", fontSize: 11, fontFamily: "var(--font-jb)" }}>
          {relTime(signal.created_at)}
        </div>
      </div>
    </div>
  );
}

// ─── Tab: Overview ────────────────────────────────────────────────────────────

function OverviewTab() {
  const primary = SIGNALS[0];

  return (
    <div className="flex flex-col gap-4 pb-6">
      {/* Portfolio value card */}
      <div
        style={{
          background: "#111820",
          border: "1px solid #1C2B3A",
          borderRadius: 12,
          padding: "20px 20px 16px",
        }}
      >
        <div style={{ color: "#3D5060", fontSize: 11, fontFamily: "var(--font-jb)", marginBottom: 6 }}>
          PORTFOLIO VALUE
        </div>
        <div
          className="num font-display font-bold"
          style={{ fontSize: 38, color: "#E8EDF3", letterSpacing: "-0.03em", lineHeight: 1 }}
        >
          {fmt(PORTFOLIO.total_value)}
        </div>
        <div className="flex items-center gap-3 mt-2">
          <span className="num" style={{ fontSize: 14, color: "#00C896", fontWeight: 600 }}>
            +{fmt(PORTFOLIO.pnl_today)} today
          </span>
          <span
            className="num"
            style={{
              fontSize: 11,
              color: "#00C896",
              background: "rgba(0,200,150,0.1)",
              padding: "2px 7px",
              borderRadius: 4,
            }}
          >
            +{PORTFOLIO.pct_today}%
          </span>
        </div>
        <div className="grid grid-cols-2 gap-3 mt-4 pt-4" style={{ borderTop: "1px solid #1C2B3A" }}>
          <div>
            <div style={{ color: "#3D5060", fontSize: 11, fontFamily: "var(--font-jb)", marginBottom: 3 }}>CASH</div>
            <div className="num" style={{ color: "#7A8FA0", fontSize: 16, fontWeight: 600 }}>{fmt(PORTFOLIO.cash)}</div>
          </div>
          <div>
            <div style={{ color: "#3D5060", fontSize: 11, fontFamily: "var(--font-jb)", marginBottom: 3 }}>TOTAL P&L</div>
            <div className="num" style={{ color: "#00C896", fontSize: 16, fontWeight: 600 }}>+{fmt(PORTFOLIO.pnl_total)}</div>
          </div>
        </div>
      </div>

      {/* Latest signal */}
      <div>
        <div
          className="flex items-center gap-2 mb-3"
          style={{ color: "#3D5060", fontSize: 11, fontFamily: "var(--font-jb)" }}
        >
          <span className="live-dot-red" />
          LATEST SIGNAL
        </div>
        <SignalCard signal={primary} isPrimary />
      </div>

      {/* Quick positions */}
      <div>
        <div style={{ color: "#3D5060", fontSize: 11, fontFamily: "var(--font-jb)", marginBottom: 12 }}>POSITIONS</div>
        <div className="flex flex-col gap-2">
          {POSITIONS.map((pos) => (
            <div
              key={pos.ticker}
              className="flex items-center justify-between"
              style={{
                background: "#111820",
                border: "1px solid #1C2B3A",
                borderRadius: 8,
                padding: "12px 14px",
              }}
            >
              <div>
                <span className="font-display font-bold" style={{ color: "#E8EDF3", fontSize: 16 }}>{pos.ticker}</span>
                <span className="num" style={{ color: "#3D5060", fontSize: 12, marginLeft: 8 }}>{pos.shares} shares</span>
              </div>
              <div className="text-right">
                <div className="num" style={{ color: "#E8EDF3", fontSize: 14, fontWeight: 600 }}>{fmt(pos.current_price)}</div>
                <div className="num" style={{ color: "#00C896", fontSize: 12 }}>+{fmt(pos.pnl)}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Tab: Signals ─────────────────────────────────────────────────────────────

function SignalsTab() {
  return (
    <div className="flex flex-col gap-3 pb-6">
      <div style={{ color: "#3D5060", fontSize: 11, fontFamily: "var(--font-jb)", marginBottom: 4 }}>
        ALL SIGNALS — LAST 7 DAYS
      </div>
      {SIGNALS.map((sig) => (
        <SignalCard key={sig.id} signal={sig} />
      ))}
    </div>
  );
}

// ─── Tab: Positions ──────────────────────────────────────────────────────────

function PositionsTab() {
  return (
    <div className="flex flex-col gap-3 pb-6">
      <div style={{ color: "#3D5060", fontSize: 11, fontFamily: "var(--font-jb)", marginBottom: 4 }}>OPEN POSITIONS</div>
      {POSITIONS.map((pos) => {
        const pnl_pct = ((pos.current_price - pos.avg_cost) / pos.avg_cost) * 100;
        return (
          <div
            key={pos.ticker}
            style={{
              background: "#111820",
              border: "1px solid #1C2B3A",
              borderRadius: 10,
              padding: "16px 18px",
            }}
          >
            <div className="flex items-center justify-between mb-3">
              <span className="font-display font-bold" style={{ fontSize: 20, color: "#E8EDF3" }}>{pos.ticker}</span>
              <span className="num" style={{ color: "#00C896", fontSize: 16, fontWeight: 700 }}>+{fmt(pos.pnl)}</span>
            </div>
            <div className="grid grid-cols-3 gap-3 text-center">
              {[
                { label: "SHARES",  value: String(pos.shares) },
                { label: "AVG COST", value: fmt(pos.avg_cost) },
                { label: "CURRENT",  value: fmt(pos.current_price) },
              ].map((r) => (
                <div key={r.label}>
                  <div style={{ color: "#3D5060", fontSize: 10, fontFamily: "var(--font-jb)", marginBottom: 3 }}>{r.label}</div>
                  <div className="num" style={{ color: "#7A8FA0", fontSize: 14 }}>{r.value}</div>
                </div>
              ))}
            </div>
            <div className="mt-3 pt-3" style={{ borderTop: "1px solid #1C2B3A" }}>
              <div className="flex items-center justify-between mb-1">
                <span style={{ color: "#3D5060", fontSize: 10, fontFamily: "var(--font-jb)" }}>RETURN</span>
                <span className="num" style={{ color: "#00C896", fontSize: 12, fontWeight: 600 }}>+{pnl_pct.toFixed(1)}%</span>
              </div>
              <ConfBar value={Math.min(pnl_pct / 100, 1)} color="#00C896" />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Tab: Settings ────────────────────────────────────────────────────────────

function SettingsTab() {
  const [mode, setMode] = useState<"advisory" | "conditional" | "autonomous">("conditional");
  const modes = [
    { id: "advisory",    label: "Advisory",    color: "#7A8FA0", desc: "AI signals only. You execute." },
    { id: "conditional", label: "Conditional", color: "#F5A623", desc: "Approve each trade." },
    { id: "autonomous",  label: "Autonomous",  color: "#00C896", desc: "AI executes. Override window." },
  ] as const;

  return (
    <div className="flex flex-col gap-4 pb-6">
      <div style={{ color: "#3D5060", fontSize: 11, fontFamily: "var(--font-jb)", marginBottom: 4 }}>EXECUTION MODE</div>
      {modes.map((m) => (
        <button
          key={m.id}
          onClick={() => setMode(m.id)}
          className="text-left"
          style={{
            background: mode === m.id ? `${m.color}12` : "#111820",
            border: `1px solid ${mode === m.id ? `${m.color}50` : "#1C2B3A"}`,
            borderRadius: 10,
            padding: "16px 18px",
            cursor: "pointer",
            transition: "all 0.2s ease",
          }}
        >
          <div className="flex items-center justify-between mb-1">
            <span
              className="font-display font-bold"
              style={{ fontSize: 16, color: mode === m.id ? m.color : "#7A8FA0" }}
            >
              {m.label}
            </span>
            {mode === m.id && (
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: m.color }} />
            )}
          </div>
          <p style={{ color: "#3D5060", fontSize: 13, fontFamily: "var(--font-nunito)" }}>{m.desc}</p>
        </button>
      ))}

      <div
        style={{
          background: "#111820",
          border: "1px solid #1C2B3A",
          borderRadius: 10,
          padding: "16px 18px",
          marginTop: 8,
        }}
      >
        <div style={{ color: "#3D5060", fontSize: 11, fontFamily: "var(--font-jb)", marginBottom: 10 }}>ABOUT</div>
        <div className="flex flex-col gap-2">
          {[
            ["Engine",  "Gemini 2.5 Flash"],
            ["Data",    "yfinance · 90d OHLCV"],
            ["Market",  "US Equities"],
            ["Style",   "Swing Trading"],
            ["Version", "0.1.0 · Phase 2"],
          ].map(([k, v]) => (
            <div key={k} className="flex items-center justify-between">
              <span style={{ color: "#3D5060", fontSize: 12, fontFamily: "var(--font-jb)" }}>{k}</span>
              <span style={{ color: "#7A8FA0", fontSize: 12, fontFamily: "var(--font-jb)" }}>{v}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "overview",   label: "Overview",   icon: "◈" },
  { id: "signals",    label: "Signals",    icon: "◎" },
  { id: "positions",  label: "Positions",  icon: "▤" },
  { id: "settings",   label: "Settings",   icon: "⊙" },
];

export default function UserDashboard() {
  const [tab, setTab] = useState<Tab>("overview");
  const primarySignal = SIGNALS[0];
  const modeColor: Record<string, string> = {
    advisory: "#7A8FA0",
    conditional: "#F5A623",
    autonomous: "#00C896",
  };

  return (
    <div
      className="flex flex-col min-h-screen"
      style={{ background: "#07080B", maxWidth: 520, margin: "0 auto" }}
    >
      {/* ── Top header ── */}
      <header
        className="sticky top-0 z-20 flex items-center justify-between px-5 py-4"
        style={{
          background: "rgba(7,8,11,0.92)",
          backdropFilter: "blur(12px)",
          borderBottom: "1px solid #1C2B3A",
        }}
      >
        <div className="flex items-center gap-2.5">
          <div className="relative flex items-center justify-center" style={{ width: 22, height: 22 }}>
            <div
              style={{
                position: "absolute",
                width: 2, height: 18,
                background: "#C8102E",
                transform: "skewX(-14deg) translateX(2px)",
                borderRadius: 1,
              }}
            />
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#C8102E", position: "relative", zIndex: 1, marginLeft: 3 }} />
          </div>
          <span
            className="font-display font-bold"
            style={{ fontSize: 17, color: "#E8EDF3", letterSpacing: "-0.02em" }}
          >
            ATLAS
          </span>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="live-dot" />
            <span style={{ color: "#3D5060", fontSize: 11, fontFamily: "var(--font-jb)" }}>live</span>
          </div>
          <span
            style={{
              fontSize: 10,
              fontFamily: "var(--font-jb)",
              color: modeColor[PORTFOLIO.boundary_mode],
              border: `1px solid ${modeColor[PORTFOLIO.boundary_mode]}40`,
              padding: "2px 8px",
              borderRadius: 4,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          >
            {PORTFOLIO.boundary_mode}
          </span>
        </div>
      </header>

      {/* ── Action banner — conditional mode pending ── */}
      {PORTFOLIO.boundary_mode === "conditional" && (
        <div
          className="mx-4 mt-3 rounded-lg px-4 py-2.5 flex items-center justify-between"
          style={{ background: "rgba(245,166,35,0.08)", border: "1px solid rgba(245,166,35,0.2)" }}
        >
          <div className="flex items-center gap-2">
            <span style={{ color: "#F5A623", fontSize: 13, fontFamily: "var(--font-jb)" }}>!</span>
            <span style={{ color: "#F5A623", fontSize: 12, fontFamily: "var(--font-nunito)" }}>
              {primarySignal.ticker} signal awaiting your approval
            </span>
          </div>
          <button
            onClick={() => setTab("signals")}
            style={{
              color: "#F5A623",
              fontSize: 11,
              fontFamily: "var(--font-jb)",
              background: "transparent",
              border: "none",
              cursor: "pointer",
              textDecoration: "underline",
            }}
          >
            Review →
          </button>
        </div>
      )}

      {/* ── Scrollable content ── */}
      <main className="flex-1 px-4 pt-4 overflow-y-auto">
        {tab === "overview"  && <OverviewTab />}
        {tab === "signals"   && <SignalsTab />}
        {tab === "positions" && <PositionsTab />}
        {tab === "settings"  && <SettingsTab />}
      </main>

      {/* ── Bottom nav ── */}
      <nav
        className="sticky bottom-0 z-20 grid grid-cols-4"
        style={{
          background: "rgba(7,8,11,0.95)",
          backdropFilter: "blur(12px)",
          borderTop: "1px solid #1C2B3A",
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
        }}
      >
        {TABS.map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className="flex flex-col items-center justify-center gap-1 py-3 transition-colors"
              style={{
                background: "transparent",
                border: "none",
                cursor: "pointer",
                color: active ? "#C8102E" : "#3D5060",
              }}
            >
              <span style={{ fontSize: 16 }}>{t.icon}</span>
              <span
                style={{
                  fontSize: 10,
                  fontFamily: "var(--font-jb)",
                  letterSpacing: "0.03em",
                  color: active ? "#C8102E" : "#3D5060",
                  fontWeight: active ? 600 : 400,
                }}
              >
                {t.label}
              </span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
