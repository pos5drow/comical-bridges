/**
 * Build the bridge to a self-contained CJS bundle Comical can load. Output uses the transient
 * `.build/<id>/dist/bridge.js` layout (gitignored) so `comical registry publish --bridges-dir
 * ./.build` discovers it; the published index.json + served bundle land at the repo root.
 * @comical/* is resolved via tsconfig paths (local link to ../comical for now).
 */
import { join } from "node:path";

const ROOT = import.meta.dir;
const result = await Bun.build({
  entrypoints: [join(ROOT, "src", "bridge.ts")],
  outdir: join(ROOT, ".build", "atsumaru", "dist"),
  target: "browser",
  format: "cjs",
  naming: "bridge.js",
  minify: false,
  sourcemap: "external",
});

if (!result.success) {
  for (const log of result.logs) console.error(log);
  throw new AggregateError(result.logs, "bridge build failed");
}
console.log("✓ built → .build/atsumaru/dist/bridge.js");
