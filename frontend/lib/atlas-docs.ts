import { createClient, SupabaseClient } from "@supabase/supabase-js";

export type DocSlug = "CONTEXT" | "BUILD";
export const KNOWN_SLUGS: readonly DocSlug[] = ["CONTEXT", "BUILD"] as const;

export interface Section {
  id: string;
  doc_slug: DocSlug;
  heading: string;
  content: string;
  position: number;
  version: number;
  updated_at: string;
  updated_by: string | null;
}

export interface RecentChange {
  doc_slug: DocSlug;
  heading: string;
  version: number;
  updated_at: string;
  updated_by: string | null;
  operation: string;
}

export class DocsError extends Error {
  constructor(
    public code:
      | "not_found"
      | "version_conflict"
      | "content_non_empty"
      | "invalid_slug"
      | "duplicate_heading"
      | "invalid_input",
    message: string,
    public detail?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "DocsError";
  }
}

function serviceClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    throw new Error("Supabase service credentials not configured");
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

function assertSlug(slug: string): asserts slug is DocSlug {
  if (!KNOWN_SLUGS.includes(slug as DocSlug)) {
    throw new DocsError(
      "invalid_slug",
      `Unknown doc_slug "${slug}". Valid: ${KNOWN_SLUGS.join(", ")}`,
    );
  }
}

export async function listSections(slug: string): Promise<Section[]> {
  assertSlug(slug);
  const { data, error } = await serviceClient()
    .from("atlas_docs_sections")
    .select("id, doc_slug, heading, content, position, version, updated_at, updated_by")
    .eq("doc_slug", slug)
    .eq("is_current", true)
    .order("position", { ascending: true });
  if (error) throw new Error(`listSections failed: ${error.message}`);
  return (data ?? []) as Section[];
}

export async function readSection(slug: string, heading: string): Promise<Section> {
  assertSlug(slug);
  const { data, error } = await serviceClient()
    .from("atlas_docs_sections")
    .select("id, doc_slug, heading, content, position, version, updated_at, updated_by")
    .eq("doc_slug", slug)
    .eq("heading", heading)
    .eq("is_current", true)
    .maybeSingle();
  if (error) throw new Error(`readSection failed: ${error.message}`);
  if (!data) {
    throw new DocsError("not_found", `Section "${heading}" not found in ${slug}`);
  }
  return data as Section;
}

async function nextPosition(client: SupabaseClient, slug: DocSlug): Promise<number> {
  const { data, error } = await client
    .from("atlas_docs_sections")
    .select("position")
    .eq("doc_slug", slug)
    .eq("is_current", true)
    .order("position", { ascending: false })
    .limit(1);
  if (error) throw new Error(`nextPosition failed: ${error.message}`);
  if (!data || data.length === 0) return 0;
  return (data[0].position as number) + 1;
}

async function writeVersion(
  client: SupabaseClient,
  section: Section,
  operation: "create" | "patch" | "append" | "delete" | "move" | "rename",
): Promise<void> {
  const { error } = await client.from("atlas_docs_section_versions").insert({
    section_id: section.id,
    doc_slug: section.doc_slug,
    heading: section.heading,
    content: section.content,
    version: section.version,
    updated_at: section.updated_at,
    updated_by: section.updated_by,
    operation,
  });
  if (error) throw new Error(`writeVersion failed: ${error.message}`);
}

export async function createSection(
  slug: string,
  heading: string,
  content: string,
  updatedBy: string,
  position?: number,
): Promise<Section> {
  assertSlug(slug);
  if (!heading.trim()) throw new DocsError("invalid_input", "heading required");
  const client = serviceClient();
  const existing = await client
    .from("atlas_docs_sections")
    .select("id")
    .eq("doc_slug", slug)
    .eq("heading", heading)
    .eq("is_current", true)
    .maybeSingle();
  if (existing.data) {
    throw new DocsError("duplicate_heading", `Section "${heading}" already exists in ${slug}`);
  }
  const pos = position ?? (await nextPosition(client, slug));
  const { data, error } = await client
    .from("atlas_docs_sections")
    .insert({
      doc_slug: slug,
      heading,
      content,
      position: pos,
      version: 1,
      updated_by: updatedBy,
    })
    .select("id, doc_slug, heading, content, position, version, updated_at, updated_by")
    .single();
  if (error) throw new Error(`createSection failed: ${error.message}`);
  const section = data as Section;
  await writeVersion(client, section, "create");
  return section;
}

