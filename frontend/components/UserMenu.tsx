"use client";

import { useUser, useClerk } from "@clerk/nextjs";
import Image from "next/image";

export function UserMenu() {
  const { user } = useUser();
  const { signOut } = useClerk();

  if (!user) return null;

  const displayName = [user.firstName, user.lastName].filter(Boolean).join(" ") || "Account";
  const avatarUrl = user.imageUrl;

  return (
    <div className="flex items-center gap-2">
      {avatarUrl && (
        <Image
          src={avatarUrl}
          alt={displayName}
          width={28}
          height={28}
          className="rounded-full"
          style={{ border: "1px solid #1C2B3A" }}
        />
      )}
      <span
        style={{
          color: "var(--dim)",
          fontSize: 13,
          fontFamily: "var(--font-nunito)",
        }}
      >
        {displayName}
      </span>
      <button
        onClick={() => signOut()}
        aria-label="Sign out"
        style={{
          color: "var(--ghost)",
          fontSize: 11,
          fontFamily: "var(--font-jb)",
          background: "transparent",
          border: "1px solid var(--line)",
          borderRadius: 4,
          padding: "2px 8px",
          cursor: "pointer",
        }}
      >
        Sign out
      </button>
    </div>
  );
}
