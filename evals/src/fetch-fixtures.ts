import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { loadManifest, fixtureCachePath } from "./fixtures";

for (const fixture of loadManifest()) {
  const response = await fetch(fixture.url);
  if (!response.ok) {
    throw new Error(
      `Fetch of fixture ${fixture.id} failed: ${response.status} ${response.statusText}`,
    );
  }
  const text = await response.text();
  const path = fixtureCachePath(fixture.id);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
  console.log(`cached ${fixture.id} (${text.length} bytes)`);
}