export async function appendToSection(
  slug: string,
  heading: string,
  content: string,
  updatedBy: string,
  createIfMissing: boolean = true,
): Promise<Section> {
  assertSlug(slug);
  const client = serviceClient();
  const { data: row, error: readErr } = await client
    .from("atlas_docs_sections")
    .select("id, doc_slug, heading, content, position, version, updated_at, updated_by")
    .eq("doc_slug", slug)
    .eq("heading", heading)
    .eq("is_current", true)
    .maybeSingle();
  if (readErr) throw new Error(`appendToSection read failed: ${readErr.message}`);
  if (!row) {
    if (!createIfMissing) {
      throw new DocsError("not_found", `Section "${heading}" not found in ${slug}`);
    }
    return createSection(slug, heading, content, updatedBy);
  }
  const current = row as Section;
  const merged = current.content ? `${current.content}\n\n${content}` : content;
  const nextVersion = current.version + 1;
  const { data, error } = await client
    .from("atlas_docs_sections")
    .update({
      content: merged,
      version: nextVersion,
      updated_at: new Date().toISOString(),
      updated_by: updatedBy,
    })
    .eq("id", current.id)
    .eq("version", current.version)
    .select("id, doc_slug, heading, content, position, version, updated_at, updated_by")
    .single();
  if (error) throw new Error(`appendToSection update failed: ${error.message}`);
  const updated = data as Section;
  await writeVersion(client, updated, "append");
  return updated;
}

export async function patchSection(
  slug: string,
  heading: string,
  newContent: string,
  expectedVersion: number,
  updatedBy: string,
): Promise<Section> {
  assertSlug(slug);
  const client = serviceClient();
  const current = await readSection(slug, heading);
  if (current.version !== expectedVersion) {
    throw new DocsError("version_conflict", "section was modified since you read it", {
      actual_version: current.version,
      expected_version: expectedVersion,
      current_content: current.content,
    });
  }
  const nextVersion = current.version + 1;
  const { data, error } = await client
    .from("atlas_docs_sections")
    .update({
      content: newContent,
      version: nextVersion,
      updated_at: new Date().toISOString(),
      updated_by: updatedBy,
    })
    .eq("id", current.id)
    .eq("version", expectedVersion)
    .select("id, doc_slug, heading, content, position, version, updated_at, updated_by")
    .single();
  if (error) throw new Error(`patchSection failed: ${error.message}`);
  if (!data) {
    throw new DocsError("version_conflict", "concurrent update detected");
  }
  const updated = data as Section;
  await writeVersion(client, updated, "patch");
  return updated;
}

export async function listRecentChanges(
  slug: string | null,
  limit: number = 20,
): Promise<RecentChange[]> {
  if (slug) assertSlug(slug);
  const client = serviceClient();
  const capped = Math.min(Math.max(limit, 1), 100);
  let q = client
    .from("atlas_docs_section_versions")
    .select("doc_slug, heading, version, updated_at, updated_by, operation")
    .order("updated_at", { ascending: false })
    .limit(capped);
  if (slug) q = q.eq("doc_slug", slug);
  const { data, error } = await q;
  if (error) throw new Error(`listRecentChanges failed: ${error.message}`);
  return (data ?? []) as RecentChange[];
}

export async function renameSection(
  slug: string,
  heading: string,
  newHeading: string,
  expectedVersion: number,
  updatedBy: string,
): Promise<Section> {
  assertSlug(slug);
  if (!newHeading.trim()) throw new DocsError("invalid_input", "new heading required");
  const client = serviceClient();
  const current = await readSection(slug, heading);
  if (current.version !== expectedVersion) {
    throw new DocsError("version_conflict", "section was modified since you read it", {
      actual_version: current.version,
      expected_version: expectedVersion,
    });
  }
  const collision = await client
    .from("atlas_docs_sections")
    .select("id")
    .eq("doc_slug", slug)
    .eq("heading", newHeading)
    .eq("is_current", true)
    .maybeSingle();
  if (collision.data) {
    throw new DocsError("duplicate_heading", `Section "${newHeading}" already exists in ${slug}`);
  }
  const nextVersion = current.version + 1;
  const { data, error } = await client
    .from("atlas_docs_sections")
    .update({
      heading: newHeading,
      version: nextVersion,
      updated_at: new Date().toISOString(),
      updated_by: updatedBy,
    })
    .eq("id", current.id)
    .eq("version", expectedVersion)
    .select("id, doc_slug, heading, content, position, version, updated_at, updated_by")
    .single();
  if (error) throw new Error(`renameSection failed: ${error.message}`);
  const updated = data as Section;
  await writeVersion(client, updated, "rename");
  return updated;
}
