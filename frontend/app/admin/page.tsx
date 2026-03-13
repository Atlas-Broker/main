"use client";

import { useState } from "react";
import Link from "next/link";

// ─── Mock admin data ──────────────────────────────────────────────────────────

const METRICS = [
  { label: "Signals Today",    value: "12",    delta: "+3",   up: true  },
  { label: "Avg Confidence",   value: "74.2%", delta: "+2.1%", up: true },
  { label: "Avg Latency",      value: "48.3s", delta: "-3.1s", up: true },
  { label: "Active Users",     value: "1",     delta: "—",    up: true  },
  { label: "Pipeline Errors",  value: "0",     delta: "clean", up: true },
  { label: "Mongo Traces",     value: "47",    delta: "total", up: true },
];

const PIPELINE_RUNS = [
  {
    id: "69b3b6d5b83b9a53ab79da4f",
    ticker: "AAPL",
    action: "HOLD",
    confidence: 0.75,
    latency_ms: 50300,
    boundary_mode: "advisory",
    status: "completed",
    created_at: "2026-03-13T11:22:00Z",
  },
  {
    id: "5a2c1f9e4d67b38a20e4dc1b",
    ticker: "NVDA",
    action: "SELL",
    confidence: 0.71,
    latency_ms: 43200,
    boundary_mode: "advisory",
    status: "completed",
    created_at: "2026-03-13T10:05:00Z",
  },
  {
    id: "2d8e9b3c7a14f50612d3ae77",
    ticker: "TSLA",
    action: "BUY",
    confidence: 0.68,
    latency_ms: 55100,
    boundary_mode: "conditional",
    status: "pending_approval",
    created_at: "2026-03-13T09:30:00Z",
  },
  {
    id: "1f4c6d8e2b9a7043dc5e1a22",
    ticker: "MSFT",
    action: "HOLD",
    confidence: 0.62,
    latency_ms: 41800,
    boundary_mode: "conditional",
    status: "completed",
    created_at: "2026-03-12T16:45:00Z",
  },
  {
    id: "9e3b1c5d4f27a80261e8dc03",
    ticker: "META",
    action: "BUY",
    confidence: 0.81,
    latency_ms: 47600,
    boundary_mode: "autonomous",
    status: "executed",
    created_at: "2026-03-12T14:20:00Z",
  },
];

