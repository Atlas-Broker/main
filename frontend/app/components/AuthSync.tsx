"use client";

import { useEffect } from "react";
import { useAuth } from "@clerk/nextjs";
import { setTokenFn } from "@/lib/auth";

export function AuthSync() {
  const { getToken } = useAuth();

  useEffect(() => {
    setTokenFn(() => getToken());
  }, [getToken]);

  return null;
}
