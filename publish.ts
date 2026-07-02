/**
 * Publish this bridge as a Comical registry: emits `index.json` + the served bundle at the repo root
 * (commit them; Comical reads `<repo>/master/index.json` via raw.githubusercontent). Uses the local
 * comical CLI (../comical) for now — once `comical` ships to npm this becomes `bunx comical …`.
 *
 *   [COMICAL_BASE_URL=https://raw.githubusercontent.com/<owner>/comical-bridges/master] \
 *     [COMICAL_KEY=registry.key.json] bun run publish:registry
 */
import { join } from "node:path";

const ROOT = import.meta.dir;
const cli = join(ROOT, "..", "comical", "packages", "cli", "src", "index.ts");
const baseUrl =
  process.env.COMICAL_BASE_URL ??
  "https://raw.githubusercontent.com/pos5drow/comical-bridges/master";

const args = [
  "run", cli, "registry", "publish",
  "--bridges-dir", join(ROOT, ".build"),
  "--base-url", baseUrl,
  "--out", ROOT,
];
if (process.env.COMICAL_KEY) args.push("--key", process.env.COMICAL_KEY);

const proc = Bun.spawn(["bun", ...args], { stdout: "inherit", stderr: "inherit" });
process.exit(await proc.exited);
