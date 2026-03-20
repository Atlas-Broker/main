"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { fetchWithAuth, fetchMyProfile, type UserRole } from "@/lib/api";
import { AccountDropdown } from "@/components/AccountDropdown";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// ─── Types ────────────────────────────────────────────────────────────────────

type Signal = {
  id: string;
  ticker: string;
  action: "BUY" | "SELL" | "HOLD";
  confidence: number;
  reasoning: string;
  boundary_mode: string;
  risk: { stop_loss: number; take_profit: number; position_size: number; risk_reward_ratio: number };
  created_at: string;
};

type SchedulerStatus = {
  enabled: boolean;
  next_run_utc: string | null;
  last_run_utc: string | null;
  last_run_results: RunResult[];
  watchlist: string[];
  active_users: number;
  next_market_open_et: string;
  current_time_et: string;
};

type RunResult = {
  ticker: string;
  action?: string;
  confidence?: number;
  status: "ok" | "error";
  error?: string;
  trace_id?: string;
  user_id?: string;
};

type HealthData = {
  status: string;
  version: string;
  environment: string;
};

type AdminTab = "overview" | "pipeline" | "scheduler" | "system";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function relTime(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  const h = Math.floor(ms / 3600000);
  if (h < 1) return `${Math.floor(ms / 60000)}m ago`;
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const C = {
  BUY:  "var(--bull)",
  SELL: "var(--bear)",
  HOLD: "var(--hold)",
} as const;

const MODE_COLOR: Record<string, string> = {
  advisory:             "var(--dim)",
  conditional:          "var(--hold)",    // legacy
  autonomous:           "var(--bull)",
  autonomous_guardrail: "var(--brand)",
};

// ─── Shared atoms ─────────────────────────────────────────────────────────────

function Tag({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span style={{
      color,
      background: `${color}18`,
      padding: "3px 9px",
      borderRadius: 4,
      fontSize: 11,
      fontFamily: "var(--font-jb)",
      fontWeight: 700,
      letterSpacing: "0.04em",
    }}>
      {children}
    </span>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ color: "var(--ghost)", fontSize: 10, fontFamily: "var(--font-jb)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 12 }}>
      {children}
    </div>
  );
}

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 10, overflow: "hidden", ...style }}>
      {children}
    </div>
  );
}

// ─── Signals table ────────────────────────────────────────────────────────────

