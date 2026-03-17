# Atlas — Database

Schema definitions for both databases. Neither requires manual GUI steps — both are managed via CLI.

## Databases

### Supabase (PostgreSQL)

Relational data with Row Level Security enforced on every table. Every table has a `user_id` column — multi-tenancy ready, tied to Clerk user IDs.

| Table | Description | Status |
|-------|-------------|--------|
| `profiles` | One row per user — stores `boundary_mode` preference (`advisory`, `conditional`, `autonomous`) | ✅ Active |
| `portfolios` | Paper portfolio record — tracks cash balance | ✅ Active |
| `positions` | Open positions — ticker, shares, average cost. Synced from Alpaca on trade execution | ✅ Active |
| `trades` | Trade history — action, quantity, price, execution status, boundary mode used | ✅ Active |
| `override_log` | Audit trail of user overrides in Autonomous mode | ✅ Active |

RLS policies are deployed and enforced. All writes from the backend use the service role key (`SUPABASE_SERVICE_KEY`). Frontend reads use the anon key with RLS filtering by `user_id`.

**Deploy the schema:**

```bash
supabase link --project-ref qbbbuebbxueqclkrvoos
supabase db push
```

Migrations live in `supabase/supabase/migrations/`. The initial migration drops and recreates all tables cleanly.

### MongoDB Atlas

Agent reasoning traces — deeply nested documents with variable structure per pipeline run.

**Collection:** `reasoning_traces`
**Schema definition:** `mongo/schemas/reasoning_trace.json`

Each document captures the full pipeline run for a single ticker:

| Field path | Contents |
|-----------|----------|
| `ticker`, `boundary_mode`, `created_at` | Run metadata |
| `user_id` | Clerk user ID of the requesting user |
| `pipeline_run.analysts.technical` | RSI, SMAs, signal, reasoning, latency |
| `pipeline_run.analysts.fundamental` | P/E, growth, signal, reasoning, latency |
| `pipeline_run.analysts.sentiment` | Headline themes, score, reasoning, latency |
| `pipeline_run.synthesis` | Bull case, bear case, verdict |
| `pipeline_run.risk` | Stop-loss, take-profit, position size, R/R ratio |
| `pipeline_run.final_decision` | action, confidence, reasoning |
| `execution` | `executed`, `order_id`, `rejected`, `override` flags |

JSON Schema validation is active at `moderate` level — invalid documents are flagged but not rejected.

**Indexes:**

| Index | Purpose |
|-------|---------|
| `{ user_id: 1, created_at: -1 }` | User's trace history |
| `{ ticker: 1, created_at: -1 }` | Traces by stock |
| `{ "pipeline_run.final_decision.action": 1 }` | Filter by BUY / SELL / HOLD |

## Directory Structure

```
database/
├── supabase/
│   ├── schema.sql                                   # Canonical schema reference
│   └── supabase/
│       └── migrations/
│           └── 20260313054120_initial_schema.sql    # Active migration
└── mongo/
    └── schemas/
        └── reasoning_trace.json                     # JSON Schema for trace documents
```
