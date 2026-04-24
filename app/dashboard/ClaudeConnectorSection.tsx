"use client";

import { useEffect, useState } from "react";
import { fetchWithAuth } from "@/lib/api";

type Scope = "read" | "write" | "read_write";

type PAT = {
  id: string;
  name: string;
  scope: Scope;
  last_used_at: string | null;
  created_at: string;
  expires_at: string | null;
};

const SCOPE_LABEL: Record<Scope, string> = {
  read: "Read",
  write: "Write",
  read_write: "Read + Write",
};

const SCOPE_COLOR: Record<Scope, string> = {
  read: "var(--brand)",
  write: "var(--bear)",
  read_write: "var(--bull)",
};

const SCOPES: { id: Scope; label: string; desc: string }[] = [
  {
    id: "read",
    label: "Read",
    desc: "Claude can inspect signals, portfolio, and backtests. Cannot trigger actions.",
  },
  {
    id: "write",
    label: "Write",
    desc: "Claude can run pipelines, create backtests, approve/reject signals. Cannot read data.",
  },
  {
    id: "read_write",
    label: "Read + Write",
    desc: "Full access matching your role. Recommended for personal use.",
  },
];

const MCP_URL = "https://atlas-broker-uat.vercel.app/api/mcp/atlas";

function formatRelative(iso: string | null): string {
  if (!iso) return "Never";
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ─── Generate sub-view ────────────────────────────────────────────────────────

function GenerateView({
  onBack,
  onCreated,
}: {
  onBack: () => void;
  onCreated: (pat: PAT) => void;
}) {
  const [view, setView] = useState<"form" | "token">("form");
  const [name, setName] = useState("");
  const [scope, setScope] = useState<Scope>("read_write");
  const [submitting, setSubmitting] = useState(false);
  const [rawToken, setRawToken] = useState("");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  async function handleCreate() {
    if (!name.trim()) { setError("Name is required"); return; }
    setSubmitting(true);
    setError("");
    try {
      const res = await fetchWithAuth("/v1/pats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), scope }),
      });
      if (!res) throw new Error("Network error");
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Failed to create token"); return; }
      setRawToken(data.raw_token);
      onCreated({ id: data.id, name: data.name, scope: data.scope, last_used_at: null, created_at: data.created_at, expires_at: data.expires_at });
      setView("token");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setSubmitting(false);
    }
  }

  function copyToken() {
    navigator.clipboard.writeText(rawToken).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  if (view === "token") {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ghost)", fontSize: 20, padding: 0, lineHeight: 1 }}
          >
            ←
          </button>
          <span style={{ color: "var(--ink)", fontSize: 16, fontFamily: "var(--font-nunito)", fontWeight: 700 }}>Token Created</span>
        </div>

        <div style={{
          background: "rgba(22,163,74,0.08)", border: "1px solid rgba(22,163,74,0.25)",
          borderRadius: 10, padding: "14px 16px",
        }}>
          <div style={{ color: "var(--bull)", fontSize: 12, fontFamily: "var(--font-nunito)", fontWeight: 700, marginBottom: 4 }}>
            Copy this token now — it will not be shown again.
          </div>
          <div style={{ color: "var(--ghost)", fontSize: 11, fontFamily: "var(--font-nunito)" }}>
            If you lose it, revoke and generate a new one.
          </div>
        </div>

        <div style={{ background: "var(--elevated)", border: "1px solid var(--line)", borderRadius: 8, padding: "12px 14px" }}>
          <div style={{
            fontFamily: "var(--font-jb)", fontSize: 11, color: "var(--ink)",
            wordBreak: "break-all" as const, lineHeight: 1.6,
          }}>
            {rawToken}
          </div>
        </div>

        <button
          onClick={copyToken}
          style={{
            width: "100%", padding: "12px", borderRadius: 10, border: "none",
            background: copied ? "var(--elevated)" : "var(--brand)",
            color: copied ? "var(--ghost)" : "#fff",
            fontSize: 14, fontFamily: "var(--font-nunito)", fontWeight: 700, cursor: "pointer",
            transition: "background 0.15s, color 0.15s",
          }}
        >
          {copied ? "Copied!" : "Copy Token"}
        </button>

        <div style={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 10, padding: "14px 16px" }}>
          <div style={{ color: "var(--ghost)", fontSize: 11, fontFamily: "var(--font-jb)", marginBottom: 8, letterSpacing: "0.08em", textTransform: "uppercase" as const }}>
            Add to Claude
          </div>
          <div style={{ fontSize: 12, fontFamily: "var(--font-nunito)", color: "var(--dim)", lineHeight: 1.6 }}>
            In Claude settings → Connectors → Add connector:
          </div>
          <div style={{ marginTop: 8, fontFamily: "var(--font-jb)", fontSize: 11, color: "var(--ink)" }}>
            URL: <span style={{ color: "var(--brand)" }}>{MCP_URL}</span>
          </div>
          <div style={{ fontFamily: "var(--font-jb)", fontSize: 11, color: "var(--ink)" }}>
            Auth: <span style={{ color: "var(--brand)" }}>Bearer {"<your token>"}</span>
          </div>
        </div>

        <button
          onClick={onBack}
          style={{
            width: "100%", padding: "12px", borderRadius: 10,
            border: "1px solid var(--line)", background: "var(--surface)",
            color: "var(--ghost)", fontSize: 14, fontFamily: "var(--font-nunito)", fontWeight: 600, cursor: "pointer",
          }}
        >
          Done
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ghost)", fontSize: 20, padding: 0, lineHeight: 1 }}
        >
          ←
        </button>
        <span style={{ color: "var(--ink)", fontSize: 16, fontFamily: "var(--font-nunito)", fontWeight: 700 }}>Generate Token</span>
      </div>

      {/* Name */}
      <div>
        <div style={{ color: "var(--ghost)", fontSize: 11, fontFamily: "var(--font-jb)", marginBottom: 8, letterSpacing: "0.08em", textTransform: "uppercase" as const }}>
          Name
        </div>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. My Claude"
          maxLength={64}
          style={{
            width: "100%", padding: "12px 14px", borderRadius: 10,
            border: "1px solid var(--line)", background: "var(--surface)",
            color: "var(--ink)", fontSize: 14, fontFamily: "var(--font-nunito)",
            outline: "none", boxSizing: "border-box" as const,
          }}
        />
      </div>

      {/* Scope */}
      <div>
        <div style={{ color: "var(--ghost)", fontSize: 11, fontFamily: "var(--font-jb)", marginBottom: 8, letterSpacing: "0.08em", textTransform: "uppercase" as const }}>
          Permissions
        </div>
        <div className="flex flex-col gap-2">
          {SCOPES.map((s) => {
            const selected = scope === s.id;
            return (
              <button
                key={s.id}
                onClick={() => setScope(s.id)}
                className="text-left w-full"
                style={{
                  background: selected ? "var(--elevated)" : "var(--surface)",
                  border: `1px solid ${selected ? SCOPE_COLOR[s.id] : "var(--line)"}`,
                  borderRadius: 10, padding: "12px 14px", cursor: "pointer",
                }}
              >
                <div className="flex items-center justify-between mb-1">
                  <span style={{ fontSize: 14, fontFamily: "var(--font-nunito)", fontWeight: 700, color: selected ? SCOPE_COLOR[s.id] : "var(--dim)" }}>
                    {s.label}
                  </span>
                  {selected && <div style={{ width: 7, height: 7, borderRadius: "50%", background: SCOPE_COLOR[s.id] }} />}
                </div>
                <p style={{ color: "var(--ghost)", fontSize: 12, fontFamily: "var(--font-nunito)", margin: 0 }}>{s.desc}</p>
              </button>
            );
          })}
        </div>
      </div>

      {error && (
        <div style={{ color: "var(--bear)", fontSize: 12, fontFamily: "var(--font-nunito)" }}>{error}</div>
      )}

      <button
        onClick={handleCreate}
        disabled={submitting}
        style={{
          width: "100%", padding: "12px", borderRadius: 10, border: "none",
          background: submitting ? "var(--line2)" : "var(--brand)",
          color: submitting ? "var(--ghost)" : "#fff",
          fontSize: 14, fontFamily: "var(--font-nunito)", fontWeight: 700, cursor: submitting ? "default" : "pointer",
          transition: "background 0.15s",
        }}
      >
        {submitting ? "Generating…" : "Generate Token"}
      </button>
    </div>
  );
}

