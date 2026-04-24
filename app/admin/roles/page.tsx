"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchWithAuth } from "@/lib/api";
import { useAdminContext } from "../admin-context";
import { Card, RoleBadge, Modal, type AdminUser, type ConfirmModal } from "../admin-shared";

const API = "";

export default function RolesPage() {
  const { isSuperadmin } = useAdminContext();
  const router = useRouter();
  const [users, setUsers]         = useState<AdminUser[]>([]);
  const [usersLoading, setLoading] = useState(true);
  const [modal, setModal]         = useState<ConfirmModal | null>(null);

  const loadUsers = useCallback(async () => {
    try {
      const res = await fetchWithAuth(`${API}/v1/admin/users`);
      if (res?.ok) setUsers(await res.json());
    } catch { /* non-fatal */ } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (!isSuperadmin) { router.push("/admin"); return; }
    loadUsers();
  }, [isSuperadmin, loadUsers, router]);

  if (!isSuperadmin) return null;

  const elevated = users.filter((u) => u.role === "admin" || u.role === "superadmin");

  function handleRoleChange(user: AdminUser, role: "user" | "admin" | "superadmin") {
    const isPromotion = role === "superadmin";
    setModal({
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
        if (res?.ok) { loadUsers(); } else { window.alert("Failed to update role. Please try again."); }
      },
    });
  }

  return (
    <>
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

      {modal && <Modal modal={modal} onClose={() => setModal(null)} />}
    </>
  );
}
