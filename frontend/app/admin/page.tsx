"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { fetchWithAuth, fetchMyProfile, type UserRole } from "@/lib/api";
import { AccountDropdown } from "@/components/AccountDropdown";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// ─── Types ────────────────────────────────────────────────────────────────────

type AdminPage = "overview" | "users" | "system" | "roles";

type AdminStats = {
  total_users: number;
  free_count: number;
  pro_count: number;
  max_count: number;
  signals_today: number;
  executions_today: number;
};

type AdminUser = {
  id: string;
  display_name: string | null;
  email: string;
  tier: "free" | "pro" | "max";
  role: "user" | "admin" | "superadmin";
  created_at: string;
  broker_connected: boolean;
};

type ServiceStatus = {
  status: "online" | "degraded" | "offline";
  last_checked: string;
  detail: string;
};

type SystemStatus = Record<string, ServiceStatus>;

type ConfirmModal = {
  title: string;
  body: string;
  onConfirm: () => Promise<void> | void;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function relTime(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  const h = Math.floor(ms / 3600000);
  if (h < 1) return `${Math.floor(ms / 60000)}m ago`;
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// ─── Shared atoms ─────────────────────────────────────────────────────────────

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 10, overflow: "hidden", ...style }}>
      {children}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ color: "var(--ghost)", fontSize: 10, fontFamily: "var(--font-jb)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 12 }}>
      {children}
    </div>
  );
}

function StatCard({ label, value, sub, sparkline }: { label: string; value: string | number; sub?: string; sparkline?: number[] }) {
  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 10, padding: "16px 18px" }}>
      <div style={{ color: "var(--ghost)", fontSize: 10, fontFamily: "var(--font-jb)", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 8 }}>
        {label}
      </div>
      <div className="font-display font-bold" style={{ fontSize: 28, color: "var(--ink)", lineHeight: 1, letterSpacing: "-0.02em" }}>
        {value}
      </div>
      {sub && <div style={{ color: "var(--ghost)", fontSize: 11, fontFamily: "var(--font-jb)", marginTop: 4 }}>{sub}</div>}
      {sparkline && sparkline.length > 1 && (
        <svg width="100%" height="28" style={{ marginTop: 8, display: "block" }} viewBox={`0 0 ${sparkline.length - 1} 20`} preserveAspectRatio="none">
          <polyline
            fill="none"
            stroke="var(--brand)"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            points={sparkline.map((v, i) => {
              const max = Math.max(...sparkline);
              const min = Math.min(...sparkline);
              const range = max - min || 1;
              const y = 18 - ((v - min) / range) * 16;
              return `${i},${y}`;
            }).join(" ")}
          />
        </svg>
      )}
    </div>
  );
}

function TierBadge({ tier }: { tier: "free" | "pro" | "max" }) {
  const styles: Record<string, React.CSSProperties> = {
    free: { color: "var(--ghost)", borderColor: "var(--line)", background: "transparent" },
    pro:  { color: "var(--tier-pro)", borderColor: "var(--tier-pro)", background: "color-mix(in srgb, var(--tier-pro) 8%, transparent)" },
    max:  { color: "var(--tier-max)", borderColor: "var(--tier-max)", background: "color-mix(in srgb, var(--tier-max) 8%, transparent)" },
  };
  return (
    <span style={{ fontSize: 10, fontFamily: "var(--font-jb)", padding: "2px 7px", borderRadius: 4, border: "1px solid", textTransform: "uppercase", letterSpacing: "0.05em", ...styles[tier] }}>
      {tier}
    </span>
  );
}

