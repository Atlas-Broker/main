import { createClient, SupabaseClient } from "@supabase/supabase-js";

export type DocSlug =
  | "CONTEXT"
  | "BUILD"
  | "INSTRUCTIONS"
  | "IDEAS"
  | "INTERIM_REPORT"
  | "FINAL_REPORT"
  | "BIWEEKLY_LOGS"
  | "INBOX"
  | "PROPOSAL"
  | "LOGS"
  | "LEARNINGS"
  | "BRAND";
export const KNOWN_SLUGS: readonly DocSlug[] = [
  "CONTEXT",
  "BUILD",
  "INSTRUCTIONS",
  "IDEAS",
  "INTERIM_REPORT",
  "FINAL_REPORT",
  "BIWEEKLY_LOGS",
  "INBOX",
  "PROPOSAL",
  "LOGS",
  "LEARNINGS",
  "BRAND",
] as const;

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
      | "invalid_input"
      | "invalid_position",
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

export interface MoveResult {
  heading: string;
  old_position: number;
  new_position: number;
  version: number;
}

export async function moveSection(
  slug: string,
  heading: string,
  newPosition: number,
  expectedVersion: number,
  updatedBy: string,
): Promise<MoveResult> {
  assertSlug(slug);
  if (!Number.isInteger(newPosition) || newPosition < 0) {
    throw new DocsError("invalid_position", "new_position must be a non-negative integer");
  }
  const client = serviceClient();
  const current = await readSection(slug, heading);
  if (current.version !== expectedVersion) {
    throw new DocsError("version_conflict", "section was modified since you read it", {
      actual_version: current.version,
      expected_version: expectedVersion,
    });
  }
  const oldPosition = current.position;
  if (oldPosition === newPosition) {
    return {
      heading: current.heading,
      old_position: oldPosition,
      new_position: newPosition,
      version: current.version,
    };
  }

  // Strategy to avoid unique (doc_slug, position) collisions if one ever exists,
  // and keep ordering sane: park the moving section at a sentinel negative position,
  // shift the affected range, then drop the moving section into the target slot.
  const SENTINEL = -1;
  const parked = await client
    .from("atlas_docs_sections")
    .update({ position: SENTINEL })
    .eq("id", current.id)
    .eq("version", expectedVersion)
    .select("id")
    .maybeSingle();
  if (parked.error) throw new Error(`moveSection park failed: ${parked.error.message}`);
  if (!parked.data) {
    throw new DocsError("version_conflict", "concurrent update detected");
  }

  // Shift sibling positions. Moving down (newPosition > oldPosition): sections
  // with position in (oldPosition, newPosition] shift -1. Moving up
  // (newPosition < oldPosition): sections with position in [newPosition, oldPosition)
  // shift +1.
  const { data: siblings, error: siblingsErr } = await client
    .from("atlas_docs_sections")
    .select("id, position")
    .eq("doc_slug", slug)
    .eq("is_current", true)
    .neq("id", current.id);
  if (siblingsErr) throw new Error(`moveSection siblings failed: ${siblingsErr.message}`);

  const shifts: { id: string; position: number }[] = [];
  for (const row of siblings ?? []) {
    const pos = row.position as number;
    const id = row.id as string;
    if (newPosition > oldPosition) {
      if (pos > oldPosition && pos <= newPosition) {
        shifts.push({ id, position: pos - 1 });
      }
    } else {
      if (pos >= newPosition && pos < oldPosition) {
        shifts.push({ id, position: pos + 1 });
      }
    }
  }

  // Apply shifts sequentially. To avoid transient collisions when moving up
  // (positions shift +1), process from highest to lowest; for moving down
  // (positions shift -1), process from lowest to highest.
  shifts.sort((a, b) =>
    newPosition > oldPosition ? a.position - b.position : b.position - a.position,
  );
  for (const s of shifts) {
    const { error: shiftErr } = await client
      .from("atlas_docs_sections")
      .update({ position: s.position })
      .eq("id", s.id);
    if (shiftErr) throw new Error(`moveSection shift failed: ${shiftErr.message}`);
  }

  const nextVersion = current.version + 1;
  const { data, error } = await client
    .from("atlas_docs_sections")
    .update({
      position: newPosition,
      version: nextVersion,
      updated_at: new Date().toISOString(),
      updated_by: updatedBy,
    })
    .eq("id", current.id)
    .select("id, doc_slug, heading, content, position, version, updated_at, updated_by")
    .single();
  if (error) throw new Error(`moveSection finalize failed: ${error.message}`);
  const updated = data as Section;
  await writeVersion(client, updated, "move");
  return {
    heading: updated.heading,
    old_position: oldPosition,
    new_position: updated.position,
    version: updated.version,
  };
}

