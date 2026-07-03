/**
 * Build all bridges to self-contained CJS bundles Comical can load. Output uses the transient
 * `.build/<id>/dist/bridge.js` layout (gitignored) so `comical registry publish --bridges-dir
 * ./.build` discovers them; the published index.json + served bundles land at the repo root.
 * @comical/* is resolved via tsconfig paths (local link to ../comical for now).
 */
import { join } from "node:path";

const ROOT = import.meta.dir;

const bridges: Array<{ id: string; src: string }> = [
  { id: "atsumaru", src: "bridge.ts" },
  { id: "mangadex", src: "mangadex.ts" },
  { id: "nhentai", src: "nhentai.ts" },
  { id: "e-hentai", src: "ehentai.ts" },
];

for (const { id, src } of bridges) {
  const result = await Bun.build({
    entrypoints: [join(ROOT, "src", src)],
    outdir: join(ROOT, ".build", id, "dist"),
    target: "browser",
    format: "cjs",
    naming: "bridge.js",
    minify: false,
    sourcemap: "external",
  });

  if (!result.success) {
    for (const log of result.logs) console.error(log);
    throw new AggregateError(result.logs, `${id} bridge build failed`);
  }
  console.log(`✓ built → .build/${id}/dist/bridge.js`);
}
