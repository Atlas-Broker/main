"use client";

let _getToken: (() => Promise<string | null>) | null = null;

export function setTokenFn(fn: () => Promise<string | null>): void {
  _getToken = fn;
}

export async function getClerkToken(): Promise<string | null> {
  if (!_getToken) return null;
  return _getToken();
}
