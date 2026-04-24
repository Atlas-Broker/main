"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchWithAuth } from "@/lib/api";
import { useAdminContext } from "../admin-context";
import { Card, TierBadge, RoleBadge, Modal, fmtDate, type AdminUser, type ConfirmModal } from "../admin-shared";

const API = "";

const inputStyle: React.CSSProperties = {
  background: "var(--elevated)", border: "1px solid var(--line)", borderRadius: 7,
  padding: "8px 12px", color: "var(--ink)", fontSize: 13, fontFamily: "var(--font-jb)",
  outline: "none",
};

export default function UsersPage() {
  const { isSuperadmin } = useAdminContext();
  const [users, setUsers]           = useState<AdminUser[]>([]);
  const [usersLoading, setLoading]  = useState(true);
  const [search, setSearch]         = useState("");
  const [tierFilter, setTierFilter] = useState<"all" | "free" | "pro" | "max">("all");
  const [openMenu, setOpenMenu]     = useState<{ id: string; top: number; right: number } | null>(null);
  const [modal, setModal]           = useState<ConfirmModal | null>(null);

  const loadUsers = useCallback(async () => {
    try {
      const res = await fetchWithAuth(`${API}/v1/admin/users`);
      if (res?.ok) setUsers(await res.json());
    } catch { /* non-fatal */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  useEffect(() => {
    if (!openMenu) return;
    const close = () => setOpenMenu(null);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [openMenu]);

  const filtered = users.filter((u) => {
    const matchSearch = !search || u.email.toLowerCase().includes(search.toLowerCase()) || (u.display_name ?? "").toLowerCase().includes(search.toLowerCase());
    const matchTier   = tierFilter === "all" || u.tier === tierFilter;
    return matchSearch && matchTier;
  });

  function handleTierChange(user: AdminUser, tier: "free" | "pro" | "max") {
    setOpenMenu(null);
    setModal({
      title: `Change tier for ${user.display_name ?? user.email}`,
      body: `You are changing this user's tier from ${user.tier.toUpperCase()} to ${tier.toUpperCase()}. This takes effect immediately.`,
      onConfirm: async () => {
        const res = await fetchWithAuth(`${API}/v1/admin/users/${user.id}/tier`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tier }),
        });
        if (res?.ok) { loadUsers(); } else { window.alert("Failed to update tier. Please try again."); }
      },
    });
  }

  function handleRoleChange(user: AdminUser, role: "user" | "admin" | "superadmin") {
    setOpenMenu(null);
    setModal({
      title: `Change role for ${user.display_name ?? user.email}`,
      body: `You are changing this user's role from ${user.role.toUpperCase()} to ${role.toUpperCase()}. This takes effect immediately.`,
      onConfirm: async () => {
        const res = await fetchWithAuth(`${API}/v1/admin/users/${user.id}/role`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role }),
        });
        if (res?.ok) { loadUsers(); } else { window.alert("Failed to update role. Please try again."); }
      },
    });
  }

  return (
    <>
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
                        <td style={{ padding: "12px 16px" }}>
                          <button
                            onClick={(e) => {
                              if (openMenu?.id === u.id) { setOpenMenu(null); return; }
                              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                              setOpenMenu({ id: u.id, top: rect.bottom + 4, right: window.innerWidth - rect.right });
                            }}
                            style={{ background: "transparent", border: "1px solid var(--line)", borderRadius: 5, padding: "4px 10px", color: "var(--ghost)", fontSize: 12, cursor: "pointer" }}
                          >
                            ···
                          </button>
                          {openMenu?.id === u.id && (
                            <div onClick={(e) => e.stopPropagation()} style={{ position: "fixed", top: openMenu.top, right: openMenu.right, zIndex: 1000, background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 8, boxShadow: "0 8px 24px rgba(0,0,0,0.3)", minWidth: 180, padding: "4px 0" }}>
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

      {modal && <Modal modal={modal} onClose={() => setModal(null)} />}
    </>
  );
}