export interface ReadDocResult {
  doc_slug: DocSlug;
  content: string;
  sections: Array<{
    heading: string;
    position: number;
    version: number;
    updated_at: string;
  }>;
  generated_at: string;
}

export async function readDoc(slug: string): Promise<ReadDocResult> {
  assertSlug(slug);
  const sections = await listSections(slug);
  const content = sections
    .map((s) => `## ${s.heading}\n\n${s.content}`.trimEnd())
    .join("\n\n");
  return {
    doc_slug: slug as DocSlug,
    content,
    sections: sections.map((s) => ({
      heading: s.heading,
      position: s.position,
      version: s.version,
      updated_at: s.updated_at,
    })),
    generated_at: new Date().toISOString(),
  };
}

export interface DeleteResult {
  heading: string;
  deleted: true;
  version: number;
}

export async function deleteSection(
  slug: string,
  heading: string,
  expectedVersion: number,
  updatedBy: string,
): Promise<DeleteResult> {
  assertSlug(slug);
  const client = serviceClient();
  const current = await readSection(slug, heading);
  if (current.version !== expectedVersion) {
    throw new DocsError("version_conflict", "section was modified since you read it", {
      actual_version: current.version,
      expected_version: expectedVersion,
    });
  }
  const nextVersion = current.version + 1;
  const { data, error } = await client
    .from("atlas_docs_sections")
    .update({
      is_current: false,
      version: nextVersion,
      updated_at: new Date().toISOString(),
      updated_by: updatedBy,
    })
    .eq("id", current.id)
    .eq("version", expectedVersion)
    .select("id, doc_slug, heading, content, position, version, updated_at, updated_by")
    .single();
  if (error) throw new Error(`deleteSection failed: ${error.message}`);
  if (!data) {
    throw new DocsError("version_conflict", "concurrent update detected");
  }
  const deleted = data as Section;
  await writeVersion(client, deleted, "delete");
  return {
    heading: deleted.heading,
    deleted: true,
    version: deleted.version,
  };
}

export interface DocSummary {
  slug: DocSlug;
  section_count: number;
  last_updated_at: string | null;
}

export async function listDocs(): Promise<DocSummary[]> {
  const client = serviceClient();
  const { data, error } = await client
    .from("atlas_docs_sections")
    .select("doc_slug, updated_at")
    .eq("is_current", true)
    .order("doc_slug", { ascending: true });
  if (error) throw new Error(`listDocs failed: ${error.message}`);

  const grouped = new Map<string, { count: number; latest: string | null }>();
  for (const row of data ?? []) {
    const slug = row.doc_slug as string;
    const entry = grouped.get(slug) ?? { count: 0, latest: null };
    const rowAt = row.updated_at as string | null;
    grouped.set(slug, {
      count: entry.count + 1,
      latest: !entry.latest || (rowAt && rowAt > entry.latest) ? rowAt : entry.latest,
    });
  }

  return [...grouped.entries()].map(([slug, { count, latest }]) => ({
    slug: slug as DocSlug,
    section_count: count,
    last_updated_at: latest,
  }));
}
