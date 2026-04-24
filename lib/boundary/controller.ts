/**
 * Execution Boundary Controller (EBC) — Atlas's core differentiator.
 *
 * Takes an AgentSignal and a BoundaryMode, routes to the correct execution
 * path, and returns an ExecutionResult.
 *
 * Port of backend/boundary/controller.py.
 */
import type { BrokerAdapter } from "@/lib/broker/base";
import { BOUNDARY_MODES, MODE_CONFIG, type BoundaryMode } from "./modes";

export interface AgentSignal {
  traceId: string;
  ticker: string;
  action: "BUY" | "SELL" | "HOLD";
  confidence: number;
  reasoning: string;
  risk: Record<string, number>;
}

export type ExecutionStatus =
  | "advisory"
  | "awaiting_approval"
  | "filled"
  | "skipped";

export interface ExecutionResult {
  mode: string;
  executed: boolean;
  status: ExecutionStatus;
  signalId: string;
  ticker: string;
  action: string;
  confidence: number;
  reasoning: string;
  risk: Record<string, number>;
  orderId?: string;
  overrideWindowS: number;
  message: string;
  guardrailTriggered: boolean;
  extra: Record<string, unknown>;
}

export class EBC {
  constructor(private readonly broker: BrokerAdapter | null = null) {}

  async execute(signal: AgentSignal, mode: string): Promise<ExecutionResult> {
    if (!(BOUNDARY_MODES as readonly string[]).includes(mode)) {
      throw new Error(`Unknown boundary mode: ${mode}`);
    }
    const bmode = mode as BoundaryMode;
    const config = MODE_CONFIG[bmode];

    const base: Omit<ExecutionResult, "executed" | "status" | "message"> = {
      mode,
      signalId: signal.traceId,
      ticker: signal.ticker,
      action: signal.action,
      confidence: signal.confidence,
      reasoning: signal.reasoning,
      risk: signal.risk,
      overrideWindowS: 0,
      guardrailTriggered: false,
      extra: {},
    };

    if (bmode === "advisory") {
      return {
        ...base,
        executed: false,
        status: "advisory",
        message: "Signal generated. No execution in advisory mode.",
      };
    }

    if (bmode === "autonomous_guardrail") {
      if (signal.confidence < config.minConfidence) {
        return {
          ...base,
          executed: false,
          status: "awaiting_approval",
          guardrailTriggered: true,
          message: `Confidence ${(signal.confidence * 100).toFixed(0)}% below guardrail threshold ${(config.minConfidence * 100).toFixed(0)}%. Signal queued for human review.`,
        };
      }
    } else if (signal.confidence < config.minConfidence) {
      return {
        ...base,
        executed: false,
        status: "skipped",
        message: `Confidence ${(signal.confidence * 100).toFixed(0)}% below threshold ${(config.minConfidence * 100).toFixed(0)}% for ${mode} mode.`,
      };
    }

    if (!this.broker) {
      return {
        ...base,
        executed: false,
        status: "skipped",
        message: "Autonomous mode requested but no broker configured.",
      };
    }

    if (signal.action === "HOLD") {
      return {
        ...base,
        executed: false,
        status: "skipped",
        message: "HOLD signal — no order placed.",
      };
    }

    const order = await this.broker.submitOrder({
      ticker: signal.ticker,
      action: signal.action as "BUY" | "SELL",
      notional: config.notionalUsd,
    });

    return {
      ...base,
      executed: true,
      status: "filled",
      orderId: order.orderId,
      overrideWindowS: config.overrideWindowS,
      message: `Order placed: ${signal.action} $${config.notionalUsd.toFixed(0)} of ${signal.ticker}.`,
      extra: { order },
    };
  }
}
