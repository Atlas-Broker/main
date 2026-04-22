/**
 * One-shot seed script: migrate docs/ATLAS_CONTEXT.md + docs/ATLAS_PROGRESS.md
 * into atlas_docs_sections rows. Splits each file on H2 headings.
 *
 * Usage:
 *   cd frontend
 *   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_KEY=... \
 *     npx tsx scripts/seed-atlas-docs.ts
 *
 * Content before the first H2 becomes a "Preamble" section.
 * Running twice will skip sections that already exist (idempotent per heading).
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { readFile } from "fs/promises";
import { resolve } from "path";
import { createClient } from "@supabase/supabase-js";

interface ParsedSection {
  heading: string;
  content: string;
}

function parseMarkdown(source: string): ParsedSection[] {
  const lines = source.split("\n");
  const sections: ParsedSection[] = [];
  let currentHeading = "Preamble";
  let buffer: string[] = [];

  const flush = () => {
    const body = buffer.join("\n").trim();
    if (body.length > 0 || sections.length === 0) {
      sections.push({ heading: currentHeading, content: body });
    }
  };

  for (const line of lines) {
    const h2 = line.match(/^##\s+(.+?)\s*$/);
    if (h2) {
      flush();
      currentHeading = h2[1].trim();
      buffer = [];
    } else {
      buffer.push(line);
    }
  }
  flush();
  return sections.filter((s) => s.content.length > 0 || s.heading !== "Preamble");
}

async function seedDoc(
  client: any,
  slug: "CONTEXT" | "BUILD",
  filePath: string,
): Promise<void> {
  const source = await readFile(filePath, "utf8");
  const sections = parseMarkdown(source);
  console.log(`[${slug}] parsed ${sections.length} sections from ${filePath}`);

  for (let i = 0; i < sections.length; i++) {
    const { heading, content } = sections[i];
    const existing = await client
      .from("atlas_docs_sections")
      .select("id")
      .eq("doc_slug", slug)
      .eq("heading", heading)
      .eq("is_current", true)
      .maybeSingle();

    if (existing.data) {
      console.log(`  [${i}] skip (exists): ${heading}`);
      continue;
    }

    const inserted = await client
      .from("atlas_docs_sections")
      .insert({
        doc_slug: slug,
        heading,
        content,
        position: i,
        version: 1,
        updated_by: "seed-script",
      })
      .select("id, version, updated_at, updated_by")
      .single();

    if (inserted.error || !inserted.data) {
      throw new Error(`insert failed for ${slug}/${heading}: ${inserted.error?.message}`);
    }

    const section = inserted.data as { id: string; version: number; updated_at: string; updated_by: string | null };
    await client.from("atlas_docs_section_versions").insert({
      section_id: section.id,
      doc_slug: slug,
      heading,
      content,
      version: section.version,
      updated_at: section.updated_at,
      updated_by: section.updated_by,
      operation: "create",
    });
    console.log(`  [${i}] insert: ${heading}`);
  }
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_KEY must be set");
  }
  const client: any = createClient(url, key, { auth: { persistSession: false } });
  const docsDir = resolve(__dirname, "..", "..", "docs");

  await seedDoc(client, "CONTEXT", resolve(docsDir, "ATLAS_CONTEXT.md"));
  await seedDoc(client, "BUILD", resolve(docsDir, "ATLAS_PROGRESS.md"));
  console.log("seed complete");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
