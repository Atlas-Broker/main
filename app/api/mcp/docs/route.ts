import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import {
  DocsError,
  KNOWN_SLUGS,
  appendToSection,
  createSection,
  deleteSection,
  listRecentChanges,
  listSections,
  moveSection,
  patchSection,
  readDoc,
  readSection,
  renameSection,
} from "@/lib/atlas-docs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SERVER_INFO = {
  name: "atlas-docs",
  version: "0.1.0",
};

const SLUG_GUIDANCE = `Valid doc_slug values: ${KNOWN_SLUGS.join(", ")}.
- CONTEXT = project essence: vision, mission, problem statement, architecture, product decisions. Stable, slow-changing.
- BUILD = sprint tracker: specs (by Chat) + close-outs (by Code). Anything that got built, is being built, or is planned to build.
- INSTRUCTIONS = write discipline + communication conventions between agents, runbooks, how-to guides.
- IDEAS = captured thoughts, exploratory notes, backlog ideas not yet committed to BUILD. Low-friction inbox; promote to BUILD when ready.
- INTERIM_REPORT = content for the 12 April 2026 capstone interim submission (submitted, now archival).
- FINAL_REPORT = content being drafted toward the 19 July 2026 capstone final submission.
- BIWEEKLY_LOGS = running biweekly progress log for school check-ins.
Sections are markdown; headings are H2 text without the "## " prefix (e.g. "Agent Pipeline").`;

const TOOLS = [
  {
    name: "list_sections",
    description: `List all sections of a doc (headings, positions, versions, content previews).
${SLUG_GUIDANCE}
Use this before reading or writing to discover what sections exist. Returns sections in document order.`,
    inputSchema: {
      type: "object",
      properties: {
        doc_slug: { type: "string", enum: [...KNOWN_SLUGS] },
      },
      required: ["doc_slug"],
    },
  },
  {
    name: "read_section",
    description: `Read the full markdown content of a single section, including its current version number.
${SLUG_GUIDANCE}
Returns { heading, content, version, updated_at }. Store the version — you need it for patch_section.`,
    inputSchema: {
      type: "object",
      properties: {
        doc_slug: { type: "string", enum: [...KNOWN_SLUGS] },
        heading: { type: "string" },
      },
      required: ["doc_slug", "heading"],
    },
  },
  {
    name: "create_section",
    description: `Create a new section at the end of the doc (or at a specific position).
${SLUG_GUIDANCE}
Fails with duplicate_heading if a section with that heading already exists. For adding content to an existing section, use append_section or patch_section.`,
    inputSchema: {
      type: "object",
      properties: {
        doc_slug: { type: "string", enum: [...KNOWN_SLUGS] },
        heading: { type: "string" },
        content: { type: "string", description: "Markdown body (without the H2 heading line)" },
        position: { type: "integer", minimum: 0 },
      },
      required: ["doc_slug", "heading", "content"],
    },
  },
  {
    name: "append_section",
    description: `Append markdown to an existing section. If the section does not exist, creates it as a new top-level section (create-if-missing behavior). Use this for the forgiving path — e.g. logging a new item on mobile without first checking whether the section exists. For strict edits use patch_section with an expected_version.`,
    inputSchema: {
      type: "object",
      properties: {
        doc_slug: { type: "string", enum: [...KNOWN_SLUGS] },
        heading: { type: "string" },
        content: { type: "string", description: "Markdown to append; a blank line is inserted before it." },
        create_if_missing: { type: "boolean", default: true },
      },
      required: ["doc_slug", "heading", "content"],
    },
  },
  {
    name: "patch_section",
    description: `Replace a section's content atomically, guarded by expected_version (optimistic concurrency).
If expected_version does not match the current version, returns a version_conflict error with the current content so you can reconcile. On conflict: re-read, re-apply if still meaningful, and try once more before escalating to the human.
${SLUG_GUIDANCE}`,
    inputSchema: {
      type: "object",
      properties: {
        doc_slug: { type: "string", enum: [...KNOWN_SLUGS] },
        heading: { type: "string" },
        content: { type: "string" },
        expected_version: { type: "integer", minimum: 1 },
      },
      required: ["doc_slug", "heading", "content", "expected_version"],
    },
  },
  {
    name: "rename_section",
    description: `Rename a section's heading. Guarded by expected_version. Fails with duplicate_heading if the new heading already exists.`,
    inputSchema: {
      type: "object",
      properties: {
        doc_slug: { type: "string", enum: [...KNOWN_SLUGS] },
        heading: { type: "string" },
        new_heading: { type: "string" },
        expected_version: { type: "integer", minimum: 1 },
      },
      required: ["doc_slug", "heading", "new_heading", "expected_version"],
    },
  },
  {
    name: "move_section",
    description: `Reorder a section by updating its position, shifting affected siblings to keep positions contiguous. Insert-at-N semantics: "new_position = N" places the section at N and bumps anything currently at or past N by one slot (same mental model as create_section with an explicit position). Moving down pulls intervening sections up by one; moving up pushes intervening sections down by one. Guarded by expected_version — if the section was patched, renamed, or moved since you read it, returns version_conflict and you must re-read before retrying.
${SLUG_GUIDANCE}
Returns { heading, old_position, new_position, version }. Use list_sections afterwards if you want to verify the full new ordering.`,
    inputSchema: {
      type: "object",
      properties: {
        doc_slug: { type: "string", enum: [...KNOWN_SLUGS] },
        heading: { type: "string" },
        new_position: {
          type: "integer",
          minimum: 0,
          description: "Zero-indexed target slot. Sections currently at or after this slot shift +1; sections between old and new position shift the other way.",
        },
        expected_version: { type: "integer", minimum: 1 },
      },
      required: ["doc_slug", "heading", "new_position", "expected_version"],
    },
  },
  {
    name: "read_doc",
    description: `Return an entire doc as one assembled markdown blob, with H2 headings emitted in current position order. One call replaces N round-trips of read_section when you need to review or reason over a whole doc. Soft-deleted sections are excluded. Read-only — no expected_version.
${SLUG_GUIDANCE}
Returns { doc_slug, content, sections: [{ heading, position, version, updated_at }], generated_at }. The sections array mirrors list_sections (minus content previews) so you can still grab per-section versions for follow-up edits without a second call.`,
    inputSchema: {
      type: "object",
      properties: {
        doc_slug: { type: "string", enum: [...KNOWN_SLUGS] },
      },
      required: ["doc_slug"],
    },
  },
  {
    name: "delete_section",
    description: `Soft-delete a section by flipping is_current to false. The row and its version history stay in Postgres for recovery, but the section disappears from list_sections, read_section, and read_doc. Guarded by expected_version — matches patch_section / rename_section conflict semantics. Re-deleting an already-deleted heading returns not_found. Other sections' positions are NOT renumbered; if you need a gapless order afterwards, follow up with move_section calls.
${SLUG_GUIDANCE}
Returns { heading, deleted: true, version }. Prefer this over patch_section-to-empty for retired content — it keeps the doc clean instead of leaving pointer stubs.`,
    inputSchema: {
      type: "object",
      properties: {
        doc_slug: { type: "string", enum: [...KNOWN_SLUGS] },
        heading: { type: "string" },
        expected_version: { type: "integer", minimum: 1 },
      },
      required: ["doc_slug", "heading", "expected_version"],
    },
  },
  {
    name: "list_recent_changes",
    description: `List the most recent section mutations across all docs (or filtered to one slug). Useful for triage: "what has the human touched lately?"`,
    inputSchema: {
      type: "object",
      properties: {
        doc_slug: { type: "string", enum: [...KNOWN_SLUGS] },
        limit: { type: "integer", minimum: 1, maximum: 100, default: 20 },
      },
    },
  },
];

