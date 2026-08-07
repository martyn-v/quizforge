import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import { z } from "zod/v4";

const ManifestSchema = z.object({
  fixtures: z.array(
    z.object({
      id: z.string(),
      shape: z.string(),
      url: z.string().url(),
    }),
  ),
});

export type Fixture = z.infer<typeof ManifestSchema>["fixtures"][number];

const fixturesDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "fixtures",
);

/** Reads and validates fixtures/manifest.json. */
export function loadManifest(): Fixture[] {
  const raw = readFileSync(join(fixturesDir, "manifest.json"), "utf8");
  return ManifestSchema.parse(JSON.parse(raw)).fixtures;
}

/** Returns the cache file path for a fixture id. */
export function fixtureCachePath(id: string): string {
  return join(fixturesDir, "cache", `${id}.md`);
}

/** Reads a cached fixture. Throws when the cache is empty. */
export function loadFixtureSource(id: string): string {
  const path = fixtureCachePath(id);
  if (!existsSync(path)) {
    throw new Error(
      `Fixture ${id} is not cached. Run "pnpm eval:fixtures" first.`,
    );
  }
  return readFileSync(path, "utf8");
}
