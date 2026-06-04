/**
 * Favorites round-trip against a REAL atsu.moe account — self-restoring.
 *
 * Reads credentials from a gitignored `.creds.json` ({"username":"…","password":"…"}) so they never
 * touch the shell history or any transcript. Run AFTER `bun run build`:
 *
 *   bun run test-favorites.ts
 *
 * What it does (and undoes):
 *   1. login (lazy, via the favorites path) + getFavorites() → baseline snapshot
 *   2. pick a trending series you do NOT already have bookmarked
 *   3. addFavorite(it) → getFavorites() asserts it appears
 *   4. removeFavorite(it) → getFavorites() asserts your list is back to the exact baseline
 * The password is never printed. If a step fails mid-way it tells you what (if anything) to undo.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { loadBridge } from "@comical/core";
import { createBunHost } from "@comical/host-bun";

const ROOT = import.meta.dir;
const credsPath = join(ROOT, ".creds.json");
if (!existsSync(credsPath)) {
  console.error(`✗ no ${credsPath} — create it with {"username":"…","password":"…"} (gitignored).`);
  process.exit(2);
}
const { username, password } = JSON.parse(readFileSync(credsPath, "utf8")) as {
  username?: string;
  password?: string;
};
if (!username || !password) {
  console.error("✗ .creds.json must contain non-empty username + password.");
  process.exit(2);
}

const bundle = join(ROOT, ".build", "atsumaru", "dist", "bridge.js");
if (!existsSync(bundle)) {
  console.error(`✗ no built bundle at ${bundle} — run \`bun run build\` first.`);
  process.exit(2);
}

const bridge = loadBridge({
  code: readFileSync(bundle, "utf8"),
  capabilities: createBunHost({ bridgeId: "atsumaru", settings: { username, password } }),
  expectedId: "atsumaru",
});

const ids = (r: { items: { id: string }[] }) => new Set(r.items.map((i) => i.id));
let added: string | undefined; // track for cleanup messaging on failure

try {
  // 1. Baseline (this also forces the lazy login + exercises the core cookie jar).
  console.log(`logging in as "${username}" and reading favorites…`);
  const baseline = await bridge.getFavorites!(1);
  const baseIds = ids(baseline);
  console.log(`✓ login + getFavorites → ${baseline.items.length} existing favorite(s)`);

  // 2. Pick a trending series not already bookmarked.
  const trending = await bridge.getListItems!("trending", 1);
  const candidate = trending.items.find((s) => !baseIds.has(s.id));
  if (!candidate) {
    console.log("• every trending series is already in your favorites — skipping the mutation test.");
    process.exit(0);
  }
  console.log(`  test series: "${candidate.title}" (${candidate.id})`);

  // 3. Add → verify present.
  await bridge.addFavorite!(candidate.id);
  added = candidate.id;
  const afterAdd = await bridge.getFavorites!(1);
  if (!ids(afterAdd).has(candidate.id)) {
    throw new Error("addFavorite did not show up in getFavorites");
  }
  console.log(`✓ addFavorite → now ${afterAdd.items.length} favorite(s), test series present`);

  // 4. Remove → verify gone + list restored to baseline.
  await bridge.removeFavorite!(candidate.id);
  added = undefined;
  const afterRemove = await bridge.getFavorites!(1);
  const restoredIds = ids(afterRemove);
  if (restoredIds.has(candidate.id)) throw new Error("removeFavorite left the series in the list");
  const sameAsBaseline =
    restoredIds.size === baseIds.size && [...baseIds].every((id) => restoredIds.has(id));
  if (!sameAsBaseline) throw new Error("favorites list does not match the original baseline after cleanup");
  console.log(`✓ removeFavorite → back to ${afterRemove.items.length} favorite(s), baseline restored`);

  console.log("\nPASS — favorites round-trip works (login, read, add, remove) and your account is unchanged.");
} catch (e) {
  console.error(`\n✗ FAIL: ${e instanceof Error ? e.message : e}`);
  if (added) console.error(`  ⚠ cleanup: the test series ${added} may still be bookmarked — remove it manually.`);
  process.exit(1);
}
