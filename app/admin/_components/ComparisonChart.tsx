"use client";

/**
 * Multi-series equity chart for experiment comparison.
 *
 * Each job is a separate dataset (line) with its own color.
 * X axis spans the full experiment date range; lines stop where data ends.
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

export type ChartSeries = {
  label: string;
  color: string;
  curve: { date: string; value: number }[];
};

const THRESHOLD_COLORS: Record<string, string> = {
  "50":  "#3b82f6",
  "65":  "#10b981",
  "80":  "#f59e0b",
  "95":  "#8b5cf6",
};

export function jobColor(
  philosophyMode: string | null | undefined,
  confidenceThreshold: number | null | undefined,
  index: number,
): string {
  if (philosophyMode) {
    const map: Record<string, string> = {
      lynch:    "#6366f1",
      soros:    "#f59e0b",
      buffett:  "#10b981",
      balanced: "#3b82f6",
    };
    return map[philosophyMode] ?? "#3b82f6";
  }
  if (confidenceThreshold != null) {
    const key = Math.round(confidenceThreshold * 100).toString();
    return THRESHOLD_COLORS[key] ?? "#3b82f6";
  }
  const fallbacks = ["#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#ef4444", "#6366f1"];
  return fallbacks[index % fallbacks.length];
}

export function ComparisonChart({
  series,
  startDate,
  endDate,
  initialCapital,
}: {
  series: ChartSeries[];
  startDate: string;
  endDate: string;
  initialCapital: number;
}) {
  if (series.length === 0) return null;

  const labels = businessDays(startDate, endDate);

  const fmtVal = (v: number) =>
    v >= 1_000_000 ? `$${(v / 1_000_000).toFixed(2)}M`
    : v >= 1_000   ? `$${(v / 1_000).toFixed(1)}K`
    : `$${v.toFixed(0)}`;

  const datasets = series.map((s) => {
    const byDate = new Map(s.curve.map((p) => [p.date, p.value]));
    const data = labels.map((d) => byDate.get(d) ?? null);
    return {
      label: s.label,
      data,
      borderColor: s.color,
      backgroundColor: "transparent",
      borderWidth: 1.5,
      pointRadius: 0,
      pointHoverRadius: 4,
      pointHoverBackgroundColor: s.color,
      spanGaps: false,
      tension: 0.2,
    };
  });

  // Baseline (initial capital) as a dashed reference line
  datasets.unshift({
    label: `Start ($${(initialCapital / 1000).toFixed(0)}K)`,
    data: labels.map(() => initialCapital),
    borderColor: "rgba(150,150,160,0.3)",
    backgroundColor: "transparent",
    borderWidth: 1,
    // @ts-expect-error chart.js extended option
    borderDash: [4, 4],
    pointRadius: 0,
    pointHoverRadius: 0,
    spanGaps: true,
    tension: 0,
  });

  return (
    <div style={{ background: "var(--elevated)", borderRadius: 8, padding: "14px 16px 10px" }}>
      <div style={{ fontFamily: "var(--font-jb)", fontSize: 10, color: "var(--ghost)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>
        Equity Curve Comparison
      </div>

      <Line
        data={{ labels, datasets }}
        options={{
          responsive: true,
          maintainAspectRatio: true,
          aspectRatio: 4,
          animation: false,
          interaction: { mode: "index", intersect: false },
          plugins: {
            legend: {
              display: true,
              position: "top",
              labels: {
                color: "rgba(180,180,190,0.9)",
                font: { family: "monospace", size: 10 },
                boxWidth: 12,
                padding: 14,
                filter: (item) => item.text !== `Start ($${(initialCapital / 1000).toFixed(0)}K)`,
              },
            },
            tooltip: {
              mode: "index",
              intersect: false,
              callbacks: {
                title: (items) => items[0]?.label ?? "",
                label: (item) =>
                  item.raw != null
                    ? `${item.dataset.label}: ${fmtVal(item.raw as number)}`
                    : "",
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