function SignalsTable({ signals, loading }: { signals: Signal[]; loading: boolean }) {
  if (loading) return <div style={{ padding: 32, color: "var(--ghost)", fontSize: 13, fontFamily: "var(--font-jb)", textAlign: "center" }}>Loading…</div>;
  if (!signals.length) return <div style={{ padding: 32, color: "var(--ghost)", fontSize: 13, fontFamily: "var(--font-jb)", textAlign: "center" }}>No signals yet.</div>;

  return (
    <Card>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, fontFamily: "var(--font-jb)" }}>
        <thead>
          <tr style={{ borderBottom: "1px solid var(--line)", background: "var(--deep)" }}>
            {["Ticker", "Action", "Confidence", "Mode", "Stop", "Target", "Time"].map((h) => (
              <th key={h} style={{ padding: "10px 16px", textAlign: "left", color: "var(--ghost)", fontSize: 10, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase" }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {signals.map((s) => (
            <tr key={s.id} style={{ borderBottom: "1px solid var(--line)" }}>
              <td style={{ padding: "12px 16px" }}>
                <span className="font-display font-bold" style={{ color: "var(--ink)", fontSize: 14 }}>{s.ticker}</span>
              </td>
              <td style={{ padding: "12px 16px" }}>
                <Tag color={C[s.action] ?? "var(--dim)"}>{s.action}</Tag>
              </td>
              <td style={{ padding: "12px 16px", color: "var(--ink)" }}>{Math.round(s.confidence * 100)}%</td>
              <td style={{ padding: "12px 16px" }}>
                <Tag color={MODE_COLOR[s.boundary_mode] ?? "var(--dim)"}>{s.boundary_mode}</Tag>
              </td>
              <td style={{ padding: "12px 16px", color: "var(--dim)" }}>${s.risk?.stop_loss ?? "—"}</td>
              <td style={{ padding: "12px 16px", color: "var(--dim)" }}>${s.risk?.take_profit ?? "—"}</td>
              <td style={{ padding: "12px 16px", color: "var(--ghost)" }}>{relTime(s.created_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

// ─── Run pipeline (single ticker) ─────────────────────────────────────────────

function RunPipelinePanel({ onRan }: { onRan: () => void }) {
  const [ticker, setTicker]     = useState("AAPL");
  const [mode, setMode]         = useState("autonomous_guardrail");
  const [running, setRunning]   = useState(false);
  const [result, setResult]     = useState<{ action: string; confidence: number; ticker: string; trace_id: string } | null>(null);
  const [error, setError]       = useState<string | null>(null);

  async function handleRun() {
    setRunning(true);
    setResult(null);
    setError(null);
    const philosophyMode = localStorage.getItem("atlas_philosophy_mode") ?? "balanced";
    try {
      const res = await fetchWithAuth(`${API}/v1/pipeline/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticker: ticker.toUpperCase(),
          boundary_mode: mode,
          philosophy_mode: philosophyMode,
        }),
      });
      if (!res) return;
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setError((err as { detail?: string }).detail ?? `Error ${res.status}`);
        return;
      }
      const data = await res.json();
      setResult({
        action:     data.signal?.action ?? "—",
        confidence: data.signal?.confidence ?? 0,
        ticker:     data.signal?.ticker ?? ticker,
        trace_id:   data.signal?.trace_id ?? "",
      });
      onRan();
    } catch {
      setError("Network error — is the backend running?");
    } finally {
      setRunning(false);
    }
  }

  const inputStyle: React.CSSProperties = {
    background: "var(--deep)",
    border: "1px solid var(--line)",
    borderRadius: 6,
    padding: "9px 12px",
    color: "var(--ink)",
    fontSize: 13,
    fontFamily: "var(--font-jb)",
    outline: "none",
  };

  return (
    <Card style={{ padding: "20px 24px" }}>
      <SectionLabel>Run Single Ticker</SectionLabel>
      <div className="flex flex-wrap gap-2 items-center">
        <input
          value={ticker}
          onChange={(e) => setTicker(e.target.value.toUpperCase())}
          placeholder="AAPL"
          maxLength={6}
          style={{ ...inputStyle, width: 90 }}
        />
        <select
          value={mode}
          onChange={(e) => setMode(e.target.value)}
          style={{ ...inputStyle, cursor: "pointer" }}
        >
          <option value="advisory">Advisory</option>
          <option value="autonomous_guardrail">Autonomous + Guardrail</option>
          <option value="autonomous">Autonomous</option>
        </select>
        <button
          onClick={handleRun}
          disabled={running || !ticker.trim()}
          style={{
            background: running ? "var(--elevated)" : "var(--brand)",
            border: "none", borderRadius: 6,
            padding: "9px 18px",
            color: "#fff", fontSize: 12,
            fontFamily: "var(--font-jb)",
            cursor: running || !ticker.trim() ? "not-allowed" : "pointer",
            whiteSpace: "nowrap",
            transition: "background 0.2s ease",
          }}
        >
          {running ? "Running…" : "▶ Run Pipeline"}
        </button>
      </div>

      {result && (
        <div style={{
          marginTop: 14, padding: "12px 16px", borderRadius: 8,
          background: "var(--deep)", border: "1px solid var(--line)",
        }}>
          <div className="flex items-center gap-3 flex-wrap">
            <span className="font-display font-bold" style={{ color: "var(--ink)", fontSize: 16 }}>{result.ticker}</span>
            <Tag color={C[result.action as keyof typeof C] ?? "var(--dim)"}>{result.action}</Tag>
            <span style={{ color: "var(--dim)", fontSize: 13 }}>{Math.round(result.confidence * 100)}% confidence</span>
            <span style={{ color: "var(--ghost)", fontSize: 11 }}>trace: {result.trace_id.slice(0, 12)}…</span>
          </div>
        </div>
      )}

      {error && (
        <div style={{ marginTop: 12, padding: "10px 14px", borderRadius: 8, background: "var(--bear-bg)", border: "1px solid var(--bear)30", color: "var(--bear)", fontSize: 12, fontFamily: "var(--font-jb)" }}>
          {error}
        </div>
      )}
    </Card>
  );
}

// ─── Scheduler panel ──────────────────────────────────────────────────────────

function SchedulerPanel() {
  const [status, setStatus]   = useState<SchedulerStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<RunResult[] | null>(null);
  const [error, setError]     = useState<string | null>(null);

  async function fetchStatus() {
    try {
      const res = await fetchWithAuth(`${API}/v1/scheduler/status`);
      if (res?.ok) setStatus(await res.json());
    } catch {
      // non-fatal
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchStatus(); }, []);

  async function handleRunNow() {
    setRunning(true);
    setResults(null);
    setError(null);
    try {
      const res = await fetchWithAuth(`${API}/v1/scheduler/run-now`, { method: "POST" });
      if (!res) return;
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setError((err as { detail?: string }).detail ?? `Error ${res.status}`);
        return;
      }
      const data = await res.json();
      setResults(data.results ?? []);
      fetchStatus();
    } catch {
      setError("Network error — is the backend running?");
    } finally {
      setRunning(false);
    }
  }

  const dotColor = status?.enabled ? "var(--bull)" : "var(--ghost)";

  return (
    <div className="flex flex-col gap-6">

      {/* Status overview */}
      <Card style={{ padding: "20px 24px" }}>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: dotColor, flexShrink: 0 }} />
              <span style={{ color: "var(--ink)", fontSize: 15, fontFamily: "var(--font-jb)", fontWeight: 600 }}>
                Daily Scheduler — {loading ? "…" : status?.enabled ? "ENABLED" : "DISABLED"}
              </span>
            </div>

            {status && (
              <div className="flex flex-col gap-1.5" style={{ fontSize: 12, fontFamily: "var(--font-jb)" }}>
                <div className="flex gap-3">
                  <span style={{ color: "var(--ghost)", width: 140 }}>Next market open</span>
                  <span style={{ color: "var(--dim)" }}>{status.next_market_open_et}</span>
                </div>
                <div className="flex gap-3">
                  <span style={{ color: "var(--ghost)", width: 140 }}>Current time (ET)</span>
                  <span style={{ color: "var(--dim)" }}>{status.current_time_et}</span>
                </div>
                <div className="flex gap-3">
                  <span style={{ color: "var(--ghost)", width: 140 }}>Last run</span>
                  <span style={{ color: "var(--dim)" }}>{status.last_run_utc ? relTime(status.last_run_utc) : "Never"}</span>
                </div>
                <div className="flex gap-3">
                  <span style={{ color: "var(--ghost)", width: 140 }}>Active users</span>
                  <span style={{ color: status.active_users > 0 ? "var(--bull)" : "var(--dim)" }}>{status.active_users}</span>
                </div>
                <div className="flex gap-3">
                  <span style={{ color: "var(--ghost)", width: 140 }}>Watchlist</span>
                  <span style={{ color: "var(--dim)" }}>{status.watchlist.join(", ") || "—"}</span>
                </div>
              </div>
            )}

            {!status?.enabled && !loading && (
              <div style={{ marginTop: 12, padding: "10px 14px", borderRadius: 8, background: "var(--hold-bg)", border: "1px solid var(--hold)30", color: "var(--hold)", fontSize: 12, fontFamily: "var(--font-jb)" }}>
                Set SCHEDULER_ENABLED=true in Render env vars to activate automatic daily runs.
              </div>
            )}
          </div>

          {/* Run Now */}
          <div className="flex flex-col gap-2" style={{ minWidth: 180 }}>
            <button
              onClick={handleRunNow}
              disabled={running}
              style={{
                background: running ? "var(--elevated)" : "var(--brand)",
                border: "none", borderRadius: 8,
                padding: "11px 20px",
                color: "#fff", fontSize: 13,
                fontFamily: "var(--font-jb)", fontWeight: 600,
                cursor: running ? "not-allowed" : "pointer",
                whiteSpace: "nowrap",
                transition: "background 0.2s ease",
              }}
            >
              {running ? "Running watchlist…" : "▶ Run Watchlist Now"}
            </button>
            <p style={{ color: "var(--ghost)", fontSize: 11, fontFamily: "var(--font-jb)", textAlign: "center" }}>
              Runs all tickers for your account
            </p>
          </div>
        </div>
      </Card>

      {/* Error */}
      {error && (
        <div style={{ padding: "12px 16px", borderRadius: 8, background: "var(--bear-bg)", border: "1px solid var(--bear)30", color: "var(--bear)", fontSize: 12, fontFamily: "var(--font-jb)" }}>
          {error}
        </div>
      )}

      {/* Run results */}
      {results && (
        <div>
          <SectionLabel>Run Results — {results.filter(r => r.status === "ok").length}/{results.length} succeeded</SectionLabel>
          <Card>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, fontFamily: "var(--font-jb)" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--line)", background: "var(--deep)" }}>
                  {["Ticker", "Action", "Confidence", "Status", "Trace"].map((h) => (
                    <th key={h} style={{ padding: "10px 16px", textAlign: "left", color: "var(--ghost)", fontSize: 10, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {results.map((r, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid var(--line)" }}>
                    <td style={{ padding: "12px 16px" }}>
                      <span className="font-display font-bold" style={{ color: "var(--ink)", fontSize: 14 }}>{r.ticker}</span>
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      {r.action ? <Tag color={C[r.action as keyof typeof C] ?? "var(--dim)"}>{r.action}</Tag> : <span style={{ color: "var(--ghost)" }}>—</span>}
                    </td>
                    <td style={{ padding: "12px 16px", color: "var(--ink)" }}>
                      {r.confidence != null ? `${Math.round(r.confidence * 100)}%` : "—"}
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      {r.status === "ok"
                        ? <Tag color="var(--bull)">OK</Tag>
                        : <Tag color="var(--bear)">ERROR</Tag>}
                    </td>
                    <td style={{ padding: "12px 16px", color: "var(--ghost)", fontSize: 11 }}>
                      {r.error ?? (r.trace_id ? `${r.trace_id.slice(0, 12)}…` : "—")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>
      )}

      {/* Last scheduled run results */}
      {!results && status?.last_run_results && status.last_run_results.length > 0 && (
        <div>
          <SectionLabel>Last Scheduled Run — {relTime(status.last_run_utc!)}</SectionLabel>
          <Card>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, fontFamily: "var(--font-jb)" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--line)", background: "var(--deep)" }}>
                  {["Ticker", "Action", "Confidence", "Status"].map((h) => (
                    <th key={h} style={{ padding: "10px 16px", textAlign: "left", color: "var(--ghost)", fontSize: 10, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {status.last_run_results.map((r, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid var(--line)" }}>
                    <td style={{ padding: "12px 16px" }}>
                      <span className="font-display font-bold" style={{ color: "var(--ink)", fontSize: 14 }}>{r.ticker}</span>
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      {r.action ? <Tag color={C[r.action as keyof typeof C] ?? "var(--dim)"}>{r.action}</Tag> : <span style={{ color: "var(--ghost)" }}>—</span>}
                    </td>
                    <td style={{ padding: "12px 16px", color: "var(--ink)" }}>
                      {r.confidence != null ? `${Math.round(r.confidence * 100)}%` : "—"}
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      {r.status === "ok" ? <Tag color="var(--bull)">OK</Tag> : <Tag color="var(--bear)">ERROR</Tag>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>
      )}
    </div>
  );
}

// ─── System panel ─────────────────────────────────────────────────────────────

function SystemPanel() {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [healthLoading, setHealthLoading] = useState(true);

  useEffect(() => {
    fetch(`${API}/health`)
      .then((r) => r.json())
      .then(setHealth)
      .catch(() => setHealth(null))
      .finally(() => setHealthLoading(false));
  }, []);

  const services = [
    { name: "FastAPI Backend",  status: healthLoading ? "checking" : health ? "online" : "offline" },
    { name: "Supabase (RLS)",   status: "online" },
    { name: "MongoDB Atlas",    status: "online" },
    { name: "Gemini 2.5 Flash", status: "online" },
    { name: "Alpaca Paper",     status: "online" },
  ];

  const statusColor = (s: string) =>
    s === "online" ? "var(--bull)" : s === "checking" ? "var(--hold)" : "var(--bear)";

  const config = [
    ["API Endpoint",     API],
    ["Supabase Project", "qbbbuebbxueqclkrvoos"],
    ["MongoDB DB",       "atlas"],
    ["Backend Version",  health?.version ?? "—"],
    ["Environment",      health?.environment ?? "—"],
    ["Broker",           "Alpaca (paper)"],
  ];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <SectionLabel>Service Health</SectionLabel>
        <Card>
          {services.map((s, i) => (
            <div key={s.name} className="flex items-center justify-between" style={{
              padding: "14px 20px",
              borderBottom: i < services.length - 1 ? "1px solid var(--line)" : "none",
            }}>
              <div className="flex items-center gap-3">
                <div style={{ width: 7, height: 7, borderRadius: "50%", background: statusColor(s.status), flexShrink: 0 }} />
                <span style={{ color: "var(--ink)", fontSize: 14, fontFamily: "var(--font-jb)" }}>{s.name}</span>
              </div>
              <span style={{ fontSize: 11, fontFamily: "var(--font-jb)", color: statusColor(s.status), textTransform: "uppercase", letterSpacing: "0.06em" }}>
                {s.status}
              </span>
            </div>
          ))}
        </Card>
      </div>

      <div>
        <SectionLabel>Configuration</SectionLabel>
        <Card>
          {config.map(([k, v], i) => (
            <div key={k} className="flex items-center justify-between" style={{
              padding: "12px 20px",
              borderBottom: i < config.length - 1 ? "1px solid var(--line)" : "none",
            }}>
              <span style={{ color: "var(--ghost)", fontSize: 12, fontFamily: "var(--font-jb)" }}>{k}</span>
              <span style={{ color: "var(--dim)", fontSize: 12, fontFamily: "var(--font-jb)" }}>{v}</span>
            </div>
          ))}
        </Card>
      </div>
    </div>
  );
}

// ─── Overview metrics ─────────────────────────────────────────────────────────

function OverviewTab({ signals, signalsLoading }: { signals: Signal[]; signalsLoading: boolean }) {
  const today = new Date().toDateString();
  const todayCount = signals.filter(s => new Date(s.created_at).toDateString() === today).length;
  const avgConf = signals.length
    ? Math.round(signals.reduce((a, s) => a + s.confidence, 0) / signals.length * 100)
    : 0;
  const buys  = signals.filter(s => s.action === "BUY").length;
  const sells = signals.filter(s => s.action === "SELL").length;
  const holds = signals.filter(s => s.action === "HOLD").length;

  const metrics = [
    { label: "Signals Today",   value: signalsLoading ? "…" : String(todayCount),        color: "var(--ink)" },
    { label: "Total Signals",   value: signalsLoading ? "…" : String(signals.length),     color: "var(--ink)" },
    { label: "Avg Confidence",  value: signalsLoading ? "…" : `${avgConf}%`,              color: avgConf >= 70 ? "var(--bull)" : "var(--hold)" },
    { label: "BUY Signals",     value: signalsLoading ? "…" : String(buys),               color: "var(--bull)" },
    { label: "SELL Signals",    value: signalsLoading ? "…" : String(sells),              color: "var(--bear)" },
    { label: "HOLD Signals",    value: signalsLoading ? "…" : String(holds),              color: "var(--hold)" },
  ];

  return (
    <div className="flex flex-col gap-8">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {metrics.map((m) => (
          <div key={m.label} style={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 8, padding: "14px 16px" }}>
            <div style={{ color: "var(--ghost)", fontSize: 10, fontFamily: "var(--font-jb)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.04em" }}>
              {m.label}
            </div>
            <div className="num font-display font-bold" style={{ fontSize: 24, color: m.color, lineHeight: 1 }}>
              {m.value}
            </div>
          </div>
        ))}
      </div>

      <div>
        <SectionLabel>Recent Signals</SectionLabel>
        <SignalsTable signals={signals.slice(0, 5)} loading={signalsLoading} />
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const NAV_ITEMS: { id: AdminTab; label: string; short: string }[] = [
  { id: "overview",   label: "Overview",    short: "OV" },
  { id: "pipeline",   label: "Pipeline",    short: "PL" },
  { id: "scheduler",  label: "Scheduler",   short: "SC" },
  { id: "system",     label: "System",      short: "SY" },
];

export default function AdminDashboard() {
  const [tab, setTab]               = useState<AdminTab>("overview");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [signals, setSignals]       = useState<Signal[]>([]);
  const [signalsLoading, setSignalsLoading] = useState(true);
  const [role, setRole]             = useState<UserRole | null>(null);
  const [roleLoading, setRoleLoading] = useState(true);
  const router = useRouter();

  async function loadSignals() {
    try {
      const res = await fetchWithAuth(`${API}/v1/signals?limit=50`);
      if (!res) { router.push("/login"); return; }
      const data = await res.json();
      setSignals(Array.isArray(data) ? data : []);
    } catch {
      // non-fatal
    } finally {
      setSignalsLoading(false);
    }
  }

  useEffect(() => {
    fetchMyProfile()
      .then((profile) => {
        if (!profile) { router.push("/login"); return; }
        setRole(profile.role);
        if (profile.role === "user") {
          router.push("/dashboard");
        }
      })
      .catch(() => router.push("/dashboard"))
      .finally(() => setRoleLoading(false));
  }, [router]);

  useEffect(() => { loadSignals(); }, []);

  if (roleLoading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg)", color: "var(--ghost)", fontFamily: "var(--font-jb)", fontSize: 13 }}>
        Verifying access…
      </div>
    );
  }

  if (role === "user") {
    return null; // redirect in progress
  }

  return (
    <div className="min-h-screen flex" style={{ background: "var(--bg)", fontFamily: "var(--font-nunito)" }}>

      {/* ── Sidebar ── */}
      <aside className="flex-shrink-0 flex flex-col" style={{
        width: sidebarOpen ? 220 : 60,
        background: "var(--deep)",
        borderRight: "1px solid var(--line)",
        transition: "width 0.25s ease",
        overflow: "hidden",
        position: "sticky",
        top: 0,
        height: "100vh",
      }}>
        <div className="flex items-center gap-2.5 px-4 py-5" style={{ borderBottom: "1px solid var(--line)", minHeight: 65 }}>
          <div className="relative flex items-center justify-center flex-shrink-0" style={{ width: 22, height: 22 }}>
            <div style={{ position: "absolute", width: 2, height: 18, background: "#C8102E", transform: "skewX(-14deg) translateX(2px)", borderRadius: 1 }} />
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#C8102E", position: "relative", zIndex: 1, marginLeft: 3 }} />
          </div>
          {sidebarOpen && <span className="font-display font-bold" style={{ fontSize: 16, color: "var(--ink)", letterSpacing: "-0.02em", whiteSpace: "nowrap" }}>ATLAS</span>}
          {sidebarOpen && <span style={{ marginLeft: "auto", fontSize: 9, fontFamily: "var(--font-jb)", color: "var(--ghost)", border: "1px solid var(--line)", padding: "1px 6px", borderRadius: 3, whiteSpace: "nowrap" }}>ADMIN</span>}
        </div>

        <nav className="flex flex-col gap-1 px-2 py-4 flex-1">
          {NAV_ITEMS.map((item) => {
            const active = tab === item.id;
            return (
              <button key={item.id} onClick={() => setTab(item.id)}
                className="flex items-center gap-3 rounded-lg transition-colors text-left"
                style={{
                  padding: sidebarOpen ? "10px 12px" : "10px",
                  background: active ? "var(--brand)18" : "transparent",
                  border: active ? "1px solid var(--brand)30" : "1px solid transparent",
                  color: active ? "var(--brand)" : "var(--ghost)",
                  cursor: "pointer",
                  justifyContent: sidebarOpen ? "flex-start" : "center",
                }}
              >
                <span style={{ fontSize: 12, fontFamily: "var(--font-jb)", fontWeight: active ? 600 : 400, whiteSpace: "nowrap" }}>
                  {sidebarOpen ? item.label : item.short}
                </span>
              </button>
            );
          })}
        </nav>

        <div className="px-2 pb-4 flex flex-col gap-1" style={{ borderTop: "1px solid var(--line)", paddingTop: 12 }}>
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="flex items-center gap-2 rounded-lg px-3 py-2" style={{ color: "var(--ghost)", fontSize: 12, fontFamily: "var(--font-jb)", background: "transparent", border: "none", cursor: "pointer" }}>
            {sidebarOpen ? "← Collapse" : "→"}
          </button>
        </div>
      </aside>

      {/* ── Main ── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="flex items-center justify-between px-8 py-4" style={{ borderBottom: "1px solid var(--line)", background: "var(--header-bg)", backdropFilter: "blur(12px)" }}>
          <div>
            <h1 className="font-display font-bold" style={{ fontSize: 20, color: "var(--ink)", letterSpacing: "-0.02em" }}>
              {NAV_ITEMS.find(n => n.id === tab)?.label}
            </h1>
            <div style={{ color: "var(--ghost)", fontSize: 11, fontFamily: "var(--font-jb)", marginTop: 2 }}>
              Atlas Admin · {new Date().toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" })}
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--bull)" }} />
              <span style={{ color: "var(--ghost)", fontSize: 11, fontFamily: "var(--font-jb)" }}>live</span>
            </div>
            <AccountDropdown role={role} />
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-8">
          {tab === "overview"  && <OverviewTab signals={signals} signalsLoading={signalsLoading} />}
          {tab === "pipeline"  && (
            <div className="flex flex-col gap-6">
              <RunPipelinePanel onRan={loadSignals} />
              <div>
                <SectionLabel>All Pipeline Runs ({signals.length})</SectionLabel>
                <SignalsTable signals={signals} loading={signalsLoading} />
              </div>
            </div>
          )}
          {tab === "scheduler" && <SchedulerPanel />}
          {tab === "system"    && <SystemPanel />}
        </main>
      </div>
    </div>
  );
}
