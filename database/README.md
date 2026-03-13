# Atlas — Database

Schema definitions shared across the frontend and backend. Both databases are deployed and managed via CLI — no manual GUI steps required.

## Databases

### Supabase (PostgreSQL)

Stores structured, relational data with Row Level Security (RLS) enforced on every table.

| Table | Description |
|-------|-------------|
| `profiles` | Extends Supabase auth — stores boundary mode preference per user |
| `portfolios` | Paper portfolio with cash balance ($100k default) |
| `positions` | Open positions (ticker, shares, avg cost) |
| `trades` | Full trade history with execution status and boundary mode |
| `override_log` | Audit trail of user overrides (Autonomous mode) |

Every table has a `user_id` column from day one — the schema is multi-tenancy ready even though multi-user is out of scope for the capstone.

**Deploy / redeploy the schema:**

```bash
# From repo root — requires supabase CLI and active login
supabase link --project-ref qbbbuebbxueqclkrvoos
supabase db push
```

Migrations live in `supabase/supabase/migrations/`. The initial migration drops all tables and recreates them cleanly.

### MongoDB Atlas

Stores agent reasoning traces — deeply nested documents with variable structure per pipeline run.

Collection: `reasoning_traces`
Schema definition: `mongo/schemas/reasoning_trace.json`

Each document captures the full pipeline run:
- Per-agent outputs: signal, indicators/metrics, reasoning, model used, latency
- Synthesis: bull case, bear case, verdict
- Risk: stop-loss, take-profit, position size, R/R ratio
- Final decision: action, confidence, reasoning

**Indexes deployed:**

| Index | Purpose |
|-------|---------|
| `{ user_id: 1, created_at: -1 }` | Fetch a user's trace history |
| `{ ticker: 1, created_at: -1 }` | Fetch traces by stock |
| `{ "pipeline_run.final_decision.action": 1 }` | Filter by BUY/SELL/HOLD |

JSON Schema validation is active at `moderate` level (flags invalid documents, does not reject them — safe for dev).

## Directory Structure

```
database/
├── supabase/
│   ├── schema.sql              # Canonical schema reference
│   └── supabase/
│       └── migrations/
│           └── 20260313054120_initial_schema.sql   # Active migration (drop + recreate)
└── mongo/
    └── schemas/
        └── reasoning_trace.json   # JSON Schema for trace documents
```
