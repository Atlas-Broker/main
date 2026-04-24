"use client";

import { useEffect, useRef } from "react";
import { useAuth, useUser } from "@clerk/nextjs";
import { setTokenFn } from "@/lib/auth";
import { createSupabaseClient } from "@/lib/supabase";

export function AuthSync() {
  const { getToken, userId } = useAuth();
  const { user } = useUser();
  const syncedRef = useRef<string | null>(null);

  // Wire up the backend API token
  useEffect(() => {
    setTokenFn(() => getToken());
  }, [getToken]);

  // Sync user to Supabase once per userId (on sign-in)
  useEffect(() => {
    if (!userId || !user || syncedRef.current === userId) return;

    async function syncUser() {
      try {
        const token = await getToken({ template: "atlas-supabase" });
        if (!token) return;

        const supabase = createSupabaseClient(token);

        const email = user!.primaryEmailAddress?.emailAddress ?? "";
        const displayName =
          user!.fullName ?? user!.firstName ?? email.split("@")[0] ?? "";

        // Check if profile exists first, then insert or update identity fields only.
        // We use select+insert/update to avoid overwriting user settings (boundary_mode, etc.)
        // on subsequent sign-ins.
        const { data: existing, error: selectError } = await supabase
          .from("profiles")
          .select("id")
          .eq("id", userId)
          .maybeSingle();

        if (selectError) {
          console.error("[AuthSync] profile lookup failed:", selectError.message);
          return;
        }

        if (!existing) {
          const { error: insertError } = await supabase
            .from("profiles")
            .insert({ id: userId, email, display_name: displayName, boundary_mode: "advisory", onboarding_completed: false });
          if (insertError) {
            console.error("[AuthSync] profile insert failed:", insertError.message);
            return;
          }
        } else {
          const { error: updateError } = await supabase
            .from("profiles")
            .update({ email, display_name: displayName })
            .eq("id", userId);
          if (updateError) {
            console.error("[AuthSync] profile update failed:", updateError.message);
            return;
          }
        }

        // Create portfolio if it doesn't exist
        const { error: portfolioError } = await supabase
          .from("portfolios")
          .upsert(
            { user_id: userId, name: "Paper Portfolio", cash: 100000 },
            { onConflict: "user_id", ignoreDuplicates: true }
          );

        if (portfolioError) {
          console.error("[AuthSync] portfolio upsert failed:", portfolioError.message);
          return;
        }

        syncedRef.current = userId!;
      } catch (err) {
        console.error("[AuthSync] unexpected error:", err);
      }
    }

    syncUser();
  }, [userId, user, getToken]);

  return null;
}
