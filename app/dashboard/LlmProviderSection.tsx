"use client";

/**
 * LlmProviderSection — Settings tab component for configuring the default
 * LLM provider used for backtest jobs.
 *
 * Providers: Gemini (platform default) / Groq / Ollama / Custom (OpenAI-compatible)
 * Includes a "Test connection" button that calls POST /api/v1/llm/preflight.
 */

import { useState } from "react";
import { fetchWithAuth } from "@/lib/api";
import type { LLMProvider } from "@/lib/agents/llm";
import { PROVIDER_DEFAULTS } from "@/lib/agents/llm";

// ─── Types ────────────────────────────────────────────────────────────────────

type PreflightResult = {
  ok: boolean;
  provider: string;
  model: string;
  latency_ms: number;
  error?: string;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const PROVIDER_LABELS: Record<LLMProvider, string> = {
  gemini: "Gemini",
  groq: "Groq",
  ollama: "Ollama",
  "openai-compatible": "Custom",
};

const COST_ESTIMATES: {
  provider: LLMProvider;
  model: string;
  cost: string;
  time: string;
}[] = [
  { provider: "gemini",  model: "gemini-2.5-flash",        cost: "~$0.10–0.20",     time: "~4–6 min" },
  { provider: "groq",    model: "llama-3.3-70b-versatile", cost: "Free (rate limit)", time: "~2–4 min" },
  { provider: "ollama",  model: "gemma3:12b",               cost: "Free",             time: "~20–30 min" },
];

// ─── Styles ───────────────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "9px 12px",
  borderRadius: 8,
  border: "1px solid var(--line)",
  background: "var(--elevated)",
  color: "var(--ink)",
  fontSize: 13,
  fontFamily: "var(--font-jb)",
  outline: "none",
  boxSizing: "border-box",
};

// ─── Component ────────────────────────────────────────────────────────────────

