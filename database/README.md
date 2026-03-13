# Atlas — Database

Schema definitions shared across the frontend and backend.

## Databases

### Supabase (PostgreSQL)

Stores structured, relational data with Row Level Security (RLS) enforced on every table.

| Table | Description |
|-------|-------------|
| `profiles` | Extends Supabase auth — stores boundary mode preference per user |
| `portfolios` | Paper portfolio with cash balance |
| `positions` | Open positions (ticker, shares, avg cost) |
| `trades` | Full trade history with execution status |
| `override_log` | Audit trail of user overrides (Autonomous mode) |

Every table has a `user_id` column from day one — the schema is multi-tenancy ready even though multi-user is out of scope for the capstone.

**To apply the schema:**

1. Open your Supabase project → SQL Editor
2. Run `supabase/schema.sql`

### MongoDB Atlas

Stores agent reasoning traces — deeply nested documents with variable structure depending on which agents ran and what they produced.

Schema definition: `mongo/schemas/reasoning_trace.json`

Each trace document captures the full pipeline run: per-agent outputs (signal, indicators/metrics, reasoning, model used, latency), the synthesis debate, risk parameters, and the final decision.

## Directory Structure

```
database/
├── supabase/
│   ├── schema.sql      # Full schema with RLS policies
│   └── seed.sql        # (coming) seed data for development
└── mongo/
    └── schemas/
        └── reasoning_trace.json   # JSON Schema for trace documents
```
