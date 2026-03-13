# Atlas — Database

Schema definitions for both databases. Neither requires manual GUI steps — both are managed via CLI.

## Databases

### Supabase (PostgreSQL)

Relational data with Row Level Security enforced on every table. Every table has a `user_id` column, so the schema is multi-tenancy ready.

| Table | Description |
|-------|-------------|
| `profiles` | One row per user — stores `boundary_mode` preference (`advisory`, `conditional`, `autonomous`) |
| `portfolios` | Paper portfolio record — tracks cash balance |
| `positions` | Open positions — ticker, shares, average cost |
| `trades` | Trade history — action, quantity, price, execution status, boundary mode used |
| `override_log` | Audit trail of user overrides in Autonomous mode |

**Current usage:** Schema is deployed and RLS policies are active. The backend does not yet read from or write to these tables — state currently lives in Alpaca (positions/account) and MongoDB (signals/traces). Supabase integration is the next major development step.

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
| `pipeline_run.analysts.technical` | RSI, SMAs, signal, reasoning, latency |
| `pipeline_run.analysts.fundamental` | P/E, growth, signal, reasoning, latency |
| `pipeline_run.analysts.sentiment` | Headline themes, score, reasoning, latency |
| `pipeline_run.synthesis` | Bull case, bear case, verdict |
| `pipeline_run.risk` | Stop-loss, take-profit, position size, R/R ratio |
| `pipeline_run.final_decision` | action, confidence, reasoning |
| `execution` | `executed` bool, `order_id` (set when approved and placed) |

JSON Schema validation is active at `moderate` level — invalid documents are flagged but not rejected (safe for development).

**Current usage:** Every `POST /v1/pipeline/run` writes a trace here. `GET /v1/signals` reads from this collection and converts traces into the Signal API schema.

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