export function LlmProviderSection() {
  const [provider, setProvider] = useState<LLMProvider>("gemini");
  const [model, setModel] = useState<string>(PROVIDER_DEFAULTS.gemini.quick);
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [showCosts, setShowCosts] = useState(false);
  const [testing, setTesting] = useState(false);
  const [preflightResult, setPreflightResult] = useState<PreflightResult | null>(null);

  function handleProviderChange(next: LLMProvider) {
    setProvider(next);
    setModel(PROVIDER_DEFAULTS[next].quick);
    setPreflightResult(null);
  }

  async function handleTest() {
    setTesting(true);
    setPreflightResult(null);
    try {
      const res = await fetchWithAuth("/api/v1/llm/preflight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          model,
          ...(baseUrl ? { baseUrl } : {}),
          ...(apiKey ? { apiKey } : {}),
        }),
      });
      if (!res) return;
      const data = (await res.json()) as PreflightResult;
      setPreflightResult(data);
    } catch {
      setPreflightResult({
        ok: false,
        provider,
        model,
        latency_ms: 0,
        error: "Network error — could not reach the server.",
      });
    } finally {
      setTesting(false);
    }
  }

  return (
    <div>
      <div style={{ color: "var(--ghost)", fontSize: 11, fontFamily: "var(--font-jb)", marginBottom: 10 }}>
        LLM PROVIDER (BACKTEST)
      </div>

      <div style={{
        background: "var(--surface)",
        border: "1px solid var(--line)",
        borderRadius: 10,
        overflow: "hidden",
        boxShadow: "var(--card-shadow)",
      }}>
        {/* Live trading lock row */}
        <div style={{
          padding: "12px 16px",
          borderBottom: "1px solid var(--line)",
          background: "var(--elevated)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
        }}>
          <div>
            <div style={{ color: "var(--dim)", fontSize: 13, fontFamily: "var(--font-nunito)", fontWeight: 600 }}>
              Live trading
            </div>
            <div style={{ color: "var(--ghost)", fontSize: 11, fontFamily: "var(--font-jb)", marginTop: 2 }}>
              Gemini 2.5 Flash · platform default
            </div>
          </div>
          <span
            title="Live trading always uses the platform Gemini model for consistency and auditability."
            style={{
              fontSize: 9,
              fontFamily: "var(--font-jb)",
              color: "var(--ghost)",
              border: "1px solid var(--line)",
              padding: "2px 6px",
              borderRadius: 4,
              textTransform: "uppercase" as const,
              letterSpacing: "0.06em",
              cursor: "help",
              flexShrink: 0,
            }}
          >
            Locked
          </span>
        </div>

        <div style={{ padding: "16px" }}>
          {/* Provider segmented control */}
          <div style={{ fontFamily: "var(--font-jb)", fontSize: 10, color: "var(--ghost)", marginBottom: 8, letterSpacing: "0.06em" }}>
            BACKTEST PROVIDER
          </div>
          <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
            {(["gemini", "groq", "ollama", "openai-compatible"] as LLMProvider[]).map((p) => {
              const active = provider === p;
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => handleProviderChange(p)}
                  style={{
                    flex: 1,
                    padding: "7px 4px",
                    borderRadius: 6,
                    border: `1px solid ${active ? "var(--brand)" : "var(--line)"}`,
                    background: active ? "var(--brand)18" : "transparent",
                    color: active ? "var(--brand)" : "var(--ghost)",
                    fontSize: 11,
                    fontFamily: "var(--font-jb)",
                    cursor: "pointer",
                    fontWeight: active ? 600 : 400,
                    transition: "all 0.12s",
                    whiteSpace: "nowrap" as const,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {PROVIDER_LABELS[p]}
                </button>
              );
            })}
          </div>

          {/* Model input — always visible */}
          <div style={{ marginBottom: 10 }}>
            <label style={{ display: "block", color: "var(--ghost)", fontSize: 10, fontFamily: "var(--font-jb)", marginBottom: 5, letterSpacing: "0.06em" }}>
              MODEL
            </label>
            <input
              type="text"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder={PROVIDER_DEFAULTS[provider].quick || "model-name"}
              style={inputStyle}
            />
          </div>

          {/* Groq API key */}
          {provider === "groq" && (
            <div style={{ marginBottom: 10 }}>
              <label style={{ display: "block", color: "var(--ghost)", fontSize: 10, fontFamily: "var(--font-jb)", marginBottom: 5, letterSpacing: "0.06em" }}>
                GROQ API KEY
              </label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="gsk_…"
                autoComplete="off"
                style={inputStyle}
              />
            </div>
          )}

          {/* Ollama base URL */}
          {provider === "ollama" && (
            <div style={{ marginBottom: 10 }}>
              <label style={{ display: "block", color: "var(--ghost)", fontSize: 10, fontFamily: "var(--font-jb)", marginBottom: 5, letterSpacing: "0.06em" }}>
                OLLAMA BASE URL
              </label>
              <input
                type="text"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="http://localhost:11434"
                style={inputStyle}
              />
            </div>
          )}

          {/* Custom endpoint */}
          {provider === "openai-compatible" && (
            <>
              <div style={{ marginBottom: 10 }}>
                <label style={{ display: "block", color: "var(--ghost)", fontSize: 10, fontFamily: "var(--font-jb)", marginBottom: 5, letterSpacing: "0.06em" }}>
                  BASE URL
                </label>
                <input
                  type="text"
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  placeholder="https://api.your-provider.com/v1"
                  style={inputStyle}
                />
              </div>
              <div style={{ marginBottom: 10 }}>
                <label style={{ display: "block", color: "var(--ghost)", fontSize: 10, fontFamily: "var(--font-jb)", marginBottom: 5, letterSpacing: "0.06em" }}>
                  API KEY
                </label>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="sk-…"
                  autoComplete="off"
                  style={inputStyle}
                />
              </div>
            </>
          )}

          {/* Test connection */}
          <button
            type="button"
            onClick={handleTest}
            disabled={testing || !model.trim()}
            style={{
              width: "100%",
              padding: "9px 0",
              borderRadius: 8,
              border: "1px solid var(--brand)50",
              background: testing ? "var(--elevated)" : "var(--brand)14",
              color: "var(--brand)",
              fontSize: 13,
              fontFamily: "var(--font-nunito)",
              fontWeight: 600,
              cursor: testing || !model.trim() ? "not-allowed" : "pointer",
              opacity: testing || !model.trim() ? 0.6 : 1,
              marginBottom: preflightResult ? 10 : 0,
              transition: "opacity 0.15s",
            }}
          >
            {testing ? "Testing…" : "Test connection"}
          </button>

          {/* Preflight result */}
          {preflightResult && (
            <div style={{
              padding: "10px 12px",
              borderRadius: 8,
              border: `1px solid ${preflightResult.ok ? "var(--bull)" : "var(--bear)"}30`,
              background: preflightResult.ok ? "var(--bull-bg)" : "var(--bear-bg)",
              color: preflightResult.ok ? "var(--bull)" : "var(--bear)",
              fontSize: 12,
              fontFamily: "var(--font-nunito)",
            }}>
              {preflightResult.ok
                ? `Connected — ${preflightResult.latency_ms}ms`
                : preflightResult.error ?? "Connection failed"}
            </div>
          )}
        </div>

        {/* Cost / time estimate table */}
        <div style={{ borderTop: "1px solid var(--line)" }}>
          <button
            type="button"
            onClick={() => setShowCosts((v) => !v)}
            style={{
              width: "100%",
              padding: "10px 16px",
              background: "transparent",
              border: "none",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              color: "var(--ghost)",
              fontSize: 11,
              fontFamily: "var(--font-jb)",
              letterSpacing: "0.04em",
            }}
          >
            <span>COST ESTIMATES (90-day · 5-ticker)</span>
            <span>{showCosts ? "↑" : "↓"}</span>
          </button>

          {showCosts && (
            <div style={{ padding: "0 16px 14px" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, fontFamily: "var(--font-jb)" }}>
                <thead>
                  <tr>
                    {["Provider", "Model", "Est. cost", "Est. time"].map((h) => (
                      <th key={h} style={{ color: "var(--ghost)", textAlign: "left" as const, paddingBottom: 6, fontWeight: 500 }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {COST_ESTIMATES.map((row) => (
                    <tr key={row.provider} style={{ borderTop: "1px solid var(--line)" }}>
                      <td style={{ padding: "7px 0", color: provider === row.provider ? "var(--brand)" : "var(--dim)" }}>
                        {PROVIDER_LABELS[row.provider]}
                      </td>
                      <td style={{ padding: "7px 8px 7px 0", color: "var(--ghost)" }}>{row.model}</td>
                      <td style={{ padding: "7px 8px 7px 0", color: "var(--dim)" }}>{row.cost}</td>
                      <td style={{ padding: "7px 0", color: "var(--dim)" }}>{row.time}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
