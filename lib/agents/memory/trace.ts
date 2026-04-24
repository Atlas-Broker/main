/**
 * Reasoning trace persistence — saves pipeline runs to MongoDB Atlas.
 *
 * Mirrors backend/agents/memory/trace.py exactly.
 *
 * Collection: atlas.reasoning_traces
 * Schema:
 *   ticker, user_id, boundary_mode, created_at,
 *   pipeline_run: { technical, fundamental, sentiment, synthesis, risk, final_decision }
 */

import { MongoClient } from "mongodb";
import type { TechnicalOutput, FundamentalOutput, SentimentOutput, SynthesisOutput, RiskOutput, PortfolioDecision } from "../state";

let _client: MongoClient | null = null;

function getCollection() {
  if (!_client) {
    const uri = process.env.MONGODB_URI;
    if (!uri) {
      throw new Error("MONGODB_URI is not set");
    }
    _client = new MongoClient(uri);
  }
  const dbName = process.env.MONGODB_DB_NAME ?? "atlas";
  return _client.db(dbName).collection("reasoning_traces");
}

export interface SaveTraceParams {
  ticker: string;
  userId: string;
  boundaryMode: string;
  technical: TechnicalOutput | Record<string, unknown>;
  fundamental: FundamentalOutput | Record<string, unknown>;
  sentiment: SentimentOutput | Record<string, unknown>;
  synthesis: SynthesisOutput | Record<string, unknown>;
  risk: RiskOutput | Record<string, unknown>;
  finalDecision: PortfolioDecision | Record<string, unknown>;
}

/**
 * Persist a full pipeline run to MongoDB.
 *
 * @returns Inserted document _id as a string.
 */
export async function saveTrace(params: SaveTraceParams): Promise<string> {
  const {
    ticker,
    userId,
    boundaryMode,
    technical,
    fundamental,
    sentiment,
    synthesis,
    risk,
    finalDecision,
  } = params;

  const doc = {
    ticker,
    user_id: userId,
    boundary_mode: boundaryMode,
    created_at: new Date(),
    pipeline_run: {
      technical,
      fundamental,
      sentiment,
      synthesis,
      risk,
      final_decision: finalDecision,
    },
  };

  const collection = getCollection();
  const result = await collection.insertOne(doc);
  return result.insertedId.toString();
}
