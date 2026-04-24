"use client";

import { useState } from "react";
import { BacktestTab } from "@/app/dashboard/BacktestTab";
import { BacktestComparisonView } from "@/app/admin/BacktestComparisonView";
import { useAdminContext } from "../admin-context";

export default function BacktestingPage() {
  const { role } = useAdminContext();
  const [subTab, setSubTab] = useState<"experiments" | "jobs">("experiments");

  return (
    <div className="flex flex-col gap-4">
      {/* Sub-tab pills */}
      <div className="flex items-center gap-2">
        {(["experiments", "jobs"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setSubTab(tab)}
            style={{
              padding: "7px 16px",
              borderRadius: 20,
              fontSize: 12,
              fontFamily: "var(--font-jb)",
              fontWeight: subTab === tab ? 700 : 400,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
              border: `1px solid ${subTab === tab ? "var(--brand)40" : "var(--line)"}`,
              background: subTab === tab ? "var(--brand)18" : "var(--elevated)",
              color: subTab === tab ? "var(--brand)" : "var(--ghost)",
              cursor: "pointer",
              transition: "all 0.15s",
            }}
          >
            {tab === "jobs" ? "Jobs" : "Experiments"}
          </button>
        ))}
      </div>

      {subTab === "jobs"        && <BacktestTab role={role ?? undefined} />}
      {subTab === "experiments" && <BacktestComparisonView />}
    </div>
  );
}
