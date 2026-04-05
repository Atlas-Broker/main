"use client";
import React from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

export type AdminStats = {
  total_users: number;
  free_count: number;
  pro_count: number;
  max_count: number;
  signals_today: number;
  executions_today: number;
};

export type AdminUser = {
  id: string;
  display_name: string | null;
  email: string;
  tier: "free" | "pro" | "max";
  role: "user" | "admin" | "superadmin";
  created_at: string;
  broker_connected: boolean;
};

export type ServiceStatus = {
  status: "online" | "degraded" | "offline";
  last_checked: string;
  detail: string;
};

export type SystemStatus = Record<string, ServiceStatus>;

export type ConfirmModal = {
  title: string;
  body: string;
  onConfirm: () => Promise<void> | void;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function relTime(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  const h = Math.floor(ms / 3600000);
  if (h < 1) return `${Math.floor(ms / 60000)}m ago`;
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// ─── UI Atoms ─────────────────────────────────────────────────────────────────

export function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 10, overflow: "hidden", ...style }}>
      {children}
    </div>
  );
}

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ color: "var(--ghost)", fontSize: 10, fontFamily: "var(--font-jb)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 12 }}>
      {children}
    </div>
  );
}

export function StatCard({ label, value, sub, sparkline }: { label: string; value: string | number; sub?: string; sparkline?: number[] }) {
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

export function TierBadge({ tier }: { tier: "free" | "pro" | "max" }) {
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

export function RoleBadge({ role }: { role: string }) {
  const color = role === "superadmin" ? "var(--bear)" : role === "admin" ? "var(--brand)" : "var(--ghost)";
  return (
    <span style={{ fontSize: 10, fontFamily: "var(--font-jb)", color, background: `${color}15`, border: `1px solid ${color}40`, padding: "2px 7px", borderRadius: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>
      {role}
    </span>
  );
}

export function Modal({ modal, onClose }: { modal: ConfirmModal; onClose: () => void }) {
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
