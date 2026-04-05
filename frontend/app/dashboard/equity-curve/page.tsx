// frontend/app/dashboard/equity-curve/page.tsx
"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { fetchEquityCurve, type EquityCurvePoint } from "@/lib/api";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

function sparkPath(points: EquityCurvePoint[], width: number, height: number): string {
  if (points.length < 2) return "";
  const values = points.map((p) => p.value);
  const minV = Math.min(...values);
  const maxV = Math.max(...values);
  const range = maxV - minV || 1;
  const xs = points.map((_, i) => (i / (points.length - 1)) * width);
  const ys = points.map((p) => height - ((p.value - minV) / range) * height * 0.9 - height * 0.05);
  return xs.map((x, i) => `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${ys[i].toFixed(1)}`).join(" ");
}

function EquityCurveContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rangeParam = searchParams.get("range") ?? "all";
  const [points, setPoints] = useState<EquityCurvePoint[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchEquityCurve(API_URL).then((data) => {
      setPoints(data);
      setLoading(false);
    });
  }, []);

  const last = points[points.length - 1];
  // Find the first point with a nonzero value as the baseline (avoids Infinity when starting with 0 cash)
  const first = points.find((p) => p.value > 0) ?? points[0];
  const totalReturn = last && first && first.value > 0 ? ((last.value - first.value) / first.value) * 100 : 0;
  const positive = totalReturn >= 0;

  return (
    <div style={{ background: "var(--bg)", minHeight: "100vh", maxWidth: 520, margin: "0 auto" }}>
      {/* Header */}
      <header style={{
        background: "var(--header-bg)", backdropFilter: "blur(12px)",
        borderBottom: "1px solid var(--line)", padding: "16px 20px",
        display: "flex", alignItems: "center", gap: 12, position: "sticky", top: 0, zIndex: 20,
      }}>
        <button onClick={() => router.back()} style={{
          background: "transparent", border: "none", cursor: "pointer",
          color: "var(--ghost)", fontSize: 20, padding: 0, lineHeight: 1,
        }}>←</button>
        <span className="font-display font-bold" style={{ fontSize: 17, color: "var(--ink)" }}>
          {rangeParam === "1d" ? "Today" : "All-Time"} Equity Curve
        </span>
      </header>

      <main style={{ padding: "24px 20px" }}>
        {loading ? (
          <div style={{ color: "var(--ghost)", fontSize: 13, textAlign: "center", paddingTop: 48 }}>Loading…</div>
        ) : points.length === 0 ? (
          <div style={{ color: "var(--ghost)", fontSize: 13, textAlign: "center", paddingTop: 48 }}>No equity data yet.</div>
        ) : (
          <>
            {/* Return headline */}
            <div style={{ marginBottom: 24 }}>
              <div style={{ color: "var(--ghost)", fontSize: 11, fontFamily: "var(--font-mono)", marginBottom: 4 }}>TOTAL RETURN</div>
              <div className="num font-display font-bold" style={{
                fontSize: 42, letterSpacing: "-0.03em",
                color: positive ? "var(--bull)" : "var(--bear)",
              }}>
                {positive ? "+" : ""}{totalReturn.toFixed(2)}%
              </div>
            </div>

            {/* SVG chart with axes */}
            <div style={{
              background: "var(--surface)", border: "1px solid var(--line)",
              borderRadius: 12, padding: "16px 16px 8px 8px", marginBottom: 24, overflow: "hidden",
            }}>
              {(() => {
                const W = 460, H = 140, PAD_L = 52, PAD_B = 28, PAD_T = 8;
                const plotW = W - PAD_L;
                const plotH = H - PAD_B - PAD_T;
                const values = points.map(p => p.value);
                const minV = Math.min(...values);
                const maxV = Math.max(...values);
                const range = maxV - minV || 1;
                // Y gridlines: 4 levels
                const yTicks = [0, 0.33, 0.66, 1].map(t => ({
                  frac: t,
                  val: minV + t * range,
                  y: PAD_T + plotH - t * plotH,
                }));
                // X ticks: ~5 date labels spread evenly
                const xStep = Math.max(1, Math.floor((points.length - 1) / 4));
                const xTicks = points
                  .map((p, i) => ({ i, label: new Date(p.date).toLocaleDateString("en-US", { month: "short", day: "numeric" }) }))
                  .filter((_,i) => i % xStep === 0 || i === points.length - 1);
                // Build path in plot coords
                const path = points.map((p, i) => {
                  const x = PAD_L + (i / (points.length - 1)) * plotW;
                  const y = PAD_T + plotH - ((p.value - minV) / range) * plotH;
                  return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
                }).join(" ");
                const lineColor = positive ? "var(--bull)" : "var(--bear)";
                return (
                  <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }}>
                    {/* Y gridlines + labels */}
                    {yTicks.map(({ val, y }, i) => (
                      <g key={i}>
                        <line x1={PAD_L} x2={W} y1={y} y2={y} stroke="var(--line)" strokeWidth={0.5} strokeDasharray="3,3" />
                        <text x={PAD_L - 4} y={y + 3.5} textAnchor="end" fontSize={8} fontFamily="var(--font-jb)" fill="var(--ghost)">
                          ${val >= 1000 ? `${(val / 1000).toFixed(1)}k` : val.toFixed(0)}
                        </text>
                      </g>
                    ))}
                    {/* X date labels */}
                    {xTicks.map(({ i, label }) => {
                      const x = PAD_L + (i / (points.length - 1)) * plotW;
                      return (
                        <text key={i} x={x} y={H - 6} textAnchor="middle" fontSize={8} fontFamily="var(--font-jb)" fill="var(--ghost)">
                          {label}
                        </text>
                      );
                    })}
                    {/* Equity line */}
                    <path d={path} fill="none" stroke={lineColor} strokeWidth={2} strokeLinejoin="round" />
                  </svg>
                );
              })()}
            </div>

            {/* Key stats */}
            <div style={{
              background: "var(--surface)", border: "1px solid var(--line)",
              borderRadius: 12, padding: "16px 20px",
            }}>
              <div style={{ color: "var(--ghost)", fontSize: 10, fontFamily: "var(--font-mono)", marginBottom: 12, letterSpacing: "0.06em" }}>KEY STATS</div>
              <div className="grid grid-cols-3 gap-4">
                {[
                  { label: "Current", value: last ? `$${last.value.toLocaleString("en-US", { maximumFractionDigits: 0 })}` : "—" },
                  { label: "Peak",    value: points.length ? `$${Math.max(...points.map(p => p.value)).toLocaleString("en-US", { maximumFractionDigits: 0 })}` : "—" },
                  { label: "Days",    value: String(points.length) },
                ].map((s) => (
                  <div key={s.label} className="text-center">
                    <div style={{ color: "var(--ghost)", fontSize: 10, fontFamily: "var(--font-mono)", marginBottom: 4 }}>{s.label.toUpperCase()}</div>
                    <div className="num" style={{ color: "var(--ink)", fontSize: 14, fontWeight: 600 }}>{s.value}</div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

export default function EquityCurvePage() {
  return (
    <Suspense fallback={null}>
      <EquityCurveContent />
    </Suspense>
  );
}
