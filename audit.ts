/**
 * Nightly LIVE bridge audit. For every built bridge it runs the shared conformance evaluator
 * (`@comical/testkit`) against the real backend AND measures thumbnail sizes, then prints a status
 * table. With `--write` it rewrites the README's BRIDGE-STATUS block. Exits non-zero ONLY if a
 * NON-flaky bridge has a real (non-transient) failure — flaky/blocked bridges show ⚠, never fail the run.
 *
 *   bun run audit            # print the table
 *   bun run audit --write    # + update README.md
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadBridge } from "@comical/core";
import { createBunHost } from "@comical/host-bun";
import { defaultAssetFetcher, evaluateBridge, type EvaluationReport } from "@comical/testkit";
import { AUDIT, type BridgeAuditConfig } from "./audit.config.ts";

const ROOT = import.meta.dir;
const README = join(ROOT, "README.md");
const START = "<!-- BRIDGE-STATUS:START -->";
const END = "<!-- BRIDGE-STATUS:END -->";

interface Row {
  id: string;
  icon: "✓" | "⚠" | "✗";
  pass: number;
  warn: number;
  fail: number;
  caps: string; // "N/M"
  cover: string; // "80 KB (360×540)"
  note: string;
  hardFail: boolean; // a real fail on a NON-flaky bridge → the whole run fails
}

const coverCell = (report: EvaluationReport): string => {
  const m = report.metrics;
  if (!m || m.sampled === 0) return "—";
  const kb = Math.round(m.bytes.avg / 1024);
  const dim = m.dimensions ? ` (${m.dimensions.avgWidth}×${m.dimensions.avgHeight})` : "";
  return `${kb} KB${dim}`;
};

async function auditOne(id: string, cfg: BridgeAuditConfig): Promise<Row> {
  let report: EvaluationReport;
  try {
    const code = readFileSync(join(ROOT, ".build", id, "dist", "bridge.js"), "utf8");
    const capabilities = createBunHost({ bridgeId: id, settings: cfg.settings ?? {} });
    // No `expectedId`: the built bundle carries the publisher-namespaced id (e.g. "pos5drow.atsumaru"),
    // and the audit keys off the `.build/<dir>` name, so we load whatever id the bundle declares.
    const bridge = loadBridge({ code, capabilities });
    report = await evaluateBridge(bridge, { searchQuery: cfg.searchQuery ?? "", fetchAsset: defaultAssetFetcher });
  } catch (e) {
    // A load/setup failure (missing build, bad bundle) — real unless the bridge is tagged flaky.
    const message = e instanceof Error ? e.message : String(e);
    return {
      id,
      icon: cfg.flaky ? "⚠" : "✗",
      pass: 0,
      warn: 0,
      fail: cfg.flaky ? 0 : 1,
      caps: "0/0",
      cover: "—",
      note: `load failed: ${message}`,
      hardFail: !cfg.flaky,
    };
  }

  const { pass, warn, fail } = report.summary;
  const realFailUntolerated = fail > 0 && !cfg.flaky;
  const icon: Row["icon"] = realFailUntolerated ? "✗" : fail > 0 || warn > 0 ? "⚠" : "✓";
  return {
    id,
    icon,
    pass,
    warn,
    fail,
    caps: `${report.summary.capabilitiesExercised.length}/${report.summary.capabilitiesDeclared.length}`,
    cover: coverCell(report),
    note: cfg.flaky && fail > 0 ? `flaky (tolerated): ${cfg.flaky}` : (cfg.flaky ?? ""),
    hardFail: realFailUntolerated,
  };
}

function renderTable(rows: Row[]): string {
  const date = new Date().toISOString().slice(0, 10);
  const head = "| Bridge | Status | Capabilities | Avg cover | Notes |\n|---|---|---|---|---|";
  const body = rows
    .map((r) => `| \`${r.id}\` | ${r.icon} (${r.pass}✓ ${r.warn}⚠ ${r.fail}✗) | ${r.caps} | ${r.cover} | ${r.note || "—"} |`)
    .join("\n");
  return `${head}\n${body}\n\n_Updated ${date} by the nightly live audit ([\`audit.ts\`](audit.ts))._`;
}

function writeReadme(md: string): void {
  const src = readFileSync(README, "utf8");
  const s = src.indexOf(START);
  const e = src.indexOf(END);
  if (s < 0 || e < 0) throw new Error(`README is missing ${START} / ${END} markers`);
  writeFileSync(README, `${src.slice(0, s + START.length)}\n${md}\n${src.slice(e)}`);
}

const rows: Row[] = [];
for (const [id, cfg] of Object.entries(AUDIT)) {
  process.stderr.write(`auditing ${id}…\n`);
  rows.push(await auditOne(id, cfg));
}

const md = renderTable(rows);
console.log(md);

if (process.argv.includes("--write")) {
  writeReadme(md);
  process.stderr.write("README BRIDGE-STATUS block updated.\n");
}

const hard = rows.filter((r) => r.hardFail);
if (hard.length > 0) {
  process.stderr.write(`\nHARD FAIL (untolerated): ${hard.map((r) => r.id).join(", ")}\n`);
  process.exit(1);
}
