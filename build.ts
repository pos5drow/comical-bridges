/**
 * Build all bridges to self-contained CJS bundles Comical can load. Output uses the transient
 * `.build/<id>/dist/bridge.js` layout (gitignored) so `comical registry publish --bridges-dir
 * ./.build` discovers them; the published index.json + served bundles land at the repo root.
 * @comical/* is resolved via tsconfig paths (local link to ../comical for now).
 */
import { join } from "node:path";

const ROOT = import.meta.dir;

// Some on-device bridge engines (JSC on iOS, QuickJS on Android) don't define a global `console`,
// so a bridge's diagnostic `console.log`/`console.error` throws a ReferenceError there — one
// bridge's `getSeriesPages` failed on-device with `"console" is not defined`. Prepend a no-op
// console shim that only installs when one is missing, so those logs become harmless no-ops on
// device while real consoles (Node/Bun on the server, Hermes in dev) are left untouched.
const CONSOLE_SHIM =
  "if(typeof console==='undefined'){var __noop=function(){};" +
  "globalThis.console={log:__noop,info:__noop,warn:__noop,error:__noop,debug:__noop,trace:__noop};}";

const bridges: Array<{ id: string; src: string }> = [
  { id: "atsumaru", src: "bridge.ts" },
  { id: "mangadex", src: "mangadex.ts" },
  { id: "weebcentral", src: "weebcentral.ts" },
  // MangaBox engine (src/engines/mangabox.ts) — a change there changes all three bundles.
  { id: "mangakakalot", src: "mangakakalot.ts" },
  { id: "manganato", src: "manganato.ts" },
  { id: "mangabat", src: "mangabat.ts" },
  { id: "asurascans", src: "asurascans.ts" },
  { id: "olympus", src: "olympus.ts" },
  { id: "manhwaweb", src: "manhwaweb.ts" },
  // MadTheme engine (src/engines/madtheme.ts) — a change there changes both bundles.
  { id: "mangak", src: "mangak.ts" },
  { id: "toonilyme", src: "toonilyme.ts" },
  // MangaTaro engine (src/engines/mangataro.ts) — a change there changes both bundles.
  { id: "mangataro", src: "mangataro.ts" },
  { id: "roliascan", src: "roliascan.ts" },
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
    banner: CONSOLE_SHIM,
  });

  if (!result.success) {
    for (const log of result.logs) console.error(log);
    throw new AggregateError(result.logs, `${id} bridge build failed`);
  }
  // Bun ends the bundle with a `//# debugId=` hashed from EVERY source the bundler read, tree-shaken
  // ones included — so a kit or SDK change a bridge doesn't even use still changed its bytes, and a
  // published version's bytes may never change. The source maps aren't published; drop the line.
  const out = join(ROOT, ".build", id, "dist", "bridge.js");
  const code = await Bun.file(out).text();
  await Bun.write(out, code.replace(/\n\/\/# debugId=[0-9A-F]+\s*$/, "\n"));
  console.log(`✓ built → .build/${id}/dist/bridge.js`);
}