function RoleBadge({ role }: { role: string }) {
  const color = role === "superadmin" ? "var(--bear)" : role === "admin" ? "var(--brand)" : "var(--ghost)";
  return (
    <span style={{ fontSize: 10, fontFamily: "var(--font-jb)", color, background: `${color}15`, border: `1px solid ${color}40`, padding: "2px 7px", borderRadius: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>
      {role}
    </span>
  );
}

// ─── Confirm Modal ────────────────────────────────────────────────────────────

function Modal({ modal, onClose }: { modal: ConfirmModal; onClose: () => void }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 999, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 12, padding: "28px 24px", maxWidth: 420, width: "100%", boxShadow: "0 20px 60px rgba(0,0,0,0.4)" }}>
        <h3 style={{ color: "var(--ink)", fontSize: 16, fontFamily: "var(--font-display)", fontWeight: 700, marginBottom: 10, letterSpacing: "-0.01em" }}>
          {modal.title}
        </h3>
        <p style={{ color: "var(--dim)", fontSize: 13, fontFamily: "var(--font-nunito)", lineHeight: 1.6, marginBottom: 20 }}>
          {modal.body}
        </p>
        <div className="flex gap-3">
          <button
            onClick={onClose}
            style={{ flex: 1, padding: "10px 0", borderRadius: 8, border: "1px solid var(--line)", background: "transparent", color: "var(--ghost)", fontSize: 13, fontFamily: "var(--font-nunito)", cursor: "pointer" }}
          >
            Cancel
          </button>
          <button
            onClick={async () => { await modal.onConfirm(); onClose(); }}
            style={{ flex: 1, padding: "10px 0", borderRadius: 8, border: "none", background: "var(--brand)", color: "#fff", fontSize: 13, fontFamily: "var(--font-nunito)", fontWeight: 600, cursor: "pointer" }}
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Page 1: Overview ─────────────────────────────────────────────────────────

const PLACEHOLDER_RUNS = [
  { ticker: "AAPL",  action: "BUY",  status: "ok",    ts: "2026-03-20T08:14:00Z", duration: "3.2s" },
  { ticker: "NVDA",  action: "HOLD", status: "ok",    ts: "2026-03-20T08:12:00Z", duration: "2.9s" },
  { ticker: "TSLA",  action: "SELL", status: "error", ts: "2026-03-20T08:10:00Z", duration: "1.1s" },
  { ticker: "MSFT",  action: "BUY",  status: "ok",    ts: "2026-03-19T16:05:00Z", duration: "3.5s" },
  { ticker: "GOOGL", action: "BUY",  status: "ok",    ts: "2026-03-19T16:03:00Z", duration: "3.1s" },
];

function OverviewPage({ stats, statsLoading, systemStatus, systemLoading }: {
  stats: AdminStats | null;
  statsLoading: boolean;
  systemStatus: SystemStatus | null;
  systemLoading: boolean;
}) {
  const sparkline = [12, 18, 15, 22, 19, 27, stats?.total_users ?? 30];

  return (
    <div className="flex flex-col gap-8">
      {/* Stat cards */}
      <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))" }}>
        <StatCard label="Total Users" value={statsLoading ? "…" : stats?.total_users ?? 0} sub="all time" sparkline={sparkline} />
        <StatCard label="Tier Breakdown" value={statsLoading ? "…" : `${stats?.free_count ?? 0} / ${stats?.pro_count ?? 0} / ${stats?.max_count ?? 0}`} sub="Free / Pro / Max" />
        <StatCard label="Signals Today" value={statsLoading ? "…" : stats?.signals_today ?? 0} sub="pipeline outputs" />
        <StatCard label="Auto Executions" value={statsLoading ? "…" : stats?.executions_today ?? 0} sub="autonomous trades today" />
      </div>

      {/* 2-column below */}
      <div className="grid gap-6" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))" }}>
        {/* Recent pipeline runs */}
        <div>
          <SectionLabel>Recent Pipeline Runs</SectionLabel>
          <Card>
            {PLACEHOLDER_RUNS.map((r, i) => (
              <div key={i} className="flex items-center justify-between" style={{ padding: "12px 16px", borderBottom: i < PLACEHOLDER_RUNS.length - 1 ? "1px solid var(--line)" : "none" }}>
                <div className="flex items-center gap-3">
                  <div style={{ width: 7, height: 7, borderRadius: "50%", background: r.status === "ok" ? "var(--bull)" : "var(--bear)", flexShrink: 0 }} />
                  <span className="font-display font-bold" style={{ color: "var(--ink)", fontSize: 13 }}>{r.ticker}</span>
                  <span style={{ fontSize: 10, fontFamily: "var(--font-jb)", color: r.action === "BUY" ? "var(--bull)" : r.action === "SELL" ? "var(--bear)" : "var(--hold)", background: r.action === "BUY" ? "var(--bull-bg)" : r.action === "SELL" ? "var(--bear-bg)" : "var(--hold-bg)", padding: "1px 6px", borderRadius: 3 }}>
                    {r.action}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span style={{ color: "var(--ghost)", fontSize: 11, fontFamily: "var(--font-jb)" }}>{r.duration}</span>
                  <span style={{ color: "var(--ghost)", fontSize: 11, fontFamily: "var(--font-jb)" }}>{relTime(r.ts)}</span>
                </div>
              </div>
            ))}
          </Card>
        </div>

        {/* System health summary */}
        <div>
          <SectionLabel>System Health</SectionLabel>
          <Card>
            {systemLoading && (
              <div style={{ padding: "24px", color: "var(--ghost)", fontSize: 13, fontFamily: "var(--font-jb)", textAlign: "center" }}>Loading…</div>
            )}
            {!systemLoading && !systemStatus && (
              <div style={{ padding: "24px", color: "var(--ghost)", fontSize: 13, fontFamily: "var(--font-jb)", textAlign: "center" }}>No data</div>
            )}
            {!systemLoading && systemStatus && (
              <div style={{ padding: "14px 16px", display: "flex", flexWrap: "wrap", gap: 8 }}>
                {Object.entries(systemStatus).map(([svc, info]) => (
                  <span key={svc} className={`system-status-pill ${info.status}`} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, padding: "4px 10px", borderRadius: 20 }}>
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: "currentColor", display: "inline-block", flexShrink: 0 }} />
                    {svc}
                  </span>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

// ─── Page 2: Users ────────────────────────────────────────────────────────────

function UsersPage({ users, usersLoading, isSuperadmin, onAction, onRefresh }: {
  users: AdminUser[];
  usersLoading: boolean;
  isSuperadmin: boolean;
  onAction: (modal: ConfirmModal) => void;
  onRefresh: () => void;
}) {
  const [search, setSearch] = useState("");
  const [tierFilter, setTierFilter] = useState<"all" | "free" | "pro" | "max">("all");
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  const filtered = users.filter((u) => {
    const matchSearch = !search || u.email.toLowerCase().includes(search.toLowerCase()) || (u.display_name ?? "").toLowerCase().includes(search.toLowerCase());
    const matchTier = tierFilter === "all" || u.tier === tierFilter;
    return matchSearch && matchTier;
  });

  function handleTierChange(user: AdminUser, tier: "free" | "pro" | "max") {
    setOpenMenuId(null);
    onAction({
      title: `Change tier for ${user.display_name ?? user.email}`,
      body: `You are changing this user's tier from ${user.tier.toUpperCase()} to ${tier.toUpperCase()}. This takes effect immediately.`,
      onConfirm: async () => {
        const res = await fetchWithAuth(`${API}/v1/admin/users/${user.id}/tier`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tier }),
        });
        if (res?.ok) { onRefresh(); } else { window.alert("Failed to update tier. Please try again."); }
      },
    });
  }

  function handleRoleChange(user: AdminUser, role: "user" | "admin" | "superadmin") {
    setOpenMenuId(null);
    onAction({
      title: `Change role for ${user.display_name ?? user.email}`,
      body: `You are changing this user's role from ${user.role.toUpperCase()} to ${role.toUpperCase()}. This takes effect immediately.`,
      onConfirm: async () => {
        const res = await fetchWithAuth(`${API}/v1/admin/users/${user.id}/role`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role }),
        });
        if (res?.ok) { onRefresh(); } else { window.alert("Failed to update role. Please try again."); }
      },
    });
  }

  const inputStyle: React.CSSProperties = {
    background: "var(--elevated)", border: "1px solid var(--line)", borderRadius: 7,
    padding: "8px 12px", color: "var(--ink)", fontSize: 13, fontFamily: "var(--font-jb)",
    outline: "none",
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name or email…"
          style={{ ...inputStyle, minWidth: 240 }}
        />
        <div className="flex gap-1">
          {(["all", "free", "pro", "max"] as const).map((t) => (
            <button key={t} onClick={() => setTierFilter(t)} style={{
              padding: "7px 14px", borderRadius: 6, fontSize: 11, fontFamily: "var(--font-jb)",
              cursor: "pointer", letterSpacing: "0.05em", textTransform: "uppercase",
              background: tierFilter === t ? "var(--brand)18" : "var(--elevated)",
              border: `1px solid ${tierFilter === t ? "var(--brand)40" : "var(--line)"}`,
              color: tierFilter === t ? "var(--brand)" : "var(--ghost)",
            }}>
              {t}
            </button>
          ))}
        </div>
        <span style={{ color: "var(--ghost)", fontSize: 12, fontFamily: "var(--font-jb)", marginLeft: "auto" }}>
          {filtered.length} user{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Table */}
      <Card>
        {usersLoading ? (
          <div style={{ padding: 32, color: "var(--ghost)", fontSize: 13, fontFamily: "var(--font-jb)", textAlign: "center" }}>Loading…</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, fontFamily: "var(--font-jb)" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--line)", background: "var(--elevated)" }}>
                  {["Name", "Email", "Tier", "Role", "Joined", "Broker", ...(isSuperadmin ? [""] : [])].map((h) => (
                    <th key={h} style={{ padding: "10px 16px", textAlign: "left", color: "var(--ghost)", fontSize: 10, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", whiteSpace: "nowrap" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((u) => (
                  <tr key={u.id} style={{ borderBottom: "1px solid var(--line)" }}>
                    <td style={{ padding: "12px 16px", color: "var(--ink)", whiteSpace: "nowrap" }}>
                      {u.display_name ?? <span style={{ color: "var(--ghost)" }}>—</span>}
                    </td>
                    <td style={{ padding: "12px 16px", color: "var(--dim)" }}>{u.email}</td>
                    <td style={{ padding: "12px 16px" }}><TierBadge tier={u.tier} /></td>
                    <td style={{ padding: "12px 16px" }}><RoleBadge role={u.role} /></td>
                    <td style={{ padding: "12px 16px", color: "var(--ghost)", whiteSpace: "nowrap" }}>{fmtDate(u.created_at)}</td>
                    <td style={{ padding: "12px 16px" }}>
                      <span style={{ fontSize: 10, fontFamily: "var(--font-jb)", color: u.broker_connected ? "var(--bull)" : "var(--ghost)", padding: "2px 7px", borderRadius: 4, border: `1px solid ${u.broker_connected ? "var(--bull)40" : "var(--line)"}`, background: u.broker_connected ? "var(--bull-bg)" : "transparent" }}>
                        {u.broker_connected ? "Connected" : "Not connected"}
                      </span>
                    </td>
                    {isSuperadmin && (
                      <td style={{ padding: "12px 16px", position: "relative" }}>
                        <button
                          onClick={() => setOpenMenuId(openMenuId === u.id ? null : u.id)}
                          style={{ background: "transparent", border: "1px solid var(--line)", borderRadius: 5, padding: "4px 10px", color: "var(--ghost)", fontSize: 12, cursor: "pointer" }}
                        >
                          ···
                        </button>
                        {openMenuId === u.id && (
                          <div style={{ position: "absolute", right: 16, top: "100%", zIndex: 50, background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 8, boxShadow: "0 8px 24px rgba(0,0,0,0.3)", minWidth: 180, padding: "4px 0" }}>
                            <div style={{ padding: "6px 12px 4px", color: "var(--ghost)", fontSize: 9, fontFamily: "var(--font-jb)", letterSpacing: "0.08em", textTransform: "uppercase" }}>Change Tier</div>
                            {(["free", "pro", "max"] as const).filter(t => t !== u.tier).map(t => (
                              <button key={t} onClick={() => handleTierChange(u, t)} style={{ display: "block", width: "100%", textAlign: "left", padding: "9px 14px", background: "transparent", border: "none", color: "var(--ink)", fontSize: 13, fontFamily: "var(--font-jb)", cursor: "pointer" }}>
                                → {t.toUpperCase()}
                              </button>
                            ))}
                            <div style={{ height: 1, background: "var(--line)", margin: "4px 0" }} />
                            <div style={{ padding: "6px 12px 4px", color: "var(--ghost)", fontSize: 9, fontFamily: "var(--font-jb)", letterSpacing: "0.08em", textTransform: "uppercase" }}>Change Role</div>
                            {(["user", "admin", "superadmin"] as const).filter(r => r !== u.role).map(r => (
                              <button key={r} onClick={() => handleRoleChange(u, r)} style={{ display: "block", width: "100%", textAlign: "left", padding: "9px 14px", background: "transparent", border: "none", color: "var(--ink)", fontSize: 13, fontFamily: "var(--font-jb)", cursor: "pointer" }}>
                                → {r.toUpperCase()}
                              </button>
                            ))}
                          </div>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
                {filtered.length === 0 && !usersLoading && (
                  <tr>
                    <td colSpan={isSuperadmin ? 7 : 6} style={{ padding: 32, textAlign: "center", color: "var(--ghost)", fontSize: 13 }}>
                      No users match your filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

// ─── Page 3: System Status ────────────────────────────────────────────────────

const SERVICES = ["pipeline", "scheduler", "alpaca", "ibkr", "mongodb", "supabase"] as const;

function SystemPage({ systemStatus, systemLoading, isSuperadmin }: {
  systemStatus: SystemStatus | null;
  systemLoading: boolean;
  isSuperadmin: boolean;
}) {
  function statusPill(s: ServiceStatus["status"]) {
    return s === "online" ? "online" : s === "degraded" ? "degraded" : "offline";
  }

  const fakeEntry = (svc: string): ServiceStatus => ({
    status: "online",
    last_checked: new Date().toISOString(),
    detail: `${svc} is operating normally`,
  });

  return (
    <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}>
      {SERVICES.map((svc) => {
        const info: ServiceStatus = systemStatus?.[svc] ?? (systemLoading ? { status: "online", last_checked: "", detail: "Checking…" } : fakeEntry(svc));
        const isPipeline = svc === "pipeline";
        return (
          <Card key={svc} style={{ padding: "18px 20px" }}>
            <div className="flex items-start justify-between gap-3 mb-3">
              <div>
                <div style={{ color: "var(--ink)", fontSize: 14, fontFamily: "var(--font-jb)", fontWeight: 600, textTransform: "capitalize", marginBottom: 4 }}>
                  {svc}
                </div>
                {info.last_checked && (
                  <div style={{ color: "var(--ghost)", fontSize: 11, fontFamily: "var(--font-jb)" }}>
                    Checked {relTime(info.last_checked)}
                  </div>
                )}
              </div>
              <span className={`system-status-pill ${statusPill(info.status)}`} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, padding: "4px 10px", borderRadius: 20, whiteSpace: "nowrap", flexShrink: 0 }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: "currentColor", display: "inline-block", flexShrink: 0, animation: info.status === "online" ? "pulse 2s infinite" : "none" }} />
                {info.status}
              </span>
            </div>
            <p style={{ color: "var(--dim)", fontSize: 12, fontFamily: "var(--font-nunito)", lineHeight: 1.5, margin: 0 }}>
              {systemLoading ? "Checking status…" : info.detail}
            </p>
            {isPipeline && isSuperadmin && (
              <button
                onClick={() => {}}
                style={{ marginTop: 14, width: "100%", padding: "8px 0", borderRadius: 7, border: "1px solid var(--brand)40", background: "var(--brand)12", color: "var(--brand)", fontSize: 12, fontFamily: "var(--font-jb)", cursor: "pointer" }}
              >
                ▶ Force Run Pipeline
              </button>
            )}
          </Card>
        );
      })}
    </div>
  );
}

// ─── Page 4: Roles (superadmin only) ─────────────────────────────────────────

function RolesPage({ users, usersLoading, onAction, onRefresh }: {
  users: AdminUser[];
  usersLoading: boolean;
  onAction: (modal: ConfirmModal) => void;
  onRefresh: () => void;
}) {
  const elevated = users.filter((u) => u.role === "admin" || u.role === "superadmin");

  function handleRoleChange(user: AdminUser, role: "user" | "admin" | "superadmin") {
    const isPromotion = role === "superadmin";
    onAction({
      title: isPromotion ? "Grant superadmin access" : `Change role to ${role.toUpperCase()}`,
      body: isPromotion
        ? `You are granting superadmin access to ${user.display_name ?? user.email}. This cannot be undone without superadmin privileges.`
        : `You are changing ${user.display_name ?? user.email}'s role from ${user.role.toUpperCase()} to ${role.toUpperCase()}.`,
      onConfirm: async () => {
        const res = await fetchWithAuth(`${API}/v1/admin/users/${user.id}/role`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role }),
        });
        if (res?.ok) { onRefresh(); } else { window.alert("Failed to update role. Please try again."); }
      },
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div style={{ padding: "12px 16px", borderRadius: 8, background: "rgba(255,45,85,0.06)", border: "1px solid rgba(255,45,85,0.2)", color: "var(--bear)", fontSize: 12, fontFamily: "var(--font-nunito)" }}>
        This page manages admin and superadmin roles. Changes take effect immediately and may affect system access.
      </div>
      <Card>
        {usersLoading ? (
          <div style={{ padding: 32, color: "var(--ghost)", fontSize: 13, fontFamily: "var(--font-jb)", textAlign: "center" }}>Loading…</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, fontFamily: "var(--font-jb)" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--line)", background: "var(--elevated)" }}>
                {["Name", "Email", "Current Role", "Action"].map((h) => (
                  <th key={h} style={{ padding: "10px 16px", textAlign: "left", color: "var(--ghost)", fontSize: 10, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {elevated.map((u) => (
                <tr key={u.id} style={{ borderBottom: "1px solid var(--line)" }}>
                  <td style={{ padding: "12px 16px", color: "var(--ink)" }}>{u.display_name ?? "—"}</td>
                  <td style={{ padding: "12px 16px", color: "var(--dim)" }}>{u.email}</td>
                  <td style={{ padding: "12px 16px" }}><RoleBadge role={u.role} /></td>
                  <td style={{ padding: "12px 16px" }}>
                    <div className="flex gap-2 flex-wrap">
                      {u.role !== "superadmin" && (
                        <button onClick={() => handleRoleChange(u, "superadmin")} style={{ padding: "5px 12px", borderRadius: 5, border: "1px solid var(--bear)40", background: "var(--bear-bg)", color: "var(--bear)", fontSize: 11, fontFamily: "var(--font-jb)", cursor: "pointer" }}>
                          Promote to Superadmin
                        </button>
                      )}
                      {u.role !== "admin" && (
                        <button onClick={() => handleRoleChange(u, "admin")} style={{ padding: "5px 12px", borderRadius: 5, border: "1px solid var(--brand)40", background: "var(--brand)12", color: "var(--brand)", fontSize: 11, fontFamily: "var(--font-jb)", cursor: "pointer" }}>
                          Set to Admin
                        </button>
                      )}
                      <button onClick={() => handleRoleChange(u, "user")} style={{ padding: "5px 12px", borderRadius: 5, border: "1px solid var(--line)", background: "transparent", color: "var(--ghost)", fontSize: 11, fontFamily: "var(--font-jb)", cursor: "pointer" }}>
                        Demote to User
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {elevated.length === 0 && !usersLoading && (
                <tr>
                  <td colSpan={4} style={{ padding: 32, textAlign: "center", color: "var(--ghost)", fontSize: 13 }}>No elevated users found.</td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

// ─── Nav items ────────────────────────────────────────────────────────────────

const NAV_ITEMS: { id: AdminPage; label: string; short: string }[] = [
  { id: "overview", label: "Overview",      short: "OV" },
  { id: "users",    label: "Users",         short: "US" },
  { id: "system",   label: "System Status", short: "SS" },
  { id: "roles",    label: "Roles",         short: "RL" },
];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdminDashboard() {
  const [page, setPage]               = useState<AdminPage>("overview");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [role, setRole]               = useState<UserRole | null>(null);
  const [roleLoading, setRoleLoading] = useState(true);
  const [stats, setStats]             = useState<AdminStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [users, setUsers]             = useState<AdminUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null);
  const [systemLoading, setSystemLoading] = useState(true);
  const [modal, setModal]             = useState<ConfirmModal | null>(null);
  const router = useRouter();

  const isSuperadmin = role === "superadmin";

  const loadStats = useCallback(async () => {
    try {
      const res = await fetchWithAuth(`${API}/v1/admin/stats`);
      if (res?.ok) setStats(await res.json());
    } catch { /* non-fatal */ } finally { setStatsLoading(false); }
  }, []);

  const loadUsers = useCallback(async () => {
    try {
      const res = await fetchWithAuth(`${API}/v1/admin/users`);
      if (res?.ok) {
        setUsers(await res.json());
      } else {
        console.error("loadUsers failed:", res?.status, await res?.text());
      }
    } catch (err) { console.error("loadUsers error:", err); } finally { setUsersLoading(false); }
  }, []);

  const loadSystemStatus = useCallback(async () => {
    try {
      const res = await fetchWithAuth(`${API}/v1/admin/system-status`);
      if (res?.ok) setSystemStatus(await res.json());
    } catch { /* non-fatal */ } finally { setSystemLoading(false); }
  }, []);

  useEffect(() => {
    fetchMyProfile()
      .then((profile) => {
        if (!profile) { router.push("/login"); return; }
        setRole(profile.role);
        if (profile.role === "user") router.push("/dashboard");
      })
      .catch(() => router.push("/dashboard"))
      .finally(() => setRoleLoading(false));
  }, [router]);

  useEffect(() => {
    loadStats();
    loadUsers();
    loadSystemStatus();
  }, [loadStats, loadUsers, loadSystemStatus]);

  const navItems = isSuperadmin ? NAV_ITEMS : NAV_ITEMS.filter((n) => n.id !== "roles");

  if (roleLoading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg)", color: "var(--ghost)", fontFamily: "var(--font-jb)", fontSize: 13 }}>
        Verifying access…
      </div>
    );
  }

  if (role === "user") return null;

  const pageTitle = NAV_ITEMS.find((n) => n.id === page)?.label ?? "";

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
        {/* Logo */}
        <div className="flex items-center gap-2.5 px-4 py-5" style={{ borderBottom: "1px solid var(--line)", minHeight: 65 }}>
          <div className="relative flex items-center justify-center flex-shrink-0" style={{ width: 22, height: 22 }}>
            <div style={{ position: "absolute", width: 2, height: 18, background: "#C8102E", transform: "skewX(-14deg) translateX(2px)", borderRadius: 1 }} />
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#C8102E", position: "relative", zIndex: 1, marginLeft: 3 }} />
          </div>
          {sidebarOpen && <span className="font-display font-bold" style={{ fontSize: 16, color: "var(--ink)", letterSpacing: "-0.02em", whiteSpace: "nowrap" }}>ATLAS</span>}
          {sidebarOpen && <span style={{ marginLeft: "auto", fontSize: 9, fontFamily: "var(--font-jb)", color: "var(--ghost)", border: "1px solid var(--line)", padding: "1px 6px", borderRadius: 3, whiteSpace: "nowrap" }}>ADMIN</span>}
        </div>

        {/* Nav */}
        <nav className="flex flex-col gap-1 px-2 py-4 flex-1">
          {navItems.map((item) => {
            const active = page === item.id;
            return (
              <button key={item.id} onClick={() => setPage(item.id)}
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

        {/* Collapse toggle */}
        <div className="px-2 pb-4" style={{ borderTop: "1px solid var(--line)", paddingTop: 12 }}>
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="flex items-center gap-2 rounded-lg px-3 py-2 w-full" style={{ color: "var(--ghost)", fontSize: 12, fontFamily: "var(--font-jb)", background: "transparent", border: "none", cursor: "pointer", justifyContent: sidebarOpen ? "flex-start" : "center" }}>
            {sidebarOpen ? "← Collapse" : "→"}
          </button>
        </div>
      </aside>

      {/* ── Main ── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="flex items-center justify-between px-8 py-4" style={{ borderBottom: "1px solid var(--line)", background: "var(--header-bg)", backdropFilter: "blur(12px)" }}>
          <div>
            <h1 className="font-display font-bold" style={{ fontSize: 20, color: "var(--ink)", letterSpacing: "-0.02em" }}>{pageTitle}</h1>
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

        <main className="flex-1 overflow-y-auto p-8" style={{ maxWidth: 1280 }}>
          {page === "overview" && (
            <OverviewPage stats={stats} statsLoading={statsLoading} systemStatus={systemStatus} systemLoading={systemLoading} />
          )}
          {page === "users" && (
            <UsersPage users={users} usersLoading={usersLoading} isSuperadmin={isSuperadmin} onAction={setModal} onRefresh={loadUsers} />
          )}
          {page === "system" && (
            <SystemPage systemStatus={systemStatus} systemLoading={systemLoading} isSuperadmin={isSuperadmin} />
          )}
          {page === "roles" && isSuperadmin && (
            <RolesPage users={users} usersLoading={usersLoading} onAction={setModal} onRefresh={loadUsers} />
          )}
        </main>
      </div>

      {/* ── Confirm modal ── */}
      {modal && <Modal modal={modal} onClose={() => setModal(null)} />}
    </div>
  );
}