const SYSTEM_STATUS = [
  { name: "FastAPI Backend",   status: "online",  url: "https://atlas-backend.onrender.com" },
  { name: "Supabase (RLS)",    status: "online",  url: "—" },
  { name: "MongoDB Atlas",     status: "online",  url: "—" },
  { name: "Gemini 2.5 Flash",  status: "online",  url: "—" },
  { name: "Alpaca Paper",      status: "pending", url: "—" },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function relTime(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  const h = Math.floor(ms / 3600000);
  if (h < 1) return `${Math.floor(ms / 60000)}m ago`;
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const ACTION_COLOR: Record<string, string> = {
  BUY:  "#00C896",
  SELL: "#FF2D55",
  HOLD: "#F5A623",
};

const STATUS_STYLE: Record<string, { color: string; label: string }> = {
  completed:         { color: "#00C896", label: "Completed" },
  pending_approval:  { color: "#F5A623", label: "Pending" },
  executed:          { color: "#C8102E", label: "Executed" },
};

type AdminTab = "overview" | "pipeline" | "signals" | "system";

// ─── Page ─────────────────────────────────────────────────────────────────────

const NAV_ITEMS: { id: AdminTab; label: string }[] = [
  { id: "overview",  label: "Overview" },
  { id: "pipeline",  label: "Pipeline Runs" },
  { id: "signals",   label: "Signals" },
  { id: "system",    label: "System" },
];

export default function AdminDashboard() {
  const [tab, setTab] = useState<AdminTab>("overview");
  const [sidebarOpen, setSidebarOpen] = useState(true);

  return (
    <div className="min-h-screen flex" style={{ background: "#07080B", fontFamily: "var(--font-nunito)" }}>

      {/* ── Sidebar ── */}
      <aside
        className="flex-shrink-0 flex flex-col"
        style={{
          width: sidebarOpen ? 220 : 60,
          background: "#0C1016",
          borderRight: "1px solid #1C2B3A",
          transition: "width 0.25s ease",
          overflow: "hidden",
          position: "sticky",
          top: 0,
          height: "100vh",
        }}
      >
        {/* Sidebar header */}
        <div
          className="flex items-center gap-2.5 px-4 py-5"
          style={{ borderBottom: "1px solid #1C2B3A", minHeight: 65 }}
        >
          <div className="relative flex items-center justify-center flex-shrink-0" style={{ width: 22, height: 22 }}>
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
          {sidebarOpen && (
            <span
              className="font-display font-bold"
              style={{ fontSize: 16, color: "#E8EDF3", letterSpacing: "-0.02em", whiteSpace: "nowrap" }}
            >
              ATLAS
            </span>
          )}
          {sidebarOpen && (
            <span
              style={{
                marginLeft: "auto",
                fontSize: 9,
                fontFamily: "var(--font-jb)",
                color: "#3D5060",
                border: "1px solid #1C2B3A",
                padding: "1px 6px",
                borderRadius: 3,
                whiteSpace: "nowrap",
              }}
            >
              ADMIN
            </span>
          )}
        </div>

        {/* Nav items */}
        <nav className="flex flex-col gap-1 px-2 py-4 flex-1">
          {NAV_ITEMS.map((item) => {
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setTab(item.id)}
                className="flex items-center gap-3 rounded-lg transition-colors text-left"
                style={{
                  padding: sidebarOpen ? "10px 12px" : "10px",
                  background: active ? "rgba(200,16,46,0.1)" : "transparent",
                  border: active ? "1px solid rgba(200,16,46,0.25)" : "1px solid transparent",
                  color: active ? "#C8102E" : "#3D5060",
                  cursor: "pointer",
                  justifyContent: sidebarOpen ? "flex-start" : "center",
                }}
              >
                <span
                  style={{ fontSize: 12, fontFamily: "var(--font-jb)", fontWeight: active ? 600 : 400, whiteSpace: "nowrap" }}
                >
                  {sidebarOpen ? item.label : item.label.slice(0, 2).toUpperCase()}
                </span>
              </button>
            );
          })}
        </nav>

        {/* Bottom links */}
        <div className="px-2 pb-4 flex flex-col gap-1" style={{ borderTop: "1px solid #1C2B3A", paddingTop: 12 }}>
          <Link
            href="/dashboard"
            className="flex items-center gap-2 rounded-lg px-3 py-2 transition-colors"
            style={{ color: "#3D5060", fontSize: 12, fontFamily: "var(--font-jb)" }}
          >
            {sidebarOpen ? "← User View" : "←"}
          </Link>
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="flex items-center gap-2 rounded-lg px-3 py-2 transition-colors"
            style={{ color: "#3D5060", fontSize: 12, fontFamily: "var(--font-jb)", background: "transparent", border: "none", cursor: "pointer" }}
          >
            {sidebarOpen ? "← Collapse" : "→"}
          </button>
        </div>
      </aside>

      {/* ── Main content ── */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Top bar */}
        <header
          className="flex items-center justify-between px-8 py-4"
          style={{ borderBottom: "1px solid #1C2B3A", background: "rgba(7,8,11,0.8)" }}
        >
          <div>
            <h1 className="font-display font-bold" style={{ fontSize: 20, color: "#E8EDF3", letterSpacing: "-0.02em" }}>
              {NAV_ITEMS.find((n) => n.id === tab)?.label}
            </h1>
            <div style={{ color: "#3D5060", fontSize: 11, fontFamily: "var(--font-jb)", marginTop: 2 }}>
              Atlas Admin · Paper Trading · {new Date().toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" })}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="live-dot" />
              <span style={{ color: "#3D5060", fontSize: 11, fontFamily: "var(--font-jb)" }}>All systems operational</span>
            </div>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto p-8">

          {/* ── Overview ── */}
          {tab === "overview" && (
            <div className="flex flex-col gap-8">

              {/* Metrics grid */}
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                {METRICS.map((m) => (
                  <div
                    key={m.label}
                    style={{
                      background: "#111820",
                      border: "1px solid #1C2B3A",
                      borderRadius: 8,
                      padding: "14px 16px",
                    }}
                  >
                    <div style={{ color: "#3D5060", fontSize: 10, fontFamily: "var(--font-jb)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                      {m.label}
                    </div>
                    <div className="num font-display font-bold" style={{ fontSize: 22, color: "#E8EDF3", lineHeight: 1 }}>
                      {m.value}
                    </div>
                    <div style={{ color: m.up ? "#00C896" : "#FF2D55", fontSize: 11, fontFamily: "var(--font-jb)", marginTop: 4 }}>
                      {m.delta}
                    </div>
                  </div>
                ))}
              </div>

              {/* Recent pipeline runs */}
              <div>
                <div style={{ color: "#3D5060", fontSize: 11, fontFamily: "var(--font-jb)", marginBottom: 12, letterSpacing: "0.06em", textTransform: "uppercase" }}>
                  Recent Pipeline Runs
                </div>
                <PipelineTable runs={PIPELINE_RUNS.slice(0, 4)} />
              </div>

              {/* System status */}
              <div>
                <div style={{ color: "#3D5060", fontSize: 11, fontFamily: "var(--font-jb)", marginBottom: 12, letterSpacing: "0.06em", textTransform: "uppercase" }}>
                  System Status
                </div>
                <SystemStatusPanel />
              </div>
            </div>
          )}

          {/* ── Pipeline Runs ── */}
          {tab === "pipeline" && (
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <div style={{ color: "#3D5060", fontSize: 11, fontFamily: "var(--font-jb)", letterSpacing: "0.06em", textTransform: "uppercase" }}>
                  All Pipeline Runs
                </div>
                <RunPipelineButton />
              </div>
              <PipelineTable runs={PIPELINE_RUNS} />
            </div>
          )}

          {/* ── Signals ── */}
          {tab === "signals" && (
            <div className="flex flex-col gap-4">
              <div style={{ color: "#3D5060", fontSize: 11, fontFamily: "var(--font-jb)", letterSpacing: "0.06em", textTransform: "uppercase" }}>
                All Signals
              </div>
              <SignalsTable />
            </div>
          )}

          {/* ── System ── */}
          {tab === "system" && (
            <div className="flex flex-col gap-6">
              <SystemStatusPanel />
              <EnvPanel />
            </div>
          )}

        </main>
      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function PipelineTable({ runs }: { runs: typeof PIPELINE_RUNS }) {
  return (
    <div style={{ background: "#111820", border: "1px solid #1C2B3A", borderRadius: 10, overflow: "hidden" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, fontFamily: "var(--font-jb)" }}>
        <thead>
          <tr style={{ borderBottom: "1px solid #1C2B3A", background: "#0C1016" }}>
            {["Trace ID", "Ticker", "Action", "Confidence", "Latency", "Mode", "Status", "Time"].map((h) => (
              <th key={h} style={{ padding: "10px 16px", textAlign: "left", color: "#3D5060", fontSize: 10, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase" }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {runs.map((run) => {
            const ss = STATUS_STYLE[run.status] ?? { color: "#7A8FA0", label: run.status };
            return (
              <tr
                key={run.id}
                style={{ borderBottom: "1px solid #1C2B3A" }}
                className="transition-colors"
              >
                <td style={{ padding: "12px 16px", color: "#3D5060", fontSize: 11 }}>
                  {run.id.slice(0, 12)}…
                </td>
                <td style={{ padding: "12px 16px" }}>
                  <span className="font-display font-bold" style={{ color: "#E8EDF3", fontSize: 14 }}>{run.ticker}</span>
                </td>
                <td style={{ padding: "12px 16px" }}>
                  <span
                    style={{
                      color: ACTION_COLOR[run.action],
                      background: `${ACTION_COLOR[run.action]}15`,
                      padding: "3px 8px",
                      borderRadius: 4,
                      fontSize: 11,
                      fontWeight: 700,
                    }}
                  >
                    {run.action}
                  </span>
                </td>
                <td style={{ padding: "12px 16px", color: "#E8EDF3" }}>
                  {Math.round(run.confidence * 100)}%
                </td>
                <td style={{ padding: "12px 16px", color: "#7A8FA0" }}>
                  {(run.latency_ms / 1000).toFixed(1)}s
                </td>
                <td style={{ padding: "12px 16px", color: "#7A8FA0", textTransform: "capitalize" }}>
                  {run.boundary_mode}
                </td>
                <td style={{ padding: "12px 16px" }}>
                  <span
                    style={{
                      color: ss.color,
                      background: `${ss.color}15`,
                      padding: "3px 8px",
                      borderRadius: 4,
                      fontSize: 11,
                    }}
                  >
                    {ss.label}
                  </span>
                </td>
                <td style={{ padding: "12px 16px", color: "#3D5060" }}>
                  {relTime(run.created_at)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function SignalsTable() {
  const SIGNALS_ADMIN = [
    { ticker: "AAPL", action: "HOLD", confidence: 0.75, boundary_mode: "advisory",    approved: null,  created_at: "2026-03-13T11:22:00Z" },
    { ticker: "TSLA", action: "BUY",  confidence: 0.68, boundary_mode: "conditional", approved: false, created_at: "2026-03-13T09:30:00Z" },
    { ticker: "META", action: "BUY",  confidence: 0.81, boundary_mode: "autonomous",  approved: true,  created_at: "2026-03-12T14:20:00Z" },
    { ticker: "NVDA", action: "SELL", confidence: 0.71, boundary_mode: "advisory",    approved: null,  created_at: "2026-03-11T11:00:00Z" },
    { ticker: "MSFT", action: "HOLD", confidence: 0.62, boundary_mode: "conditional", approved: true,  created_at: "2026-03-12T16:45:00Z" },
  ];

  return (
    <div style={{ background: "#111820", border: "1px solid #1C2B3A", borderRadius: 10, overflow: "hidden" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, fontFamily: "var(--font-jb)" }}>
        <thead>
          <tr style={{ borderBottom: "1px solid #1C2B3A", background: "#0C1016" }}>
            {["Ticker", "Action", "Confidence", "Mode", "Outcome", "Time"].map((h) => (
              <th key={h} style={{ padding: "10px 16px", textAlign: "left", color: "#3D5060", fontSize: 10, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase" }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {SIGNALS_ADMIN.map((s, i) => (
            <tr key={i} style={{ borderBottom: "1px solid #1C2B3A" }}>
              <td style={{ padding: "12px 16px" }}>
                <span className="font-display font-bold" style={{ color: "#E8EDF3", fontSize: 14 }}>{s.ticker}</span>
              </td>
              <td style={{ padding: "12px 16px" }}>
                <span style={{
                  color: ACTION_COLOR[s.action],
                  background: `${ACTION_COLOR[s.action]}15`,
                  padding: "3px 8px", borderRadius: 4, fontSize: 11, fontWeight: 700,
                }}>{s.action}</span>
              </td>
              <td style={{ padding: "12px 16px", color: "#E8EDF3" }}>{Math.round(s.confidence * 100)}%</td>
              <td style={{ padding: "12px 16px", color: "#7A8FA0", textTransform: "capitalize" }}>{s.boundary_mode}</td>
              <td style={{ padding: "12px 16px" }}>
                {s.approved === null
                  ? <span style={{ color: "#F5A623", background: "rgba(245,166,35,0.1)", padding: "3px 8px", borderRadius: 4, fontSize: 11 }}>Pending</span>
                  : s.approved
                  ? <span style={{ color: "#00C896", background: "rgba(0,200,150,0.1)", padding: "3px 8px", borderRadius: 4, fontSize: 11 }}>Approved</span>
                  : <span style={{ color: "#FF2D55", background: "rgba(255,45,85,0.1)", padding: "3px 8px", borderRadius: 4, fontSize: 11 }}>Rejected</span>
                }
              </td>
              <td style={{ padding: "12px 16px", color: "#3D5060" }}>{relTime(s.created_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SystemStatusPanel() {
  return (
    <div style={{ background: "#111820", border: "1px solid #1C2B3A", borderRadius: 10, overflow: "hidden" }}>
      {SYSTEM_STATUS.map((s, i) => (
        <div
          key={s.name}
          className="flex items-center justify-between"
          style={{
            padding: "14px 20px",
            borderBottom: i < SYSTEM_STATUS.length - 1 ? "1px solid #1C2B3A" : "none",
          }}
        >
          <div className="flex items-center gap-3">
            <div
              style={{
                width: 7, height: 7, borderRadius: "50%",
                background: s.status === "online" ? "#00C896" : s.status === "pending" ? "#F5A623" : "#FF2D55",
                animation: s.status === "online" ? "pulse-live 2.5s ease-in-out infinite" : "none",
              }}
            />
            <span style={{ color: "#E8EDF3", fontSize: 14, fontFamily: "var(--font-jb)" }}>{s.name}</span>
          </div>
          <span
            style={{
              fontSize: 11,
              fontFamily: "var(--font-jb)",
              color: s.status === "online" ? "#00C896" : s.status === "pending" ? "#F5A623" : "#FF2D55",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
            }}
          >
            {s.status}
          </span>
        </div>
      ))}
    </div>
  );
}

function EnvPanel() {
  const rows = [
    ["API Endpoint",     process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"],
    ["Supabase Project", "qbbbuebbxueqclkrvoos"],
    ["MongoDB DB",       "atlas"],
    ["LLM (Quick)",      "gemini-2.5-flash"],
    ["LLM (Deep)",       "gemini-2.5-flash"],
    ["Broker",           "Alpaca (paper)"],
  ];
  return (
    <div>
      <div style={{ color: "#3D5060", fontSize: 11, fontFamily: "var(--font-jb)", marginBottom: 12, letterSpacing: "0.06em", textTransform: "uppercase" }}>
        Configuration
      </div>
      <div style={{ background: "#111820", border: "1px solid #1C2B3A", borderRadius: 10, overflow: "hidden" }}>
        {rows.map(([k, v], i) => (
          <div
            key={k}
            className="flex items-center justify-between"
            style={{ padding: "12px 20px", borderBottom: i < rows.length - 1 ? "1px solid #1C2B3A" : "none" }}
          >
            <span style={{ color: "#3D5060", fontSize: 12, fontFamily: "var(--font-jb)" }}>{k}</span>
            <span style={{ color: "#7A8FA0", fontSize: 12, fontFamily: "var(--font-jb)" }}>{v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function RunPipelineButton() {
  const [running, setRunning] = useState(false);
  const [ticker, setTicker] = useState("AAPL");

  const handleRun = async () => {
    setRunning(true);
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"}/v1/pipeline/run`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ticker, boundary_mode: "advisory" }),
        }
      );
      const data = await res.json();
      alert(`Pipeline complete: ${data.action} ${data.ticker} @ ${Math.round(data.confidence * 100)}% confidence\nTrace: ${data.trace_id}`);
    } catch {
      alert("Pipeline failed — is the backend running?");
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <input
        value={ticker}
        onChange={(e) => setTicker(e.target.value.toUpperCase())}
        style={{
          background: "#111820",
          border: "1px solid #1C2B3A",
          borderRadius: 6,
          padding: "8px 12px",
          color: "#E8EDF3",
          fontSize: 13,
          fontFamily: "var(--font-jb)",
          width: 90,
          outline: "none",
        }}
        placeholder="AAPL"
      />
      <button
        onClick={handleRun}
        disabled={running}
        style={{
          background: running ? "#1C2B3A" : "#C8102E",
          border: "none",
          borderRadius: 6,
          padding: "8px 16px",
          color: "#fff",
          fontSize: 12,
          fontFamily: "var(--font-jb)",
          cursor: running ? "not-allowed" : "pointer",
          transition: "background 0.2s ease",
          whiteSpace: "nowrap",
        }}
      >
        {running ? "Running…" : "▶ Run Pipeline"}
      </button>
    </div>
  );
}
