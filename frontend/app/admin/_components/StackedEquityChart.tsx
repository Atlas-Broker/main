"use client";

/**
 * Stacked area chart showing portfolio composition over time:
 * Cash + per-ticker position values stacked to equal total portfolio value.
 */

import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend,
} from "chart.js";
import { Line } from "react-chartjs-2";
import { businessDays } from "@/lib/bdays";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip, Legend);

type CurvePoint = {
  date: string;
  value: number;
  cash: number;
  positions?: Record<string, number>;
};

// Distinct colors for up to 10 tickers
const TICKER_COLORS = [
  "rgba(99,102,241,",   // indigo
  "rgba(16,185,129,",   // emerald
  "rgba(245,158,11,",   // amber
  "rgba(239,68,68,",    // red
  "rgba(59,130,246,",   // blue
  "rgba(168,85,247,",   // purple
  "rgba(236,72,153,",   // pink
  "rgba(20,184,166,",   // teal
  "rgba(251,146,60,",   // orange
  "rgba(132,204,22,",   // lime
];

const CASH_COLOR = "rgba(150,150,165,";

const fmtVal = (v: number) =>
  v >= 1_000_000 ? `$${(v / 1_000_000).toFixed(2)}M`
  : v >= 1_000   ? `$${(v / 1_000).toFixed(1)}K`
  : `$${v.toFixed(0)}`;

export function StackedEquityChart({
  curve,
  startDate,
  endDate,
  initialCapital,
  tickers,
}: {
  curve: CurvePoint[];
  startDate: string;
  endDate: string;
  initialCapital: number;
  tickers: string[];
}) {
  if (curve.length === 0) return null;

  const labels = businessDays(startDate, endDate);
  const byDate = new Map(curve.map((p) => [p.date, p]));

  // Collect all tickers that ever had a position
  const activeTickers = new Set<string>();
  for (const pt of curve) {
    if (pt.positions) Object.keys(pt.positions).forEach((t) => activeTickers.add(t));
  }
  // Order by the job's ticker list, then any extras
  const orderedTickers = [
    ...tickers.filter((t) => activeTickers.has(t)),
    ...[...activeTickers].filter((t) => !tickers.includes(t)),
  ];

  // Build datasets — stacked order: cash first (bottom), then tickers
  const datasets: Parameters<typeof Line>[0]["data"]["datasets"] = [];

  // Cash layer
  datasets.push({
    label: "Cash",
    data: labels.map((d) => byDate.get(d)?.cash ?? null),
    borderColor: `${CASH_COLOR}0.8)`,
    backgroundColor: `${CASH_COLOR}0.25)`,
    fill: true,
    borderWidth: 1.5,
    pointRadius: 0,
    pointHoverRadius: 3,
    spanGaps: false,
    tension: 0.1,
    // @ts-expect-error chart.js stack option
    stack: "portfolio",
  });

  // Ticker position layers
  orderedTickers.forEach((ticker, idx) => {
    const color = TICKER_COLORS[idx % TICKER_COLORS.length];
    datasets.push({
      label: ticker,
      data: labels.map((d) => byDate.get(d)?.positions?.[ticker] ?? (byDate.has(d) ? 0 : null)),
      borderColor: `${color}0.9)`,
      backgroundColor: `${color}0.35)`,
      fill: true,
      borderWidth: 1.5,
      pointRadius: 0,
      pointHoverRadius: 3,
      spanGaps: false,
      tension: 0.1,
      // @ts-expect-error chart.js stack option
      stack: "portfolio",
    });
  });

  return (
    <div style={{ background: "var(--elevated)", borderRadius: 8, padding: "14px 16px 10px" }}>
      <div style={{ fontFamily: "var(--font-jb)", fontSize: 10, color: "var(--ghost)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>
        Portfolio Composition
      </div>
      <Line
        data={{ labels, datasets }}
        options={{
          responsive: true,
          maintainAspectRatio: true,
          aspectRatio: 4.5,
          animation: false,
          interaction: { mode: "index", intersect: false },
          plugins: {
            legend: {
              display: true,
              position: "top",
              labels: {
                color: "rgba(180,180,190,0.9)",
                font: { family: "monospace", size: 10 },
                boxWidth: 10,
                padding: 12,
              },
            },
            tooltip: {
              mode: "index",
              intersect: false,
              callbacks: {
                title: (items) => items[0]?.label ?? "",
                label: (item) =>
                  item.raw != null ? `${item.dataset.label}: ${fmtVal(item.raw as number)}` : "",
              },
              backgroundColor: "rgba(15,15,20,0.9)",
              titleFont: { family: "monospace", size: 11 },
              bodyFont: { family: "monospace", size: 11 },
              padding: 10,
              borderColor: "rgba(255,255,255,0.1)",
              borderWidth: 1,
            },
          },
          scales: {
            x: {
              ticks: {
                maxTicksLimit: 6,
                color: "rgba(150,150,160,0.8)",
                font: { family: "monospace", size: 9 },
                maxRotation: 0,
              },
              grid: { color: "rgba(255,255,255,0.04)" },
            },
            y: {
              min: 0,
              suggestedMax: initialCapital * 1.1,
              stacked: true,
              ticks: {
                color: "rgba(150,150,160,0.8)",
                font: { family: "monospace", size: 9 },
                callback: (v) => fmtVal(v as number),
                maxTicksLimit: 5,
              },
              grid: { color: "rgba(255,255,255,0.04)" },
            },
          },
        }}
      />
    </div>
  );
}
