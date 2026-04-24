export const BOUNDARY_MODES = [
  "advisory",
  "autonomous",
  "autonomous_guardrail",
] as const;

export type BoundaryMode = (typeof BOUNDARY_MODES)[number];

export interface ModeConfig {
  minConfidence: number;
  notionalUsd: number;
  overrideWindowS: number;
  circuitBreakerLosses?: number;
  circuitBreakerDrawdown?: number;
}

export const MODE_CONFIG: Record<BoundaryMode, ModeConfig> = {
  advisory: {
    minConfidence: 0.0,
    notionalUsd: 0.0,
    overrideWindowS: 0,
  },
  autonomous: {
    minConfidence: 0.65,
    notionalUsd: 1000.0,
    overrideWindowS: 300,
  },
  autonomous_guardrail: {
    minConfidence: 0.65,
    notionalUsd: 1000.0,
    overrideWindowS: 300,
    circuitBreakerLosses: 3,
    circuitBreakerDrawdown: 0.15,
  },
};