// ─── Main section ─────────────────────────────────────────────────────────────

export function ClaudeConnectorSection() {
  const [view, setView] = useState<"list" | "generate">("list");
  const [pats, setPats] = useState<PAT[]>([]);
  const [loading, setLoading] = useState(true);
  const [revoking, setRevoking] = useState<string | null>(null);

  useEffect(() => {
    fetchWithAuth("/v1/pats")
      .then((r) => r?.json())
      .then((data) => { if (Array.isArray(data)) setPats(data); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleRevoke(id: string) {
    setRevoking(id);
    try {
      await fetchWithAuth(`/v1/pats/${id}`, { method: "DELETE" });
      setPats((prev) => prev.filter((p) => p.id !== id));
    } catch {
      // non-fatal
    } finally {
      setRevoking(null);
    }
  }

  if (view === "generate") {
    return (
      <GenerateView
        onBack={() => setView("list")}
        onCreated={(pat) => {
          setPats((prev) => [pat, ...prev]);
          setView("list");
        }}
      />
    );
  }

  return (
    <div>
      <div style={{ color: "var(--ghost)", fontSize: 11, fontFamily: "var(--font-jb)", marginBottom: 10, letterSpacing: "0.08em", textTransform: "uppercase" as const }}>
        Claude Connector
      </div>
      <div style={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 10, overflow: "hidden", boxShadow: "var(--card-shadow)" }}>
        {/* Header */}
        <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--line)" }}>
          <div style={{ fontSize: 13, fontFamily: "var(--font-nunito)", color: "var(--dim)", lineHeight: 1.5 }}>
            Generate a token to connect Claude to your Atlas account.
          </div>
        </div>

        {/* PAT list */}
        {loading ? (
          <div style={{ padding: "14px 16px", color: "var(--ghost)", fontSize: 12, fontFamily: "var(--font-jb)" }}>
            Loading…
          </div>
        ) : pats.length === 0 ? (
          <div style={{ padding: "14px 16px", color: "var(--ghost)", fontSize: 12, fontFamily: "var(--font-nunito)" }}>
            No tokens yet.
          </div>
        ) : (
          pats.map((pat) => (
            <div key={pat.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", borderTop: "1px solid var(--line)" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontFamily: "var(--font-nunito)", fontWeight: 700, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
                  {pat.name}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
                  <span style={{
                    fontSize: 9, fontFamily: "var(--font-jb)", fontWeight: 700,
                    color: SCOPE_COLOR[pat.scope], border: `1px solid ${SCOPE_COLOR[pat.scope]}30`,
                    padding: "1px 5px", borderRadius: 3, textTransform: "uppercase" as const, letterSpacing: "0.05em",
                  }}>
                    {SCOPE_LABEL[pat.scope]}
                  </span>
                  <span style={{ fontSize: 10, fontFamily: "var(--font-jb)", color: "var(--ghost)" }}>
                    {pat.last_used_at ? `Used ${formatRelative(pat.last_used_at)}` : "Never used"}
                  </span>
                </div>
              </div>
              <button
                onClick={() => handleRevoke(pat.id)}
                disabled={revoking === pat.id}
                style={{
                  flexShrink: 0, padding: "4px 10px", borderRadius: 6,
                  border: "1px solid var(--line)", background: "transparent",
                  color: revoking === pat.id ? "var(--ghost)" : "var(--bear)",
                  fontSize: 11, fontFamily: "var(--font-jb)", cursor: revoking === pat.id ? "default" : "pointer",
                }}
              >
                {revoking === pat.id ? "…" : "Revoke"}
              </button>
            </div>
          ))
        )}

        {/* Generate button */}
        <div style={{ padding: "12px 16px", borderTop: pats.length > 0 ? "1px solid var(--line)" : undefined }}>
          <button
            onClick={() => setView("generate")}
            style={{
              width: "100%", padding: "10px", borderRadius: 8, border: "1px solid var(--brand)",
              background: "transparent", color: "var(--brand)",
              fontSize: 13, fontFamily: "var(--font-nunito)", fontWeight: 700, cursor: "pointer",
            }}
          >
            + Generate Token
          </button>
        </div>
      </div>
    </div>
  );
}
