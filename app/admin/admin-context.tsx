"use client";
import { createContext, useContext } from "react";
import type { UserRole } from "@/lib/api";

type AdminCtx = { role: UserRole | null; isSuperadmin: boolean };
export const AdminContext = createContext<AdminCtx>({ role: null, isSuperadmin: false });
export function useAdminContext() { return useContext(AdminContext); }
