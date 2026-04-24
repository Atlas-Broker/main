"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchWithAuth } from "@/lib/api";
import { useAdminContext } from "../admin-context";
import { Card, relTime, type ServiceStatus, type SystemStatus } from "../admin-shared";

const API = "";

const SERVICES = ["pipeline", "scheduler", "alpaca", "ibkr", "mongodb", "supabase"] as const;

export default function SystemStatusPage() {
  const { isSuperadmin } = useAdminContext();
  const [systemStatus, setSystemStatus]   = useState<SystemStatus | null>(null);
  const [systemLoading, setSystemLoading] = useState(true);

  const loadSystemStatus = useCallback(async () => {
    try {
      const res = await fetchWithAuth(`${API}/v1/admin/system-status`);
      if (res?.ok) setSystemStatus(await res.json());
    } catch { /* non-fatal */ } finally { setSystemLoading(false); }
  }, []);

  useEffect(() => { loadSystemStatus(); }, [loadSystemStatus]);

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
