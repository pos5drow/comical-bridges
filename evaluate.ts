/**
 * Self-test: load the built bundle through @comical/core and run the coverage evaluator against the
 * live backend. Set ATSU_USER / ATSU_PASS to also exercise favorites. Exits non-zero on a hard fail.
 *
 *   bun run evaluate
 *   ATSU_USER=you ATSU_PASS=… bun run evaluate
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { loadBridge } from "@comical/core";
import { createBunHost } from "@comical/host-bun";
import { evaluateBridge } from "@comical/testkit";

const code = readFileSync(join(import.meta.dir, ".build", "atsumaru", "dist", "bridge.js"), "utf8");

const settings: Record<string, string> = {};
if (process.env.ATSU_USER) settings.username = process.env.ATSU_USER;
if (process.env.ATSU_PASS) settings.password = process.env.ATSU_PASS;

const bridge = loadBridge({
  code,
  capabilities: createBunHost({ bridgeId: "atsumaru", settings }),
  expectedId: "atsumaru",
});

const report = await evaluateBridge(bridge, { searchQuery: "spy" });
const icon = { pass: "✓", warn: "⚠", fail: "✗" } as const;
for (const r of report.results) console.log(`  ${icon[r.severity]} [${r.capability}] ${r.message}`);
const s = report.summary;
console.log(`\n${s.pass} pass · ${s.warn} warn · ${s.fail} fail — ${s.verdict.toUpperCase()}`);
console.log(`coverage: ${s.capabilitiesExercised.length}/${s.capabilitiesDeclared.length} capabilities exercised`);
process.exit(s.verdict === "fail" ? 1 : 0);
