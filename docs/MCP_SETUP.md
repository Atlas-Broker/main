# Atlas Docs MCP — Setup

Exposes the `CONTEXT` and `BUILD` docs as database-backed sections that Claude Chat and Claude Code both read/write through the same API. No git commits required for doc edits.

## Endpoint

`POST /api/mcp/docs` on the Atlas frontend (Vercel). JSON-RPC 2.0. Bearer token auth.

Local: `http://localhost:3000/api/mcp/docs`
UAT: `https://atlas-broker-uat.vercel.app/api/mcp/docs`

## Required env vars (on Vercel + `.env.local`)

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_KEY` | Server-only service-role key (writes bypass RLS) |
| `ATLAS_MCP_TOKEN` | Personal access token (PAT). Any long random string. Rotate by changing this value. |

Generate a token:
```bash
openssl rand -hex 32
```

## One-time setup

1. Apply the migration:
   ```bash
   # via Supabase CLI, or paste into the Supabase SQL editor:
   database/supabase/supabase/migrations/20260422000000_atlas_docs_mcp.sql
   ```
2. Seed `CONTEXT` + `BUILD` from the existing markdown files:
   ```bash
   cd frontend
   npx tsx scripts/seed-atlas-docs.ts
   ```
3. Set `ATLAS_MCP_TOKEN` on Vercel (Production + Preview) and in `frontend/.env.local` for dev.

## Connect from Claude Chat

Settings → Connectors → Add custom connector:
- **URL**: `https://atlas-broker-uat.vercel.app/api/mcp/docs`
- **Auth**: Bearer token → paste `ATLAS_MCP_TOKEN`

Once connected, Claude Chat can call `list_sections`, `read_section`, `patch_section`, etc.

## Tools exposed

| Tool | Purpose |
|------|---------|
| `list_sections` | Discover headings + versions for a doc |
| `read_section` | Read one section's full markdown + version |
| `create_section` | Add a new section at end (or at `position`) |
| `append_section` | Append to existing section (create-if-missing) |
| `patch_section` | Replace section content with `expected_version` guard |
| `rename_section` | Change a section's heading |
| `list_recent_changes` | Triage: what was edited recently |

## Concurrency

`patch_section` and `rename_section` require `expected_version`. On mismatch, the server returns a `version_conflict` error including the current content — Claude should re-read and re-apply once before escalating.

## What does NOT migrate (yet)

- `docs/Interim_Report.md` — frozen submission artifact, stays in git
- `docs/diagrams/` — images, not markdown
- `docs/submissions/`, `docs/superpowers/`, `docs/CLAUDE.md` — keep in git