type JsonRpcId = string | number | null;

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: JsonRpcId;
  method: string;
  params?: Record<string, unknown>;
}

function rpcResult(id: JsonRpcId, result: unknown) {
  return { jsonrpc: "2.0" as const, id, result };
}

function rpcError(id: JsonRpcId, code: number, message: string, data?: unknown) {
  return { jsonrpc: "2.0" as const, id, error: { code, message, data } };
}

function authorize(req: NextRequest): boolean {
  const expected = process.env.ATLAS_MCP_TOKEN;
  if (!expected) return false;
  const header = req.headers.get("authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) return false;
  const presented = match[1];
  const a = Buffer.from(presented);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function actorFromHeaders(req: NextRequest): string {
  const ua = req.headers.get("x-mcp-client") || req.headers.get("user-agent") || "mcp";
  return `mcp:${ua.slice(0, 64)}`;
}

function textContent(payload: unknown) {
  return {
    content: [
      {
        type: "text",
        text: typeof payload === "string" ? payload : JSON.stringify(payload, null, 2),
      },
    ],
  };
}

function toolError(err: unknown) {
  if (err instanceof DocsError) {
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: JSON.stringify({ code: err.code, message: err.message, detail: err.detail ?? null }, null, 2),
        },
      ],
    };
  }
  const message = err instanceof Error ? err.message : String(err);
  return {
    isError: true,
    content: [{ type: "text", text: JSON.stringify({ code: "internal_error", message }, null, 2) }],
  };
}

