/**
 * Atlas notification service — TypeScript port of backend/services/notification_service.py.
 *
 * Uses the Resend Node SDK to send transactional email notifications.
 * Never throws — all errors are logged and swallowed so callers stay unblocked.
 */
import { Resend } from "resend";
import type { BacktestMetrics } from "@/lib/backtest/types";

const RESEND_API_KEY = process.env.RESEND_API_KEY ?? "";
const RESEND_FROM_EMAIL =
  process.env.RESEND_FROM_EMAIL ?? "noreply@atlas.ai";
const DASHBOARD_URL =
  process.env.NEXT_PUBLIC_APP_URL ?? "https://atlas.ai/dashboard";
const CLERK_SECRET_KEY = process.env.CLERK_SECRET_KEY ?? "";

// ─── Clerk helper ─────────────────────────────────────────────────────────────

async function getUserEmail(userId: string): Promise<string | null> {
  if (!CLERK_SECRET_KEY) {
    console.warn(
      `[notifications] CLERK_SECRET_KEY not set — cannot fetch email for user ${userId}`
    );
    return null;
  }

  try {
    const res = await fetch(`https://api.clerk.com/v1/users/${userId}`, {
      headers: { Authorization: `Bearer ${CLERK_SECRET_KEY}` },
    });
    if (!res.ok) {
      console.warn(
        `[notifications] Clerk returned ${res.status} for user ${userId}`
      );
      return null;
    }
    const data = (await res.json()) as {
      primary_email_address_id: string;
      email_addresses: Array<{ id: string; email_address: string }>;
    };
    const primaryId = data.primary_email_address_id;
    for (const e of data.email_addresses) {
      if (e.id === primaryId) return e.email_address;
    }
    return null;
  } catch (err) {
    console.warn(`[notifications] Failed to fetch user email from Clerk:`, err);
    return null;
  }
}

// ─── notifyLowConfidenceSignal ────────────────────────────────────────────────

/**
 * Send a low-confidence guardrail notification to the user.
 *
 * Matches backend send_guardrail_notification() signature.
 */
export async function notifyLowConfidenceSignal(
  userId: string,
  ticker: string,
  confidence: number
): Promise<void> {
  if (!RESEND_API_KEY) {
    console.warn(
      `[notifications] RESEND_API_KEY not set — skipping guardrail notification for user ${userId}`
    );
    return;
  }

  try {
    const email = await getUserEmail(userId);
    if (!email) return;

    const resend = new Resend(RESEND_API_KEY);
    const confidencePct = Math.round(confidence * 100);

    await resend.emails.send({
      from: RESEND_FROM_EMAIL,
      to: [email],
      subject: `Atlas Guardrail: ${ticker} held (${confidencePct}% confidence)`,
      html: [
        "<p>Atlas held a signal because confidence was below the guardrail threshold.</p>",
        "<ul>",
        `<li><strong>Ticker:</strong> ${ticker}</li>`,
        `<li><strong>Confidence:</strong> ${confidencePct}%</li>`,
        "</ul>",
        `<p><a href="${DASHBOARD_URL}">View your dashboard &rarr;</a></p>`,
      ].join(""),
    });
  } catch (err) {
    console.error(
      `[notifications] Unexpected error in notifyLowConfidenceSignal:`,
      err
    );
  }
}

// ─── notifyBacktestComplete ───────────────────────────────────────────────────

/**
 * Send a backtest-complete notification email to the user.
 */
export async function notifyBacktestComplete(
  userId: string,
  jobId: string,
  metrics: BacktestMetrics
): Promise<void> {
  if (!RESEND_API_KEY) {
    console.warn(
      `[notifications] RESEND_API_KEY not set — skipping backtest notification for user ${userId}`
    );
    return;
  }

  try {
    const email = await getUserEmail(userId);
    if (!email) return;

    const resend = new Resend(RESEND_API_KEY);
    const winRatePct = Math.round(metrics.winRate * 100);
    const totalReturnPct = (metrics.totalReturn * 100).toFixed(2);

    await resend.emails.send({
      from: RESEND_FROM_EMAIL,
      to: [email],
      subject: `Atlas Backtest Complete — Job ${jobId}`,
      html: [
        "<p>Your Atlas backtest has finished running.</p>",
        "<table>",
        `<tr><td><strong>Total Return</strong></td><td>${totalReturnPct}%</td></tr>`,
        `<tr><td><strong>CAGR</strong></td><td>${(metrics.cagr * 100).toFixed(2)}%</td></tr>`,
        `<tr><td><strong>Sharpe Ratio</strong></td><td>${metrics.sharpeRatio.toFixed(2)}</td></tr>`,
        `<tr><td><strong>Max Drawdown</strong></td><td>${(metrics.maxDrawdown * 100).toFixed(2)}%</td></tr>`,
        `<tr><td><strong>Win Rate</strong></td><td>${winRatePct}%</td></tr>`,
        `<tr><td><strong>Total Trades</strong></td><td>${metrics.totalTrades}</td></tr>`,
        "</table>",
        `<p><a href="${DASHBOARD_URL}/backtest/${jobId}">View full results &rarr;</a></p>`,
      ].join(""),
    });
  } catch (err) {
    console.error(
      `[notifications] Unexpected error in notifyBacktestComplete:`,
      err
    );
  }
}
