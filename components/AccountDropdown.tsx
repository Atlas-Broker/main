"use client";

import { useState, useRef, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { useUser, useClerk } from "@clerk/nextjs";
import { useTheme } from "@/app/components/ThemeProvider";
import type { UserRole } from "@/lib/api";

interface AccountDropdownProps {
  role?: UserRole | null;
  /** If provided, a "Settings" item appears that calls this when clicked. */
  onSettings?: () => void;
}

export function AccountDropdown({ role, onSettings }: AccountDropdownProps) {
  const { user } = useUser();
  const { signOut } = useClerk();
  const { dark, toggle } = useTheme();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  if (!user) return null;

  const displayName =
    [user.firstName, user.lastName].filter(Boolean).join(" ") || "Account";
  const initials = displayName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const avatarUrl = user.imageUrl;

  const itemStyle: React.CSSProperties = {
    display: "block",
    width: "100%",
    textAlign: "left",
    padding: "9px 14px",
    background: "transparent",
    border: "none",
    color: "var(--dim)",
    fontSize: 13,
    fontFamily: "var(--font-nunito)",
    cursor: "pointer",
    transition: "background 0.12s ease",
  };

  return (
    <div ref={ref} style={{ position: "relative" }}>
      {/* ── Trigger ─────────────────────────────────────────────────────────── */}
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Account menu"
        aria-expanded={open}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 7,
          background: "transparent",
          border: `1px solid ${open ? "var(--line2)" : "var(--line)"}`,
          borderRadius: 24,
          padding: "3px 10px 3px 3px",
          cursor: "pointer",
          transition: "border-color 0.15s ease",
        }}
      >
        {avatarUrl ? (
          <Image
            src={avatarUrl}
            alt={displayName}
            width={24}
            height={24}
            style={{ borderRadius: "50%", flexShrink: 0 }}
          />
        ) : (
          <div
            style={{
              width: 24,
              height: 24,
              borderRadius: "50%",
              background: "var(--brand)",
              color: "#fff",
              fontSize: 9,
              fontFamily: "var(--font-jb)",
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            {initials}
          </div>
        )}
        <span
          style={{
            color: "var(--dim)",
            fontSize: 12,
            fontFamily: "var(--font-jb)",
          }}
        >
          {user.firstName ?? displayName}
        </span>
        <span
          style={{
            color: "var(--ghost)",
            fontSize: 9,
            transition: "transform 0.15s ease",
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
          }}
        >
          ▾
        </span>
      </button>

      {/* ── Dropdown ────────────────────────────────────────────────────────── */}
      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            right: 0,
            minWidth: 210,
            background: "var(--surface)",
            border: "1px solid var(--line)",
            borderRadius: 10,
            boxShadow: "0 8px 28px rgba(0,0,0,0.16)",
            overflow: "hidden",
            zIndex: 200,
          }}
        >
          {/* ── User info ── */}
          <div
            style={{
              padding: "12px 14px",
              borderBottom: "1px solid var(--line)",
            }}
          >
            <div
              style={{
                color: "var(--ink)",
                fontSize: 13,
                fontFamily: "var(--font-nunito)",
                fontWeight: 700,
              }}
            >
              {displayName}
            </div>
            <div
              style={{
                color: "var(--ghost)",
                fontSize: 11,
                fontFamily: "var(--font-jb)",
                marginTop: 1,
              }}
            >
              {user.primaryEmailAddress?.emailAddress}
            </div>
          </div>

          {/* ── Theme toggle ── */}
          <div
            className="flex items-center justify-between"
            style={{
              padding: "9px 14px",
              borderBottom: "1px solid var(--line)",
            }}
          >
            <span
              style={{
                color: "var(--dim)",
                fontSize: 13,
                fontFamily: "var(--font-nunito)",
              }}
            >
              {dark ? "Dark mode" : "Light mode"}
            </span>
            <button
              onClick={toggle}
              aria-label="Toggle theme"
              style={{
                width: 36,
                height: 20,
                borderRadius: 10,
                background: dark ? "var(--brand)" : "var(--line2)",
                border: "none",
                cursor: "pointer",
                position: "relative",
                flexShrink: 0,
                transition: "background 0.2s ease",
              }}
            >
              <div
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: "50%",
                  background: "#fff",
                  position: "absolute",
                  top: 3,
                  left: dark ? 19 : 3,
                  transition: "left 0.2s ease",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.25)",
                }}
              />
            </button>
          </div>

          {/* ── Settings (user dashboard only) ── */}
          {onSettings && (
            <button
              onClick={() => {
                onSettings();
                setOpen(false);
              }}
              style={{ ...itemStyle, borderBottom: "1px solid var(--line)" }}
            >
              Settings
            </button>
          )}

          {/* ── View switcher (superadmin) ── */}
          {role === "superadmin" && (
            <div style={{ borderBottom: "1px solid var(--line)" }}>
              <Link
                href="/admin"
                onClick={() => setOpen(false)}
                style={{ ...itemStyle, textDecoration: "none" }}
              >
                Admin View →
              </Link>
              <Link
                href="/dashboard"
                onClick={() => setOpen(false)}
                style={{ ...itemStyle, textDecoration: "none" }}
              >
                User View →
              </Link>
            </div>
          )}

          {/* ── Sign out ── */}
          <button
            onClick={() => signOut()}
            style={{ ...itemStyle, color: "var(--ghost)" }}
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}

/** @deprecated Use AccountDropdown instead */
export { AccountDropdown as UserMenu };
