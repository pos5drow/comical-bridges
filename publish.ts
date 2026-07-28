/**
 * Publish this repo as ONE Comical registry, served from the repo root via raw.githubusercontent
 * (`index.json` + `bridges/**`).
 *
 * This repo used to publish **two** rating-split registries out of one build — `sfw/` and `nsfw/`.
 * The adult bridges now live in their own repo (`comical-bridges-nsfw`), so what's left here is
 * simply "the bridges", published at the root. Both old URLs stay alive as **signed tombstones**
 * that forward to wherever their bridges actually went:
 *
 *   <base>/index.json        the registry (was <base>/sfw/index.json)
 *   <base>/sfw/index.json    tombstone → <base>/index.json
 *   <base>/nsfw/index.json   tombstone → the comical-bridges-nsfw registry
 *
 * `--moved-to` (asserted by the old host) forwards clients that still hold the old URL;
 * `--moved-from` (asserted by the new host) lets someone re-adding a URL by hand adopt their
 * existing installs instead of stranding them. Both are wanted — see "Moving a registry" in the
 * comical README.
 *
 * **Every one of these must be signed with the same key as before.** A client follows a move only
 * when the forwarding index carries the key it already pinned for that URL — key continuity is the
 * whole proof that the same operator is behind both ends. An unsigned tombstone doesn't forward
 * anyone; it parks the move for manual confirmation.
 *
 * Uses the local comical CLI (../comical) for now — once `comical` ships to npm this becomes
 * `bunx comical …`.
 *
 *   [COMICAL_BASE_URL=https://raw.githubusercontent.com/<owner>/comical-bridges/main] \
 *     [COMICAL_KEY=registry.key.json] bun run publish:registry
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = import.meta.dir;
const cli = join(ROOT, "..", "comical", "packages", "cli", "src", "index.ts");
const baseUrl =
  process.env.COMICAL_BASE_URL ??
  "https://raw.githubusercontent.com/pos5drow/comical-bridges/main";

/** Where the adult bridges moved to. Their old `nsfw/` URL forwards here. */
const NSFW_REGISTRY = "https://raw.githubusercontent.com/pos5drow/comical-bridges-nsfw/main/index.json";

const key = process.env.COMICAL_KEY;
const withKey = (args: string[]): string[] => (key ? [...args, "--key", key] : args);

async function run(label: string, args: string[]): Promise<void> {
  console.log(`\n── ${label} ──`);
  const proc = Bun.spawn(["bun", "run", cli, "registry", "publish", ...args], {
    stdout: "inherit",
    stderr: "inherit",
  });
  const code = await proc.exited;
  if (code !== 0) process.exit(code);
}

// 1. The registry itself, at the repo root. `movedFrom` names the old sfw/ URL so re-adding by hand
//    adopts installs made from it.
await run(
  "Publishing registry (root)",
  withKey([
    "--bridges-dir", join(ROOT, ".build"),
    "--base-url", baseUrl,
    "--out", ROOT,
    "--moved-from", `${baseUrl}/sfw/index.json`,
  ]),
);

// Deterministic ordering. The CLI emits bridges in filesystem-discovery order, which differs
// between machines/CI and reshuffles index.json on every publish — noisy diffs and a fresh commit
// each time from the publish CI. Sort by id so republishing byte-identical bundles is a no-op
// except the `updated` timestamp (which CI ignores). Matches the CLI's exact serialization
// (2-space indent, no trailing newline) so this reorders and nothing else.
const indexPath = join(ROOT, "index.json");
const index = JSON.parse(readFileSync(indexPath, "utf8")) as {
  bridges?: { id: string }[];
  trackers?: { id: string }[];
};
const byId = (a: { id: string }, b: { id: string }) => a.id.localeCompare(b.id);
index.bridges?.sort(byId);
index.trackers?.sort(byId);
writeFileSync(indexPath, JSON.stringify(index, null, 2));

// 2. The two tombstones. Each is just a forwarding note — no bridges, no bundles.
await run(
  "Publishing sfw/ tombstone → root",
  withKey(["--tombstone", "--moved-to", `${baseUrl}/index.json`, "--out", join(ROOT, "sfw")]),
);
await run(
  "Publishing nsfw/ tombstone → comical-bridges-nsfw",
  withKey(["--tombstone", "--moved-to", NSFW_REGISTRY, "--out", join(ROOT, "nsfw")]),
);

process.exit(0);