async function handleToolCall(name: string, args: Record<string, unknown>, actor: string) {
  switch (name) {
    case "list_sections": {
      const sections = await listSections(String(args.doc_slug));
      return textContent(
        sections.map((s) => ({
          heading: s.heading,
          position: s.position,
          version: s.version,
          updated_at: s.updated_at,
          preview: s.content.slice(0, 160),
        })),
      );
    }
    case "read_section": {
      const section = await readSection(String(args.doc_slug), String(args.heading));
      return textContent({
        doc_slug: section.doc_slug,
        heading: section.heading,
        version: section.version,
        updated_at: section.updated_at,
        content: section.content,
      });
    }
    case "create_section": {
      const section = await createSection(
        String(args.doc_slug),
        String(args.heading),
        String(args.content),
        actor,
        typeof args.position === "number" ? args.position : undefined,
      );
      return textContent({
        ok: true,
        heading: section.heading,
        position: section.position,
        version: section.version,
      });
    }
    case "append_section": {
      const section = await appendToSection(
        String(args.doc_slug),
        String(args.heading),
        String(args.content),
        actor,
        args.create_if_missing !== false,
      );
      return textContent({
        ok: true,
        heading: section.heading,
        version: section.version,
        length: section.content.length,
      });
    }
    case "patch_section": {
      const section = await patchSection(
        String(args.doc_slug),
        String(args.heading),
        String(args.content),
        Number(args.expected_version),
        actor,
      );
      return textContent({
        ok: true,
        heading: section.heading,
        version: section.version,
      });
    }
    case "rename_section": {
      const section = await renameSection(
        String(args.doc_slug),
        String(args.heading),
        String(args.new_heading),
        Number(args.expected_version),
        actor,
      );
      return textContent({
        ok: true,
        old_heading: String(args.heading),
        new_heading: section.heading,
        version: section.version,
      });
    }
    case "move_section": {
      const result = await moveSection(
        String(args.doc_slug),
        String(args.heading),
        Number(args.new_position),
        Number(args.expected_version),
        actor,
      );
      return textContent({ ok: true, ...result });
    }
    case "read_doc": {
      const doc = await readDoc(String(args.doc_slug));
      return textContent(doc);
    }
    case "delete_section": {
      const result = await deleteSection(
        String(args.doc_slug),
        String(args.heading),
        Number(args.expected_version),
        actor,
      );
      return textContent({ ok: true, ...result });
    }
    case "list_recent_changes": {
      const changes = await listRecentChanges(
        args.doc_slug ? String(args.doc_slug) : null,
        typeof args.limit === "number" ? args.limit : 20,
      );
      return textContent(changes);
    }
    default:
      throw new DocsError("invalid_input", `Unknown tool: ${name}`);
  }
}

async function dispatch(req: JsonRpcRequest, httpReq: NextRequest) {
  const id = req.id ?? null;
  try {
    switch (req.method) {
      case "initialize":
        return rpcResult(id, {
          protocolVersion: "2025-06-18",
          capabilities: { tools: { listChanged: false } },
          serverInfo: SERVER_INFO,
          instructions:
            "Atlas team docs (CONTEXT, BUILD) as section rows. Call list_sections to discover headings, read_section to load content + version, patch_section for atomic edits.",
        });
      case "notifications/initialized":
      case "notifications/cancelled":
        return null;
      case "tools/list":
        return rpcResult(id, { tools: TOOLS });
      case "tools/call": {
        const params = (req.params ?? {}) as { name?: string; arguments?: Record<string, unknown> };
        if (!params.name) {
          return rpcError(id, -32602, "missing tool name");
        }
        try {
          const out = await handleToolCall(params.name, params.arguments ?? {}, actorFromHeaders(httpReq));
          return rpcResult(id, out);
        } catch (err) {
          return rpcResult(id, toolError(err));
        }
      }
      case "ping":
        return rpcResult(id, {});
      default:
        return rpcError(id, -32601, `Method not found: ${req.method}`);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return rpcError(id, -32603, message);
  }
}

const BASE_URL = (
  process.env.NEXT_PUBLIC_MCP_BASE_URL ??
  process.env.NEXT_PUBLIC_BASE_URL ??
  "https://atlas-broker-uat.vercel.app"
).replace(/\/$/, "");

const WWW_AUTHENTICATE = `Bearer realm="atlas-mcp-docs", resource_metadata="${BASE_URL}/.well-known/oauth-protected-resource"`;

export async function POST(req: NextRequest) {
  if (!authorize(req)) {
    return NextResponse.json(
      { jsonrpc: "2.0", id: null, error: { code: -32001, message: "unauthorized" } },
      { status: 401, headers: { "WWW-Authenticate": WWW_AUTHENTICATE } },
    );
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { jsonrpc: "2.0", id: null, error: { code: -32700, message: "parse error" } },
      { status: 400 },
    );
  }
  if (Array.isArray(body)) {
    const responses = await Promise.all(body.map((m) => dispatch(m as JsonRpcRequest, req)));
    const filtered = responses.filter((r) => r !== null);
    return NextResponse.json(filtered, { status: 200 });
  }
  const response = await dispatch(body as JsonRpcRequest, req);
  if (response === null) {
    return new NextResponse(null, { status: 204 });
  }
  return NextResponse.json(response, { status: 200 });
}

export async function GET(req: NextRequest) {
  if (!authorize(req)) {
    return NextResponse.json(
      { error: "unauthorized" },
      { status: 401, headers: { "WWW-Authenticate": WWW_AUTHENTICATE } },
    );
  }
  return NextResponse.json({
    server: SERVER_INFO,
    transport: "http",
    method: "POST application/json with JSON-RPC 2.0 body",
    tools: TOOLS.map((t) => t.name),
  });
}
